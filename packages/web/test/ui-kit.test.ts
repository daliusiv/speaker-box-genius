import { test } from "node:test";
import assert from "node:assert/strict";
import { globSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { TOKENS_CSS, generate, readTokens } from "../scripts/tokens.ts";

const WEB = fileURLToPath(new URL("..", import.meta.url));
const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

test("tokens.css is generated from tokens.json (run pnpm tokens)", () => {
  assert.equal(readFileSync(TOKENS_CSS, "utf8"), generate(readTokens()));
});

test("tokens.json colours match styles.css :root, the guides' source", () => {
  const root = read("src/styles.css").match(/:root\s*\{([^}]*)\}/)![1]!;
  const css = Object.fromEntries([...root.matchAll(/--([a-z-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2]!.trim()]));
  assert.deepEqual(readTokens().color, css);
});

test("scales: a 4 px space grid; on touch, controls 40 px to see and 44 px to tap", () => {
  const t = readTokens();
  for (const [k, v] of Object.entries(t.space)) assert.equal(v % 4, 0, `--space-${k} is ${v} px`);
  assert.ok(t.size.control!.touch >= 40 && t.size.tap!.touch >= 44 && t.size.row!.touch >= t.size.tap!.touch);
  assert.ok(t.size.tap!.default >= t.size.control!.default, "the tap area is never smaller than the control");
  // Inputs on touch screens use 16 px text or larger, or iOS zooms the page in on focus.
  const field = t.text.field!;
  assert.ok(typeof field !== "number" && field.touch >= 16);
  const sizes = new Set(Object.values(t.text).flatMap((v) => (typeof v === "number" ? [v] : [v.default, v.touch])));
  assert.ok(sizes.size <= 7, "seven text sizes at most");
});

test("numbers use tabular figures: every numeric input and readout", () => {
  const ui = read("src/ui/ui.css");
  const rule = ui.match(/([^{}]+)\{\s*font-variant-numeric: var\(--font-numeric\);\s*\}/)![1]!;
  for (const sel of ['input[inputmode="decimal"]', 'input[inputmode="numeric"]', "output", "td.num", ".tnum", "[data-numeric]"]) assert.ok(rule.includes(sel), `${sel} is tabular`);
  assert.equal(readTokens().numeric, "tabular-nums");
  // The numeric components set an inputmode, so the rule reaches them.
  assert.match(read("src/ui/NumberField.tsx"), /inputMode=\{props\.inputMode \?\? "decimal"\}/);
  assert.match(read("src/ui/Stepper.tsx"), /inputMode="numeric"/);
  assert.match(read("src/ui/Readout.tsx"), /<output>/);
});

test("migrated screens use src/ui/ components, not raw form elements", () => {
  const { tsx } = JSON.parse(read("lint-migrated.json")) as { tsx: string[] };
  const files = tsx.flatMap((g) => globSync(g, { cwd: WEB }));
  assert.ok(files.length > 0, "the list matches files");
  for (const f of files) {
    const src = readFileSync(`${WEB}/${f}`, "utf8");
    const raw = src.match(/<(button|input|select|textarea)[\s>]/);
    assert.equal(raw, null, `${f} has a raw <${raw?.[1]}>: use the src/ui/ component`);
  }
});
