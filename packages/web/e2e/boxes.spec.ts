import { expect, test, type Page } from "@playwright/test";

/** Open the app on the Boxes tab (the start dialog closed), fonts loaded. */
async function boxes(page: Page) {
  await page.goto("/");
  await page.evaluate(() => document.fonts.ready);
  await page.keyboard.press("Escape");
  await page.evaluate(() => document.querySelectorAll("dialog[open]").forEach((d) => (d as HTMLDialogElement).close()));
  await page.getByRole("tab", { name: /Boxes/ }).first().click();
  await page.locator("#panel-boxes .bx-card").first().waitFor();
}

const card = (page: Page, kind: string) => page.locator(`#panel-boxes .bx-card[data-kind="${kind}"]`);

test("Boxes: the ported card with its Port section open", async ({ page }) => {
  await boxes(page);
  const ported = card(page, "vented");
  await ported.getByText("Port", { exact: true }).click();
  await expect(ported).toHaveScreenshot("ported-card.png");
});

test("Boxes: top row is + Box, Size all and fold all; + Box lists the kinds", async ({ page }) => {
  await boxes(page);
  const top = page.locator("#panel-boxes .bx-top");
  await expect(top.getByRole("button", { name: "Add a box" })).toBeVisible();
  await expect(top.getByRole("button", { name: /Size all/ })).toBeVisible();
  await top.getByRole("button", { name: "Add a box" }).click();
  await expect(page.getByRole("menu", { name: "Box type" }).getByRole("menuitem")).toHaveText(["Sealed", "Ported", "Passive radiators", "Bandpass", "Transmission line", "Infinite baffle", "Open baffle"]);
  await page.keyboard.press("Escape");
  await top.getByRole("button", { name: "Fold all boxes" }).click();
  await expect(page.locator("#panel-boxes .bx-body")).toHaveCount(0);
  await top.getByRole("button", { name: "Open all boxes" }).click();
  await expect(page.locator("#panel-boxes .bx-body").first()).toBeVisible();
});

test("Boxes: Preset comes first, then Vb", async ({ page }) => {
  await boxes(page);
  const labels = await card(page, "vented").locator(".bx-body .ui-field-label").allTextContents();
  expect(labels.slice(0, 3)).toEqual(["Preset", "Vb", "Fb"]);
});

test("Boxes: the ⋯ menu duplicates a box", async ({ page }) => {
  await boxes(page);
  const before = await page.locator("#panel-boxes .bx-card").count();
  await card(page, "sealed").getByRole("button", { name: /More for/ }).click();
  await page.getByRole("menuitem", { name: "Duplicate" }).click();
  await expect(page.locator("#panel-boxes .bx-card")).toHaveCount(before + 1);
});

