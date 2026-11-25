import { expect, test } from "@playwright/test";

/** Open / Import is a modal window: an unreadable file's message must show inside it, not in a toast behind it. */
test("Open / Import: a file the app can't read says so inside the window", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => document.fonts.ready);
  await page.keyboard.press("Escape");
  await page.evaluate(() => document.querySelectorAll("dialog[open]").forEach((d) => (d as HTMLDialogElement).close()));
  await page.getByRole("button", { name: "Menu" }).click();
  await page.getByRole("menuitem", { name: /Open \/ Import/ }).click();
  const win = page.locator("dialog.open-window");
  await win.locator("input[type=file]").setInputFiles({ name: "Screenshot_1.jpg", mimeType: "image/jpeg", buffer: Buffer.from("not a project") });
  await expect(win.getByRole("alert")).toHaveText("Screenshot_1.jpg: not a file Speaker Box Genius reads.");
  await expect(page.locator(".toast")).toHaveCount(0);
  // Closing the window clears it.
  await win.getByRole("button", { name: "Close" }).click();
  await page.getByRole("button", { name: "Menu" }).click();
  await page.getByRole("menuitem", { name: /Open \/ Import/ }).click();
  await expect(win.getByRole("alert")).toHaveCount(0);
});
