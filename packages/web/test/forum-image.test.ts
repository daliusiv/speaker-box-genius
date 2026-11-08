import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// The forum image copies each chart's computed styles into a standalone SVG (Share.tsx,
// STYLE_PROPS). A property the chart CSS uses but the copy leaves out renders differently:
// without paint-order, the labels' dark halo was painted over their text (dark specks).
test("the forum image copies every style property the charts' SVG CSS uses", () => {
  const share = readFileSync(new URL("../src/Share.tsx", import.meta.url), "utf8");
  const list = share.match(/const STYLE_PROPS = \[([\s\S]*?)\] as const;/)![1]!;
  const copied = new Set([...list.matchAll(/"([a-z-]+)"/g)].map((m) => m[1]));
  const css = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");
  // Rules for the chart's SVG parts: labels, ticks, guide lines, markers, curves.
  const svgRules = [...css.matchAll(/(^|\n)([^{}\n]*\.(?:limit-label|guide-label|marker-label|point-label|tick|unit-label|marker|limit|guide|curve)[^{}\n]*)\{([^}]*)\}/g)];
  assert.ok(svgRules.length > 3, "found the chart rules");
  const SVG_PAINT = /^(fill|stroke|paint-order|opacity|font|text-anchor|dominant-baseline)/;
  for (const r of svgRules) {
    for (const decl of r[3]!.split(";")) {
      const prop = decl.split(":")[0]!.trim();
      if (prop && SVG_PAINT.test(prop) && prop !== "font") assert.ok(copied.has(prop), `${r[2]!.trim()} uses ${prop}, which the forum image doesn't copy`);
    }
  }
});
