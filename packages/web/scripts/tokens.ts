/**
 * Writes src/ui/tokens.css from src/ui/tokens.json (the one place the UI's scales are set).
 *
 *   node --experimental-strip-types packages/web/scripts/tokens.ts           write tokens.css
 *   node --experimental-strip-types packages/web/scripts/tokens.ts --check   fail if it is stale
 *
 * Colours are not written: styles.css :root still owns them (site/appCss.ts reads them from
 * there), and test/ui-tokens.test.ts keeps both lists equal.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

type Sized = { default: number; touch: number };
export interface Tokens {
  color: Record<string, string>;
  space: Record<string, number>;
  text: Record<string, number | Sized>;
  leading: Record<string, number>;
  weight: Record<string, number>;
  radius: Record<string, number>;
  size: Record<string, Sized>;
  border: Record<string, number>;
  z: Record<string, number>;
  motion: Record<string, string>;
  numeric: string;
}

export const TOKENS_JSON = fileURLToPath(new URL("../src/ui/tokens.json", import.meta.url));
export const TOKENS_CSS = fileURLToPath(new URL("../src/ui/tokens.css", import.meta.url));

/**
 * Touch screens get the larger sizes: controls look 40 px tall and take taps across 44 px.
 * The input decides, not the width: a narrow desktop window stays compact.
 */
export const TOUCH_QUERY = "(pointer: coarse)";

const px = (n: number) => `${n}px`;
const base = (v: number | Sized) => (typeof v === "number" ? v : v.default);

export function generate(t: Tokens): string {
  const lines: string[] = [];
  const group = (title: string, entries: [string, string][]) => {
    lines.push(`  /* ${title} */`);
    for (const [k, v] of entries) lines.push(`  --${k}: ${v};`);
  };
  group("Space: a 4 px grid", Object.entries(t.space).map(([k, v]) => [`space-${k}`, px(v)]));
  group("Type", [
    ...Object.entries(t.text).map(([k, v]): [string, string] => [`text-${k}`, px(base(v))]),
    ...Object.entries(t.leading).map(([k, v]): [string, string] => [`leading-${k}`, String(v)]),
    ...Object.entries(t.weight).map(([k, v]): [string, string] => [`weight-${k}`, String(v)]),
    ["font-numeric", t.numeric],
  ]);
  group("Radius", Object.entries(t.radius).map(([k, v]) => [`radius-${k}`, px(v)]));
  group("Sizes (touch values below)", Object.entries(t.size).map(([k, v]) => [`size-${k}`, px(v.default)]));
  group("Borders", Object.entries(t.border).map(([k, v]) => [`border-${k}`, px(v)]));
  group("Layers", Object.entries(t.z).map(([k, v]) => [`z-${k}`, String(v)]));
  group("Motion", Object.entries(t.motion).map(([k, v]) => [`motion-${k}`, v]));

  const touched = (prefix: string, g: Record<string, number | Sized>) =>
    Object.entries(g).flatMap(([k, v]) => (typeof v === "number" || v.touch === v.default ? [] : [`    --${prefix}-${k}: ${px(v.touch)};`]));
  const touch = [...touched("text", t.text), ...touched("size", t.size)];

  return [
    "/* Generated from tokens.json by packages/web/scripts/tokens.ts (`pnpm tokens`). Do not edit. */",
    ":root {",
    ...lines,
    "}",
    "",
    `@media ${TOUCH_QUERY} {`,
    "  :root {",
    ...touch,
    "  }",
    "}",
    "",
  ].join("\n");
}

export const readTokens = (): Tokens => JSON.parse(readFileSync(TOKENS_JSON, "utf8")) as Tokens;

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const css = generate(readTokens());
  if (process.argv.includes("--check")) {
    if (readFileSync(TOKENS_CSS, "utf8") !== css) {
      console.error("src/ui/tokens.css is stale: run `pnpm tokens`.");
      process.exit(1);
    }
  } else {
    writeFileSync(TOKENS_CSS, css);
    console.log("Wrote src/ui/tokens.css");
  }
}
