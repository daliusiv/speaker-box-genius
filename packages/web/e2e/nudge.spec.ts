import { expect, test, type Page } from "@playwright/test";
import { nudge } from "../src/ui/nudge.ts";

/** Open the app with the start dialog closed, fonts loaded. */
async function open(page: Page) {
  await page.goto("/");
  await page.evaluate(() => document.fonts.ready);
  await page.keyboard.press("Escape");
  await page.evaluate(() => document.querySelectorAll("dialog[open]").forEach((d) => (d as HTMLDialogElement).close()));
}

test("T/S editor: ↑ nudges a typed value, which stays typed; a calculated cell ignores the arrows", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "keyboard: desktop");
  await open(page);
  await page.getByRole("tab", { name: /Driver/ }).first().click();
  const edit = page.getByRole("button", { name: "Edit T/S", exact: true }).first();
  if ((await edit.getAttribute("aria-expanded")) !== "true") await edit.click();
  const ts = page.getByRole("region", { name: "T/S parameters" });
  const typed = ts.locator(".ts-cell.typed");
  await expect(typed.first()).toBeVisible();
  const count = await typed.count();
  // Clear one typed cell so it's calculated, then nudge another.
  await typed.first().locator("input").fill("");
  await expect(ts.locator(".ts-cell.typed")).toHaveCount(count - 1);
  const grey = ts.locator(".ts-cell.calculated input").first();
  await grey.press("ArrowUp");
  await expect(grey).toHaveValue("");
  const cell = ts.locator(".ts-cell.typed").first();
  const input = cell.locator("input");
  const before = Number(await input.inputValue());
  await input.press("ArrowUp");
  await expect(input).toHaveValue(String(nudge(before, 1)));
  await expect(cell).toHaveClass(/\btyped\b/);
  await expect(ts.locator(".ts-cell.typed")).toHaveCount(count - 1);
});

test("Help sheet: the keyboard tip shows on desktop, not on phones", async ({ page }, info) => {
  await open(page);
  await page.getByRole("tab", { name: /Driver/ }).first().click();
  await page.getByRole("button", { name: "About Driver" }).click();
  await expect(page.getByRole("dialog", { name: "Driver" })).toBeVisible();
  const tip = page.locator(".ui-help-tip");
  if (info.project.name === "desktop") await expect(tip).toBeVisible();
  else await expect(tip).toBeHidden();
});
