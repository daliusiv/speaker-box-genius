import { expect, test, type Page } from "@playwright/test";

/** Open the app on a tab (the start dialog closed), fonts loaded. */
async function tab(page: Page, name: string) {
  await page.goto("/");
  await page.evaluate(() => document.fonts.ready);
  await page.keyboard.press("Escape");
  await page.evaluate(() => document.querySelectorAll("dialog[open]").forEach((d) => (d as HTMLDialogElement).close()));
  await page.getByRole("tab", { name: new RegExp(name) }).first().click();
}

const row = (page: Page, title: string) =>
  page.locator(".tab-panel:not([hidden]) .ui-section").filter({ has: page.locator(".ui-section-title", { hasText: new RegExp(`^${title}$`) }) }).first();

test("Help: an open row has its own ⓘ, a closed row none; the sheet explains that row only", async ({ page }) => {
  await tab(page, "Signal");
  const hp = row(page, "High-pass");
  await expect(hp.getByRole("button", { name: "About High-pass" })).toBeHidden();
  await hp.locator(":scope > summary").click();
  await hp.getByRole("button", { name: "About High-pass" }).click();
  const sheet = page.getByRole("dialog", { name: "High-pass" });
  await expect(sheet).toBeVisible();
  // Slope and Freq only show once a filter is on: the sheet explains them anyway.
  await expect(sheet.locator("dt")).toHaveText(["Filter", "Slope", "Freq"]);
  await expect(sheet.locator("dd").first()).not.toBeEmpty();
  await expect(sheet.getByText("Gain", { exact: true })).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(sheet).toBeHidden();
  await expect(hp).toHaveAttribute("open", "");
  await expect(hp.getByRole("button", { name: "About High-pass" })).toBeFocused();
});

test("Help: option cards list their choices; fields outside rows have the card's ⓘ", async ({ page }) => {
  await tab(page, "Settings");
  const box = row(page, "Box");
  await box.locator(":scope > summary").click();
  await box.getByRole("button", { name: "About Box" }).click();
  const sheet = page.getByRole("dialog", { name: "Box" });
  await expect(sheet.locator("dt")).toContainText(["Box presets", "Leak Ql", "Absorb Qa", "Port Qp", "Leaked air"]);
  await expect(sheet.locator("dd", { hasText: "Heard (WinISD)" })).toHaveCount(1);
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "About General" }).click();
  await expect(page.getByRole("dialog", { name: "General" }).locator("dt")).toHaveText(["Units"]);
});

test("Help: a box card's ⋯ menu explains its own fields", async ({ page }) => {
  await tab(page, "Boxes");
  await page.locator(".bx-card").nth(1).getByRole("button", { name: /^More for / }).click();
  await page.getByRole("menuitem", { name: "About these fields" }).click();
  await expect(page.getByRole("dialog").locator("dt")).toContainText(["Design name", "Vb"]);
});

test("Help: focusing a field shows no help strip", async ({ page }) => {
  await tab(page, "Settings");
  await row(page, "Box").locator(":scope > summary").click();
  await row(page, "Box").getByLabel("Leak Ql").focus();
  await expect(page.locator(".help-dock")).toHaveCount(0);
});

test("Help on phones: the sheet is full screen and its close takes taps across 44 px", async ({ page }, info) => {
  test.skip(info.project.name !== "phone", "phones only");
  await tab(page, "Signal");
  const hp = row(page, "High-pass");
  await hp.locator(":scope > summary").click();
  await hp.getByRole("button", { name: "About High-pass" }).click();
  const box = await page.getByRole("dialog", { name: "High-pass" }).boundingBox();
  const vw = page.viewportSize()!.width;
  expect(box!.width).toBeGreaterThanOrEqual(vw - 1);
  const miss = await page.evaluate(() => {
    const el = document.querySelector("dialog[open] .ui-sheet-actions .ui-button:last-child")!;
    const r = el.getBoundingClientRect();
    return [-21, 21].filter((dy) => !el.contains(document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2 + dy)));
  });
  expect(miss).toEqual([]);
});

test("Help: no ⓘ opens an empty sheet; a field's option cards join its own entry", async ({ page }) => {
  await tab(page, "Build");
  await page.evaluate(() => document.querySelectorAll(".tab-panel:not([hidden]) details").forEach((d) => ((d as HTMLDetailsElement).open = true)));
  await expect(row(page, "Net volume").getByRole("button", { name: "About Net volume" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "About Cut list" })).toHaveCount(0);
  await page.getByRole("tab", { name: /Driver/ }).first().click();
  const coil = row(page, "Coil & suspension");
  await coil.locator(":scope > summary").click();
  await coil.getByRole("button", { name: "About Coil & suspension" }).click();
  const labels = await page.getByRole("dialog", { name: "Coil & suspension" }).locator("dt").allTextContents();
  expect(labels.filter((l, i) => labels.indexOf(l) !== i)).toEqual([]);
  expect(labels).toContain("Coil model");
});
