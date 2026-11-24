import { expect, test, type Page } from "@playwright/test";

/** A database index the size of the real one (~1,900 drivers), so the picker has as much to build. */
function bigIndex(n = 1900) {
  const drivers = Array.from({ length: n }, (_, i) => ({
    id: `test-brand/w${i}`,
    brand: "Test Brand",
    model: `W${i}`,
    type: "woofer",
    ohms: i % 2 ? 4 : 8,
    size_in: 6 + (i % 10),
    fs: 20 + (i % 60),
    qts: 0.3 + (i % 20) / 100,
    qes: 0.35 + (i % 20) / 100,
    vas_l: 20 + (i % 100),
    xmax_mm: 4 + (i % 12),
    pe_w: 100 + (i % 10) * 50,
    sd_cm2: 130 + (i % 400),
    status: "community",
    source: "datasheet",
  }));
  return { generated: "2026-01-01T00:00:00.000Z", brands: { "test-brand": { name: "Test Brand" } }, drivers, passiveRadiators: [] };
}

/** Open the app on the Driver tab with the big index, the start dialog closed, fonts loaded. */
async function open(page: Page) {
  const index = JSON.stringify(bigIndex());
  await page.route("**/db/index.json*", (r) => r.fulfill({ contentType: "application/json", body: index }));
  await page.goto("/");
  await page.evaluate(() => document.fonts.ready);
  await page.keyboard.press("Escape");
  await page.evaluate(() => document.querySelectorAll("dialog[open]").forEach((d) => (d as HTMLDialogElement).close()));
  await page.getByRole("tab", { name: /Driver/ }).first().click();
  const button = page.locator("#panel-driver button.browse").first();
  await expect(button).toBeEnabled();
  return { button, dialog: page.getByRole("dialog", { name: "Driver database" }) };
}

test("Driver picker: a second quick tap doesn't pick a row; a later tap does", async ({ page }) => {
  const { button, dialog } = await open(page);
  // Two quick taps on the same spot, as when the first seemed to do nothing.
  const at = (await button.boundingBox())!;
  await button.click();
  await expect(dialog).toBeVisible();
  await page.mouse.click(at.x + at.width / 2, at.y + at.height / 2);
  await expect(dialog.locator("tbody tr").first()).toBeVisible();
  await expect(dialog.locator(".lib-loading")).toHaveCount(0);
  await expect(dialog).toBeVisible();
  // A real tap on a row still picks it (the dialog closes).
  await page.waitForTimeout(300);
  await dialog.locator("tbody tr").nth(2).click();
  await expect(dialog).toBeHidden();
});

test("Driver picker: on a slow phone the dialog shows at once, with a progress bar until the rows are in", async ({ page }) => {
  const { button, dialog } = await open(page);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 6 });
  await button.click();
  await expect(dialog.getByRole("searchbox", { name: "Search" })).toBeVisible();
  await expect(dialog.locator(".lib-loading")).toHaveCount(1);
  await expect(dialog.locator(".lib-loading")).toHaveCount(0, { timeout: 30_000 });
  await expect(dialog.locator("tbody tr")).toHaveCount(1900);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
});