test("Boxes on phones: controls look at least 40 px and take taps across 44 px; no sideways scroll", async ({ page }, info) => {
  test.skip(info.project.name !== "phone", "phones only");
  await boxes(page);
  await card(page, "vented").getByText("Port", { exact: true }).click();
  const bad = await page.evaluate(() => {
    const out: string[] = [];
    const panel = document.querySelector("#panel-boxes")!;
    const name = (el: Element) => `${el.className} "${el.textContent?.trim().slice(0, 20)}"`;
    for (const el of panel.querySelectorAll(".ui-button:not([data-size=sm]), .ui-number, .ui-stepper, .ui-select, .ui-segmented")) {
      const h = el.getBoundingClientRect().height;
      if (el.checkVisibility() && h > 0 && h < 40) out.push(`${name(el)} looks ${h} px`);
    }
    for (const el of panel.querySelectorAll(".ui-button, .ui-number input, .ui-stepper button, .ui-select, .ui-segmented button")) {
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

test("Boxes: Preset is a picker; each preset shows its box, F3, a line and its curve; picking one applies it", async ({ page }) => {
  await boxes(page);
  const ported = card(page, "vented");
  const picker = ported.getByRole("button", { name: /^Preset: / });
  await expect(picker).toHaveText("Custom");
  await picker.click();
  const items = page.getByRole("menuitemradio");
  await expect(items).toHaveCount(3);
  const qb3 = items.filter({ hasText: /^QB3/ });
  await expect(qb3).toContainText(/\d+(\.\d)? L · \d+\.\d Hz · F3 \d+ Hz/);
  await expect(qb3).toContainText("Flat: the usual vented box");
  await expect(qb3.locator("polyline")).toHaveCount(1);
  await expect(page.getByRole("menu").getByText("reads Custom")).toBeVisible();
  await qb3.click();
  await expect(picker).toHaveText("QB3");
  await picker.click();
  await expect(page.getByRole("menuitemradio").filter({ hasText: /^QB3/ })).toHaveAttribute("aria-checked", "true");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("menu")).toHaveCount(0);
  await expect(picker).toBeFocused();
  // A hand edit makes it Custom again.
  await ported.getByLabel("Vb").fill("70");
  await ported.getByLabel("Vb").blur();
  await expect(picker).toHaveText("Custom");
});

test("Boxes: the preset list fits the phone and its items take taps", async ({ page }, info) => {
  test.skip(info.project.name !== "phone", "phones only");
  await boxes(page);
  await card(page, "vented").getByRole("button", { name: /^Preset: / }).click();
  const box = await page.getByRole("menu").boundingBox();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(page.viewportSize()!.width);
  for (const h of await page.getByRole("menuitemradio").evaluateAll((els) => els.map((e) => e.getBoundingClientRect().height))) expect(h).toBeGreaterThanOrEqual(44);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
});

test("Boxes: the preset picker opened from the keyboard shows the curves and lands on the ticked preset", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => document.fonts.ready);
  await page.keyboard.press("Escape");
  await page.evaluate(() => document.querySelectorAll("dialog[open]").forEach((d) => (d as HTMLDialogElement).close()));
  await page.getByRole("tab", { name: /Boxes/ }).first().click();
  const picker = page.getByRole("button", { name: /^Preset:/ }).first();
  await picker.click();
  await page.getByRole("menuitemradio", { name: /^Qtc 0\.577/ }).click();
  await picker.focus();
  await page.keyboard.press("ArrowDown");
  const menu = page.getByRole("menu", { name: "Preset" });
  await expect(menu.locator("svg.ui-mini-response")).toHaveCount(3);
  await expect(page.getByRole("menuitemradio", { name: /^Qtc 0\.577/ })).toBeFocused();
});

test("Boxes: ↑/↓ nudge Vb (Shift ×10, snapped), one held burst is one undo step, Ctrl+arrow is left alone", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "keyboard: desktop");
  await boxes(page);
  const vb = card(page, "vented").getByLabel("Vb");
  await vb.fill("50");
  // Let the typed value settle into its own undo step.
  await page.waitForTimeout(900);
  await vb.press("ArrowUp");
  await vb.press("ArrowUp");
  await vb.press("ArrowUp");
  await expect(vb).toHaveValue("53");
  await vb.press("Shift+ArrowUp");
  await expect(vb).toHaveValue("60");
  await vb.press("ArrowDown");
  await expect(vb).toHaveValue("59");
  await vb.press("Control+ArrowUp");
  await expect(vb).toHaveValue("59");
  await page.keyboard.press("Control+z");
  await expect(vb).toHaveValue("50");
});

/** Add a passive-radiator box (if there's none yet) and open its Passive radiator section. */
async function prCard(page: Page) {
  await boxes(page);
  if ((await card(page, "pr").count()) === 0) {
    await page.locator("#panel-boxes .bx-top").getByRole("button", { name: "Add a box" }).click();
    await page.getByRole("menu", { name: "Box type" }).getByRole("menuitem", { name: "Passive radiators" }).click();
  }
  const pr = card(page, "pr").first();
  const mass = pr.getByLabel("Added mass").first();
  if (!(await mass.isVisible())) await pr.getByText(/^Passive radiators?$/).first().click();
  await mass.waitFor();
  return pr;
}

