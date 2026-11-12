/**
 * The app's chart styles, taken from packages/web/src/styles.css for the guide pages' charts
 * (drawn at build by the app's own chart component), so a redesign of the app's charts reaches
 * the guides with no copy to keep in step.
 *
 * Kept: the colour tokens (custom properties) of `:root`, and every rule (top level or inside an
 * @media block) whose selectors name only classes the drawn charts use: so a rule for a new part
 * of a chart comes along by itself, and the app's layout rules (tabs, panels, editing) don't.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const STYLES = join(dirname(fileURLToPath(import.meta.url)), "..", "packages", "web", "src", "styles.css");

/** Rules about the app's controls around a chart, even where the guide's markup shares a class. */
const APP_ONLY = /\.chart-tabs|\.editing|\.handle|\.unit-switch|\.chip|\.edit-|\.flash|\.chart-readout|\[data-forum/;

interface Block {
  head: string;
  body: string;
}

/** Splits CSS into top-level blocks (comments removed); nested braces stay inside a block's body. */
function blocks(css: string): Block[] {
  const src = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const out: Block[] = [];
  let i = 0;
  while (i < src.length) {
    const open = src.indexOf("{", i);
    if (open < 0) break;
    let depth = 1;
    let j = open + 1;
    for (; j < src.length && depth > 0; j++) {
      if (src[j] === "{") depth++;
      else if (src[j] === "}") depth--;
    }
    out.push({ head: src.slice(i, open).trim(), body: src.slice(open + 1, j - 1) });
    i = j;
  }
  return out;
}

/** The classes a piece of HTML uses. */
export function classesIn(html: string): Set<string> {
  const out = new Set<string>();
  for (const m of html.matchAll(/\sclass="([^"]*)"/g)) for (const c of m[1]!.split(/\s+/)) if (c) out.add(c);
  return out;
}

const isChartRule = (head: string, used: Set<string>) =>
  !APP_ONLY.test(head) &&
  head
    .split(",")
    .map((s) => s.trim())
    .every((sel) => {
      const classes = [...sel.matchAll(/\.([\w-]+)/g)].map((m) => m[1]!);
      return classes.length > 0 && classes.every((c) => used.has(c));
    });

/** The chart rules of a stylesheet (exported for tests). */
export function chartCss(css: string, used: Set<string>): string {
  const out: string[] = [];
  for (const b of blocks(css)) {
    if (b.head === ":root") {
      const vars = b.body
        .split(";")
        .map((d) => d.trim())
        .filter((d) => d.startsWith("--"));
      if (vars.length) out.push(`:root{${vars.join(";")}}`);
    } else if (b.head.startsWith("@media")) {
      const inner = blocks(b.body).filter((r) => isChartRule(r.head, used));
      if (inner.length) out.push(`${b.head}{${inner.map((r) => `${r.head}{${r.body.trim()}}`).join("")}}`);
    } else if (!b.head.startsWith("@") && isChartRule(b.head, used)) {
      out.push(`${b.head}{${b.body.trim()}}`);
    }
  }
  return out.join("\n").replace(/\s*\n\s*/g, "\n");
}

let source: string | null = null;
/** The app's styles for these chart drawings (`html`: the drawn charts). */
export function appChartCss(html: string): string {
  return chartCss((source ??= readFileSync(STYLES, "utf8")), classesIn(html));
}
