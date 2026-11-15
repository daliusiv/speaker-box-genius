import { expect, test, type Page } from "@playwright/test";

/** Open the app on the Settings tab (the start dialog closed), fonts loaded. */
async function settings(page: Page) {
  await page.goto("/");
  await page.evaluate(() => document.fonts.ready);
  await page.keyboard.press("Escape");
  await page.evaluate(() => document.querySelectorAll("dialog[open]").forEach((d) => (d as HTMLDialogElement).close()));
  await page.getByRole("tab", { name: /Settings/ }).first().click();
  await page.locator("#panel-settings .ui-section").first().waitFor();
}

const row = (page: Page, title: string) => page.locator("#panel-settings .ui-section").filter({ has: page.locator(".ui-section-title", { hasText: new RegExp(`^${title}$`) }) }).first();
const value = (page: Page, title: string) => row(page, title).locator(".ui-section-value");

test("Settings: General, Simulation and Limits cards, each setting a row that shows its value", async ({ page }) => {
  await settings(page);
  await expect(page.locator("#panel-settings .ui-card-title")).toHaveText(["General", "Simulation", "Limits"]);
  await expect(value(page, "Match")).toHaveText("Default");
  await expect(value(page, "Box")).toHaveText("Ql 10 · Qa 100 · Qp 100");
  await expect(value(page, "Amplifier")).toHaveText("No limit");
});

test("Settings: Match sets the conventions; a hand change reads Custom", async ({ page }) => {
  await settings(page);
  await row(page, "Match").locator(":scope > summary").click();
  await row(page, "Match").getByText("WinISD", { exact: true }).click();
  await expect(value(page, "Match")).toHaveText("WinISD");
  await expect(value(page, "Voice coil")).toHaveText("Le off · 20 °C");
  await row(page, "Ports").locator(":scope > summary").click();
  await row(page, "Ports").getByText("Pipe", { exact: true }).click();
  await expect(value(page, "Match")).toHaveText("Custom");
  await expect(row(page, "Match").locator(".hint").first()).toContainText("WinISD except");
});

test("Settings: My conditions shows its fields; the amp's ratings fill the limits", async ({ page }) => {
  await settings(page);
  await row(page, "Air").locator(":scope > summary").click();
  await row(page, "Air").getByText("My conditions", { exact: true }).click();
  await expect(row(page, "Air").getByRole("textbox", { name: "Temperature" })).toBeVisible();
  await expect(value(page, "Air")).toHaveText("20 °C · 50 % · 1013 hPa");
  const amp = row(page, "Amplifier");
  await amp.locator(":scope > summary").click();
  await amp.locator(".ui-disclosure summary").click();
  await amp.getByRole("textbox", { name: "Rated" }).fill("350");
  await amp.getByRole("textbox", { name: "Rated" }).blur();
  await amp.getByRole("textbox", { name: "and", exact: true }).fill("550");
  await amp.getByRole("textbox", { name: "and", exact: true }).blur();
  await amp.getByRole("button", { name: /^Use / }).click();
  await expect(value(page, "Amplifier")).toHaveText(/^\d+(\.\d+)? V · \d+(\.\d+)? A$/);
});

test("Settings: the General and Simulation cards", async ({ page }) => {
  await settings(page);
  await page.mouse.move(0, 0);
  await expect(page.locator("#panel-settings .ui-card").nth(1)).toHaveScreenshot("settings-simulation-card.png");
});

test("Settings on phones: controls look at least 40 px and take taps across 44 px; no sideways scroll", async ({ page }, info) => {
  test.skip(info.project.name !== "phone", "phones only");
  await settings(page);
  for (const t of ["Match", "Amplifier & cable", "Air", "Voice coil", "Box", "Ports", "SPL", "Amplifier", "Port speed", "Air distortion"]) await row(page, t).locator(":scope > summary").click();
  const bad = await page.evaluate(() => {
    const out: string[] = [];
    const panel = document.querySelector("#panel-settings")!;
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
