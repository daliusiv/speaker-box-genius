import { expect, test, type Page } from "@playwright/test";

/** Open the app on the Signal tab (the start dialog closed), fonts loaded. */
async function signal(page: Page) {
  await page.goto("/");
  await page.evaluate(() => document.fonts.ready);
  await page.keyboard.press("Escape");
  await page.evaluate(() => document.querySelectorAll("dialog[open]").forEach((d) => (d as HTMLDialogElement).close()));
  await page.getByRole("tab", { name: /Signal/ }).first().click();
  await page.locator("#panel-signal .ui-section").first().waitFor();
}

const row = (page: Page, title: string) => page.locator("#panel-signal .ui-section").filter({ has: page.locator("summary", { hasText: title }) }).first();

test("Signal: three cards, each setting a row that shows its value", async ({ page }) => {
  await signal(page);
  await expect(page.locator("#panel-signal .ui-card-title")).toHaveText(["Signal", "Listening space", "Export to DSP"]);
  const hp = row(page, "High-pass");
  await expect(hp.locator(".ui-section-value")).toHaveText("Off");
  await hp.locator("summary").click();
  await hp.getByLabel("Filter").selectOption("butterworth");
  await expect(hp.locator(".ui-section-value")).toContainText("Butterworth");
});

test("Signal: + Filter adds an EQ filter that shows its values, On first", async ({ page }) => {
  await signal(page);
  const eq = row(page, "EQ");
  await eq.locator("summary").click();
  await eq.getByRole("button", { name: "Filter" }).click();
  await page.getByRole("menuitem", { name: "Peaking" }).click();
  const filter = eq.locator(".ui-disclosure").first();
  await expect(filter.locator(".ui-disclosure-value")).toHaveText("40 Hz · −3 dB · Q 2");
  await filter.locator("summary").click();
  await expect(filter.locator(".ui-field-label").first()).toHaveText("On");
  await expect(eq.locator(".ui-section-value")).toHaveText("1 filter");
});

test("Signal: Fill from fills the passive branches", async ({ page }) => {
  await signal(page);
  const passive = row(page, "Passive parts");
  await passive.locator("summary").click();
  await passive.getByRole("switch", { name: "Use passive parts" }).click();
  await passive.getByRole("button", { name: "Fill from" }).click();
  await page.getByRole("menuitem", { name: "2nd-order low-pass" }).click();
  await expect(passive.locator(".ui-disclosure-value").nth(1)).toHaveText("C 200 µF");
  await expect(passive.locator(".ui-section-value")).toHaveText("3 parts");
});

test("Signal: Free-standing shows the step; Compensate adds a low shelf", async ({ page }) => {
  await signal(page);
  const baffle = row(page, "Baffle step");
  await baffle.locator("summary").click();
  await baffle.getByText("Free-standing", { exact: true }).click();
  await expect(baffle.locator(".ui-section-value")).toContainText("Hz");
  await baffle.getByRole("button", { name: "Compensate" }).click();
  await page.getByRole("menuitem", { name: "+3 dB (near a wall)" }).click();
  await expect(row(page, "EQ").locator(".ui-section-value")).toHaveText("1 filter");
});

test("Signal: the Signal card with EQ open", async ({ page }) => {
  await signal(page);
  const eq = row(page, "EQ");
  await eq.locator("summary").click();
  await eq.getByRole("button", { name: "Filter" }).click();
  await page.getByRole("menuitem", { name: "Peaking" }).click();
  await page.mouse.move(0, 0);
  await expect(page.locator("#panel-signal .ui-card").first()).toHaveScreenshot("signal-card.png");
});

test("Signal on phones: controls look at least 40 px and take taps across 44 px; no sideways scroll", async ({ page }, info) => {
  test.skip(info.project.name !== "phone", "phones only");
  await signal(page);
  for (const t of ["High-pass", "EQ", "Passive parts", "Room / cabin gain", "Baffle step"]) await row(page, t).locator("summary").click();
  await row(page, "High-pass").getByLabel("Filter").selectOption("butterworth");
  await row(page, "Passive parts").getByRole("switch", { name: "Use passive parts" }).click();
  await row(page, "Baffle step").getByText("Free-standing", { exact: true }).click();
  const bad = await page.evaluate(() => {
    const out: string[] = [];
    const panel = document.querySelector("#panel-signal")!;
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
