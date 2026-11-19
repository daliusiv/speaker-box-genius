import { expect, test, type Page } from "@playwright/test";

/** Open the app on the Build tab (the start dialog closed), fonts loaded. */
async function build(page: Page) {
  await page.goto("/");
  await page.evaluate(() => document.fonts.ready);
  await page.keyboard.press("Escape");
  await page.evaluate(() => document.querySelectorAll("dialog[open]").forEach((d) => (d as HTMLDialogElement).close()));
  await page.getByRole("tab", { name: /Build/ }).first().click();
  await page.locator("#panel-build .ui-section").first().waitFor();
}

const row = (page: Page, title: string) => page.locator("#panel-build .ui-section").filter({ has: page.locator("summary", { hasText: title }) }).first();
const value = (page: Page, title: string) => row(page, title).locator(".ui-section-value");

test("Build: Box and Cut list cards, each setting a row that shows its value", async ({ page }) => {
  await build(page);
  await expect(page.locator("#panel-build .ui-card-title")).toHaveText(["Box", "Cut list"]);
  await expect(value(page, "Shape")).toHaveText("Box");
  await expect(value(page, "Outside size")).toHaveText("40 × 50 × 45 cm · 18 mm");
  await row(page, "Outside size").locator("summary").click();
  await row(page, "Outside size").getByLabel("Walls").fill("12");
  await row(page, "Outside size").getByLabel("Walls").blur();
  await expect(value(page, "Outside size")).toHaveText("40 × 50 × 45 cm · 12 mm");
  await row(page, "Shape").locator("summary").click();
  await row(page, "Shape").getByText("Car wedge", { exact: true }).click();
  await expect(value(page, "Shape")).toHaveText("Car wedge");
  await expect(row(page, "Driver fit")).toBeVisible();
});

test("Build: a car wedge's lip shows in Outside size, the drawing and Angles and inside", async ({ page }) => {
  await build(page);
  await row(page, "Shape").locator("summary").first().click();
  await row(page, "Shape").getByText("Car wedge", { exact: true }).click();
  const outside = row(page, "Outside size");
  await outside.locator("summary").first().click();
  await expect(outside.getByRole("radio", { name: "Side", exact: true })).toBeVisible();
  const lip = outside.getByLabel("Lip height");
  await expect(lip).toHaveValue("0");
  await expect(page.locator(".wedge-drawing .wedge-dim", { hasText: /^L / })).toHaveCount(0);
  await lip.fill("15");
  await lip.blur();
  await expect(value(page, "Outside size")).toHaveText("40 × 50 × 30/45 cm · lip 15 · 18 mm");
  await expect(page.locator(".wedge-drawing .wedge-dim", { hasText: "L 150" })).toHaveCount(1);
  await expect(outside.locator(".ui-disclosure-value")).toHaveText("θ 66.8° · inside 61.1 L");
  await outside.locator(".ui-disclosure summary").click();
  await expect(outside.locator(".ui-field", { hasText: "Inside lip" }).locator("output")).toHaveText("12.8 cm");
});

test("Build: Inside parts change the net volume; Size box finds the size", async ({ page }) => {
  await build(page);
  const net = await value(page, "Net volume").textContent();
  await row(page, "Inside parts").locator("summary").click();
  await row(page, "Inside parts").getByLabel("Bracing").fill("10");
  await row(page, "Inside parts").getByLabel("Bracing").blur();
  await expect(value(page, "Net volume")).not.toHaveText(net!);
  const size = row(page, "Size for a volume");
  await size.locator("summary").click();
  await size.getByLabel("Target").fill("50");
  await size.getByLabel("Target").blur();
  await size.getByRole("button", { name: "Size box" }).click();
  await expect(size.locator(".hint")).toContainText("gives 50.0");
  await expect(value(page, "Net volume")).toHaveText("50.0 L");
});

test("Build: Export copies the cut list; PDF prints every row open", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await build(page);
  await expect(value(page, "Holes")).toHaveText(/^1 cutout · ⌀ \d+ mm$/);
  await expect(value(page, "Sheet layout")).toHaveText(/^1 sheet · \d+ % used$/);
  await page.getByRole("button", { name: "Export" }).click();
  await page.getByRole("menuitem", { name: "Copy cut list" }).click();
  await expect(page.locator("#panel-build .bd-foot .hint")).toContainText("copied");
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain("| Part | Qty |");
  await page.evaluate(() => (window.print = () => {}));
  await page.getByRole("button", { name: "Export" }).click();
  await page.getByRole("menuitem", { name: "PDF" }).click();
  const printed = page.locator("#print-root");
  await expect(printed.locator("details")).toHaveCount(0);
  await expect(printed.locator(".ui-field")).toHaveCount(0);
  await expect(printed.locator("h3")).toHaveText(["Holes", "Sheet layout"]);
  await expect(printed.locator(".sheet-svg")).toHaveCount(1);
});

test("Build: the Box card", async ({ page }) => {
  await build(page);
  await page.mouse.move(0, 0);
  await expect(page.locator("#panel-build .ui-card").first()).toHaveScreenshot("build-box-card.png");
});

test("Build on phones: controls look at least 40 px and take taps across 44 px; no sideways scroll", async ({ page }, info) => {
  test.skip(info.project.name !== "phone", "phones only");
  await build(page);
  for (const t of ["Shape", "Outside size", "Inside parts", "Net volume", "Size for a volume", "Holes", "Sheet layout"]) await row(page, t).locator("summary").click();
  const bad = await page.evaluate(() => {
    const out: string[] = [];
    const panel = document.querySelector("#panel-build")!;
    const name = (el: Element) => `${el.className} "${el.textContent?.trim().slice(0, 20)}"`;
    for (const el of panel.querySelectorAll(".ui-button:not([data-size=sm]), .ui-number, .ui-select")) {
      const h = el.getBoundingClientRect().height;
      if (el.checkVisibility() && h > 0 && h < 40) out.push(`${name(el)} looks ${h} px`);
    }
    for (const el of panel.querySelectorAll(".ui-button, .ui-number input, .ui-select, .ui-switch")) {
      if (!el.checkVisibility()) continue;
      el.scrollIntoView({ block: "center" });
      const r = el.getBoundingClientRect();
      const x = r.left + r.width / 2;
      for (const dy of [-21, 21]) {
        const hit = document.elementFromPoint(x, r.top + r.height / 2 + dy);
        if (!hit || !el.contains(hit)) out.push(`${name(el)}: a tap ${dy} px from the middle misses (${hit?.className})`);
      }
    }
    return out;
  });
  expect(bad).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
});
