import { fileURLToPath } from "node:url";
import { expect, test, type Page } from "@playwright/test";

/** An impedance sweep of a finished box (the engine's REW cross-check). */
const ZMA = fileURLToPath(new URL("../../engine/test/fixtures/crosscheck/xsim/system.zma", import.meta.url));

/** The demo project's charts at this window size, the start dialog closed. */
async function demo(page: Page, width: number, height: number) {
  await page.setViewportSize({ width, height });
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.goto("/");
  await page.getByText("Explore the live demo project").click();
  await page.locator('figure[data-chart="response"] svg[role=img]').waitFor();
}

/** Charts on screen, in the order they show (their slot), with where and how big each is drawn. */
const onScreen = (page: Page) =>
  page.$$eval("figure.chart", (figs) =>
    figs
      .filter((f) => (f as HTMLElement).offsetParent !== null)
      .map((f) => {
        const r = f.getBoundingClientRect();
        const vb = f.querySelector<SVGSVGElement>("svg[role=img]")!.viewBox.baseVal;
        return { id: (f as HTMLElement).dataset.chart!, x: Math.round(r.x), y: Math.round(r.y), w: vb.width, h: vb.height };
      })
      .sort((a, b) => a.y - b.y || a.x - b.x),
  );

test.describe("desktop charts", () => {
  test.skip(({ isMobile }) => isMobile, "desktop layouts");

  for (const [w, h, drawn] of [
    [1280, 900, [828, 378]],
    [1366, 768, [914, 323]],
    [1440, 900, [988, 378]],
  ] as const) {
    test(`${w} × ${h}: one per row, chart menus, no tab row or per-row switch`, async ({ page }) => {
      await demo(page, w, h);
      const charts = await onScreen(page);
      expect(charts.map((c) => c.id)).toEqual(["response", "excursion", "maxspl"]);
      expect(charts.every((c) => c.w === drawn[0] && c.h >= drawn[1])).toBe(true);
      await expect(page.getByRole("tablist", { name: "More charts" })).toHaveCount(0);
      await expect(page.getByRole("group", { name: "Charts per row" })).toHaveCount(0);
      await expect(page.getByRole("button", { name: "Chart: Max SPL" })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    });
  }

  test("1920 × 1080: two per row; picking a chart shown elsewhere swaps them; the choice survives a reload", async ({ page }) => {
    await demo(page, 1920, 1080);
    let charts = await onScreen(page);
    expect(charts.map((c) => c.id)).toEqual(["response", "excursion", "maxspl", "impedance"]);
    expect(charts[0]!.y).toBe(charts[1]!.y);
    expect(charts[0]!.w).toBeGreaterThan(700);
    await page.getByRole("button", { name: "Chart: Max SPL" }).click();
    await expect(page.getByRole("menuitemradio", { name: /Impedance/ })).toContainText("Shown bottom right: picking it swaps");
    await page.getByRole("menuitemradio", { name: /Impedance/ }).click();
    charts = await onScreen(page);
    expect(charts.map((c) => c.id)).toEqual(["response", "excursion", "impedance", "maxspl"]);
    await page.getByRole("button", { name: "One chart per row" }).click();
    charts = await onScreen(page);
    expect(charts.map((c) => c.id)).toEqual(["response", "excursion", "impedance"]);
    await page.reload();
    await page.locator('figure[data-chart="response"] svg[role=img]').waitFor();
    expect((await onScreen(page)).map((c) => c.id)).toEqual(["response", "excursion", "impedance"]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });

  test("every chart on screen has a chart menu, after Response is swapped out too", async ({ page }) => {
    await demo(page, 1920, 1080);
    await page.getByRole("button", { name: "Chart: Response" }).click();
    await page.getByRole("menuitemradio", { name: /Group delay/ }).click();
    const charts = await onScreen(page);
    expect(charts.map((c) => c.id)).toEqual(["delay", "excursion", "maxspl", "impedance"]);
    for (const c of charts) await expect(page.locator(`figure[data-chart="${c.id}"] .chart-pick`)).toHaveCount(1);
    // And back: any slot can show any chart.
    await page.getByRole("button", { name: "Chart: Group delay" }).click();
    await page.getByRole("menuitemradio", { name: /Response/ }).click();
    expect((await onScreen(page)).map((c) => c.id)).toEqual(["response", "excursion", "maxspl", "impedance"]);
  });

  test("cards in a row are the same height; a chart's note sits inside its card", async ({ page }) => {
    await demo(page, 1920, 1080);
    const box = (id: string) => page.locator(`figure[data-chart="${id}"]`).boundingBox();
    const [r, x, m, z] = await Promise.all(["response", "excursion", "maxspl", "impedance"].map(box));
    expect(Math.round(r!.height)).toBe(Math.round(x!.height));
    expect(Math.round(m!.height)).toBe(Math.round(z!.height));
    // The demo runs at 1 W: the excursion chart's low-power note is inside its card.
    await expect(page.locator('figure[data-chart="excursion"] .chart-foot .low-drive')).toBeVisible();
  });

  test("Measured shows only with a measurement; the Impedance chart's menu adds one", async ({ page }) => {
    await demo(page, 1920, 1080);
    await expect(page.getByRole("heading", { name: "Measured" })).toHaveCount(0);
    await page.getByRole("button", { name: "Chart: Impedance" }).click();
    const chooser = page.waitForEvent("filechooser");
    await page.getByRole("menuitem", { name: /Add a measured impedance/ }).click();
    await (await chooser).setFiles(ZMA);
    await expect(page.getByRole("heading", { name: "Measured" })).toBeVisible();
  });

  test("2560 × 1440: two per row inside the 2400 px app", async ({ page }) => {
    await demo(page, 2560, 1440);
    const charts = await onScreen(page);
    expect(charts).toHaveLength(4);
    // 480 tall plots (a limits strip under Max SPL adds to its picture).
    expect(charts.every((c) => c.w === 951 && c.h >= 480)).toBe(true);
    const app = await page.locator(".layout").boundingBox();
    expect(Math.round(app!.width)).toBe(2400);
  });

  test("a chart's title keeps its menu name in every view; the view shows in the plot's note", async ({ page }) => {
    await demo(page, 1280, 900);
    const response = page.locator('figure[data-chart="response"]');
    await response.getByRole("button", { name: "dB SPL" }).click();
    await expect(response.getByRole("button", { name: "Chart: Response" })).toBeVisible();
    await expect(response.locator(".chart-detail")).toContainText("dB SPL");
    const excursion = page.locator('figure[data-chart="excursion"]');
    await excursion.getByRole("radio", { name: /^Velocity/ }).click();
    await expect(excursion.getByRole("button", { name: "Chart: Cone excursion" })).toBeVisible();
    await expect(excursion.locator(".chart-detail")).toContainText("velocity");
  });

  test("Edit is a borderless pencil + Edit as tall as the scale switch", async ({ page }) => {
    await demo(page, 1280, 900);
    const response = page.locator('figure[data-chart="response"]');
    const edit = await response.getByRole("button", { name: "Edit" }).boundingBox();
    const scale = await response.getByRole("group", { name: "SPL scale" }).boundingBox();
    expect(Math.round(edit!.height)).toBe(Math.round(scale!.height));
  });
});

test("phone: tabs stay, titles are names (no chart menus)", async ({ page, isMobile }) => {
  test.skip(!isMobile, "phone layout");
  await page.goto("/");
  await page.getByText("Explore the live demo project").click();
  await page.locator('figure[data-chart="response"] svg[role=img]').waitFor();
  await expect(page.getByRole("tablist", { name: "Charts" })).toBeVisible();
  await expect(page.locator(".chart-pick")).toHaveCount(0);
  await expect(page.locator("figure.chart .chart-hint")).toHaveCount(0);
});
