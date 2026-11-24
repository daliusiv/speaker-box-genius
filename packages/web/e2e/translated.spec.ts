import { expect, test, type Page } from "@playwright/test";

/**
 * A page the browser translates must keep working everywhere, not only where #406 crashed.
 *
 * Page translators (Google Translate in Chrome, Firefox Translations) swap the page's text nodes
 * for new ones or wrap them in `<font>`, and keep doing so as new text appears. React still holds
 * the old nodes, so an update that inserts or removes text next to them throws, and the app goes
 * blank. `domGuard.ts` covers this for the whole app; this test drives every tab with a stand-in
 * translator running, so a screen that still blanks (or a removed guard) fails here.
 */

/** Stand-in translator: swaps every text node under #root, now and whenever new text appears. */
function translator() {
  const ours = new WeakSet<Node>();
  const skip = new Set(["SCRIPT", "STYLE", "TEXTAREA"]);
  let flip = false;
  const swap = (n: Text) => {
    const parent = n.parentNode as Element | null;
    if (!parent || ours.has(n) || skip.has(parent.nodeName) || !n.nodeValue?.trim()) return;
    flip = !flip;
    // Half as Google's <font> wrapper, half as a fresh text node (Firefox); SVG text only the latter.
    if (flip && !(parent instanceof SVGElement)) {
      const f = document.createElement("font");
      const t = document.createTextNode(n.nodeValue);
      ours.add(t);
      f.appendChild(t);
      n.replaceWith(f);
    } else {
      const t = document.createTextNode(n.nodeValue);
      ours.add(t);
      n.replaceWith(t);
    }
  };
  const sweep = (root: Node) => {
    if (root.nodeType === Node.TEXT_NODE) return swap(root as Text);
    const walk = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const nodes: Text[] = [];
    while (walk.nextNode()) nodes.push(walk.currentNode as Text);
    nodes.forEach(swap);
  };
  const start = () => {
    const root = document.getElementById("root");
    if (!root) return void requestAnimationFrame(start);
    const pending = new Set<Node>();
    let queued = false;
    // Like a real translator: a moment after React adds text, not inside React's commit.
    new MutationObserver((records) => {
      for (const r of records) r.addedNodes.forEach((n) => pending.add(n));
      if (queued) return;
      queued = true;
      setTimeout(() => {
        queued = false;
        const nodes = [...pending];
        pending.clear();
        nodes.forEach((n) => n.isConnected && sweep(n));
      }, 0);
    }).observe(root, { childList: true, subtree: true });
    sweep(root);
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
}

const TABS = ["Driver", "Boxes", "Signal", "Build", "Settings"];

/** Open every row of the tab's panel and try each of its radio choices, then close the row. */
async function driveTab(page: Page, tab: string) {
  await page.getByRole("tab", { name: new RegExp(tab) }).locator("visible=true").first().click();
  const panel = page.locator(`#panel-${tab.toLowerCase()}`);
  await expect(panel).toBeVisible();
  const rows = panel.locator(".ui-section");
  const count = await rows.count();
  for (let i = 0; i < count; i++) {
    const summary = rows.nth(i).locator("summary").first();
    if (!(await summary.isVisible())) continue;
    await summary.click();
    // Radios may be visually hidden behind their labels: click them as a user's label click would.
    await rows.nth(i).evaluate(async (row) => {
      const radios = [...row.querySelectorAll<HTMLInputElement>('input[type="radio"]:not(:disabled)')];
      const first = radios.find((r) => r.checked);
      for (const r of radios) {
        r.click();
        await new Promise((res) => setTimeout(res, 20));
      }
      first?.click();
      await new Promise((res) => setTimeout(res, 20));
    });
    if (await summary.isVisible()) await summary.click();
  }
}

test("Translated page: every tab, row and choice keeps working", async ({ page }) => {
  test.setTimeout(180_000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.addInitScript(translator);
  await page.goto("/");
  await page.evaluate(() => document.fonts.ready);
  await page.keyboard.press("Escape");
  await page.evaluate(() => document.querySelectorAll("dialog[open]").forEach((d) => (d as HTMLDialogElement).close()));
  // The stand-in translator is really at work.
  await expect.poll(() => page.locator("#root font").count()).toBeGreaterThan(20);
  for (const tab of TABS) {
    await driveTab(page, tab);
    expect(errors, `after the ${tab} tab`).toEqual([]);
  }
  // Still rendered: back on the first tab, its cards are there.
  await page.getByRole("tab", { name: /Driver/ }).locator("visible=true").first().click();
  await expect(page.locator("#panel-driver .ui-card-title").first()).toBeVisible();
  expect(errors).toEqual([]);
});