test("Boxes: the PR card keeps each action in its row", async ({ page }) => {
  const pr = await prCard(page);
  // ✦ Best tuning sits in the Fb row; ✦ Find beside the PR picker, on its line; Set mass right under Tune to.
  await expect(pr.locator(".ui-field", { has: page.locator(".ui-field-label", { hasText: /^Fb/ }) }).getByRole("button", { name: "Best tuning…" })).toBeVisible();
  await expect(pr.locator(".bx-picker").getByRole("button", { name: "Find a PR for this driver…" })).toBeVisible();
  const picker = await pr.locator(".bx-picker > .picker").boundingBox();
  const find = await pr.getByRole("button", { name: "Find a PR for this driver…" }).boundingBox();
  expect(Math.abs(picker!.y - find!.y)).toBeLessThan(1);
  expect(Math.abs(picker!.height - find!.height)).toBeLessThan(1);
  const tune = pr.locator(".ui-field", { has: page.getByLabel("Tune to") });
  await expect(tune.locator("+ .ui-field").getByRole("button", { name: "Set mass" })).toBeVisible();
  // The Hz box keeps the control column like Added mass: same right edge and width.
  const tuneBox = await tune.locator(".ui-number").boundingBox();
  const massBox = await pr.locator(".ui-field", { has: page.getByLabel("Added mass") }).first().locator(".ui-number").boundingBox();
  expect(Math.abs(tuneBox!.x - massBox!.x)).toBeLessThan(1);
  expect(Math.abs(tuneBox!.width - massBox!.width)).toBeLessThan(1);
  // One group: Position is a radio group under Added mass.
  const position = pr.getByRole("group", { name: "Position" });
  await expect(position.getByRole("radio")).toHaveCount(3);
  expect((await position.boundingBox())!.y).toBeGreaterThan(massBox!.y);
  // No floating rows of text buttons are left in the card.
  await expect(pr.locator(".bx-actions")).toHaveCount(0);
  // One full-width Add button: as wide as the section's rows.
  const add = await pr.getByRole("button", { name: "Add a different PR" }).boundingBox();
  const row = await pr.locator(".ui-field", { has: page.getByLabel("Added mass") }).first().boundingBox();
  expect(Math.abs(add!.width - row!.width)).toBeLessThan(2);
  await expect(pr).toHaveScreenshot("pr-card.png");
});

test("Boxes: Set mass's message shows right under Tune to", async ({ page }) => {
  const pr = await prCard(page);
  const tuneTo = pr.getByLabel("Tune to");
  await tuneTo.fill("200");
  await pr.getByRole("button", { name: "Set mass" }).click();
  const warn = pr.locator(".ui-field:has(#" + (await tuneTo.getAttribute("id"))!.replace(/:/g, "\\:") + ") + .ui-field + p.warn");
  await expect(warn).toContainText("already tune");
});

test("Boxes: mixed PRs are group panels with one Tune to; Add mass to picks the group Set mass changes", async ({ page }) => {
  const pr = await prCard(page);
  await pr.getByRole("button", { name: "Add a different PR" }).click();
  const groups = pr.locator(".bx-group");
  await expect(groups).toHaveCount(2);
  // Position once, above the groups; group 1 can't be removed, group 2 can.
  await expect(pr.getByRole("group", { name: "Position" })).toHaveCount(1);
  expect((await pr.getByRole("group", { name: "Position" }).boundingBox())!.y).toBeLessThan((await groups.nth(0).boundingBox())!.y);
  await expect(groups.nth(0).getByRole("button", { name: /Remove/ })).toHaveCount(0);
  await expect(groups.nth(1).getByRole("button", { name: "Remove Group 2" })).toBeVisible();
  await expect(pr.getByLabel("Tune to")).toHaveCount(1);
  // Set mass on group 2 only.
  const mass1 = groups.nth(0).getByLabel("Added mass");
  const mass2 = groups.nth(1).getByLabel("Added mass");
  const before1 = await mass1.inputValue();
  const before2 = await mass2.inputValue();
  await pr.getByLabel("Add mass to").selectOption({ label: "Group 2" });
  await pr.getByLabel("Tune to").fill("33");
  await pr.getByRole("button", { name: "Set mass" }).click();
  await expect(mass2).not.toHaveValue(before2);
  await expect(mass1).toHaveValue(before1);
  // No sideways scroll with the group panels.
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  await expect(pr).toHaveScreenshot("pr-card-mixed.png");
});

test("Boxes: the ported card's Position is a radio group and Set length sits under Tune to", async ({ page }) => {
  await boxes(page);
  const ported = card(page, "vented").first();
  const port = ported.getByRole("group", { name: "Position" });
  if (!(await port.isVisible())) await ported.getByText(/^Port$/).first().click();
  await expect(port.getByRole("radio", { name: /Beside driver/ })).toBeChecked();
  await port.getByRole("radio", { name: /Further away by/ }).check();
  await expect(port.getByLabel("Distance").first()).toBeVisible();
  const tune = ported.locator(".ui-field", { has: page.getByLabel("Tune to") });
  await expect(tune.locator("+ .ui-field").getByRole("button", { name: "Set length" })).toBeVisible();
});
