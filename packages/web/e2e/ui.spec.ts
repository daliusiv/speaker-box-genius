import { expect, test, type Page } from "@playwright/test";

/** Open /ui/ with fonts loaded, so text never renders in a fallback face. */
async function open(page: Page) {
  await page.goto("/ui/");
  await page.getByRole("heading", { name: "UI kit" }).waitFor();
  await page.evaluate(() => document.fonts.ready);
}

const SECTIONS = ["tokens", "buttons", "fields", "choices", "sections", "overlays", "feedback", "panel-recipe"];

for (const id of SECTIONS) {
  test(`/ui ${id}`, async ({ page }) => {
    await open(page);
    await expect(page.locator(`#${id}`)).toHaveScreenshot(`${id}.png`, { animations: "disabled" });
  });
}

test("/ui sheet (open)", async ({ page }) => {
  await open(page);
  await page.getByRole("button", { name: "Open sheet" }).click();
  await expect(page.getByRole("dialog", { name: "T/S parameters" })).toBeVisible();
  await expect(page).toHaveScreenshot("sheet-open.png", { animations: "disabled" });
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(page.getByRole("button", { name: "Open sheet" })).toBeFocused();
});

test("numbers use tabular figures everywhere on /ui", async ({ page }) => {
  await open(page);
  const off = await page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('input[inputmode="decimal"], input[inputmode="numeric"], output, [data-numeric]')]
      .filter((el) => getComputedStyle(el).fontVariantNumeric !== "tabular-nums")
      .map((el) => el.outerHTML.slice(0, 80)),
  );
  expect(off).toEqual([]);
});

test("menu: arrow keys move, Escape closes and returns focus", async ({ page }) => {
  await open(page);
  const trigger = page.getByRole("button", { name: "Driver tools" });
  await trigger.focus();
  await page.keyboard.press("ArrowDown");
  await expect(page.getByRole("menuitem", { name: "Export WinISD .wdr…" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("menu", { name: "Driver tools" })).toBeHidden();
  await expect(trigger).toBeFocused();
});

test("stepper and segmented respond to input", async ({ page }) => {
  await open(page);
  const fields = page.locator("#fields");
  await fields.getByRole("button", { name: "More: Number of drivers" }).click();
  await expect(fields.getByRole("textbox", { name: "Number of drivers" })).toHaveValue("2");
  const loading = page.getByRole("radiogroup", { name: "Loading" });
  await loading.getByRole("radio", { name: "Normal" }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(loading.getByRole("radio", { name: "Isobaric" })).toHaveAttribute("aria-checked", "true");
});

test("touch sizes: controls look at least 40 px tall and take taps across 44 px", async ({ page }, info) => {
  test.skip(info.project.name !== "phone", "phones only");
  await open(page);
  const bad = await page.evaluate(() => {
    const out: string[] = [];
    const name = (el: Element) => `${el.className} "${el.textContent?.trim().slice(0, 20)}"`;
    const looks = ".ui-button:not([data-size=sm]), .ui-number, .ui-stepper, .ui-select, .ui-segmented, .ui-section > summary, .ui-menu-item";
    for (const el of document.querySelectorAll(looks)) {
      const h = el.getBoundingClientRect().height;
      if (h > 0 && h < 40) out.push(`${name(el)} looks ${h} px`);
    }
    // A tap 21 px above or below the middle of anything tappable must still reach it.
    const taps = ".ui-button, .ui-number input, .ui-stepper button, .ui-stepper input, .ui-select, .ui-segmented button, .ui-section > summary";
    for (const el of document.querySelectorAll(taps)) {
      if (!el.checkVisibility()) continue;
      el.scrollIntoView({ block: "center" });
      const r = el.getBoundingClientRect();
      const x = r.left + r.width / 2;
      for (const dy of [-21, 21]) {
        const hit = document.elementFromPoint(x, r.top + r.height / 2 + dy);
        if (!hit || !el.contains(hit)) out.push(`${name(el)}: a tap ${dy} px from the middle misses (${hit?.tagName})`);
      }
    }
    return out;
  });
  expect(bad).toEqual([]);
});

test("no horizontal overflow", async ({ page }) => {
  await open(page);
  const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(over).toBeLessThanOrEqual(0);
});
