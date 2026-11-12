import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fillLive } from "./liveNumbers.ts";
import { chartCss, classesIn } from "./appCss.ts";
import { guideCharts, parseChartSrc } from "./guideCharts.ts";

test("live numbers: values, rounding, colours and limits come from the example", () => {
  assert.equal(fillLive("{{num:car-example/1/f3}}"), "42.5");
  assert.equal(fillLive("{{num:car-example/1/f3:2}}"), "42.45");
  assert.equal(fillLive("{{num:car-example/3/len}}"), "116.7");
  assert.equal(fillLive("{{num:car-example/1/limit@25}} / {{num:car-example/3/limit@30}}"), "Xmax / power");
  assert.equal(fillLive("{{color:car-example/1}}, {{color:car-example/2}}, {{color:car-example/3}}"), "blue, orange, light orange");
  assert.equal(fillLive("{{num:car-example/1/xmaxW}}"), "290");
});

test("live numbers: a bad placeholder stops the build and names the page", () => {
  assert.throws(() => fillLive("{{num:car-example/9/f3}}", "x.md"), /x\.md: .*has 3 designs/);
  assert.throws(() => fillLive("{{num:car-example/1/nope}}", "x.md"), /x\.md: .*unknown metric "nope"/);
  assert.throws(() => fillLive("{{num:car-example/1/spl}}", "x.md"), /needs a frequency/);
  assert.throws(() => fillLive("{{num:no-such/1/f3}}", "x.md"), /x\.md: no example called "no-such"/);
  assert.throws(() => fillLive("{{num:car-example/1/port}}", "x.md"), /no port/);
});

test("guide chart styles: the app's rules for the classes the charts use, and its colour tokens", () => {
  const css = `
:root { --bg: #111; font-family: Inter; --accent: #4ed7e9; }
.chart { margin: 0; }
.legend th, .legend td { padding: 1px; }
.lib-table td { color: red; }
.chart-tabs { display: flex; }
.chart.editing svg { cursor: grab; }
@media (max-width: 860px) { .legend { font-size: 1px; } .panel { display: none; } }
@font-face { font-family: X; }`;
  const out = chartCss(css, classesIn('<figure class="chart"><table class="legend"></table><div class="chart-tabs editing"></div></figure>'));
  assert.match(out, /:root\{--bg: #111;--accent: #4ed7e9\}/);
  assert.doesNotMatch(out, /Inter/);
  assert.match(out, /\.chart\{margin: 0;\}/);
  assert.match(out, /\.legend th, \.legend td\{/);
  assert.match(out, /@media \(max-width: 860px\)\{\.legend\{font-size: 1px;\}\}/);
  for (const gone of ["lib-table", "chart-tabs", "editing", "panel", "font-face"]) assert.doesNotMatch(out, new RegExp(gone));
});

test("guide charts: chart:example/kind references are checked", () => {
  assert.deepEqual(parseChartSrc("chart:car-example/excursion?at=34"), { example: "car-example", kind: "excursion", at: 34 });
  assert.throws(() => parseChartSrc("chart:car-example/impedance", "x.md"), /x\.md: .*no chart "impedance"/);
  assert.throws(() => parseChartSrc("chart:nope/response", "x.md"), /no example called "nope"/);
  // Every chart a guide asks for is a real example and kind.
  const pages = join(import.meta.dirname, "pages");
  for (const f of readdirSync(pages).filter((f) => f.endsWith(".md")))
    for (const m of readFileSync(join(pages, f), "utf8").matchAll(/\]\((chart:[^)\s]+)\)/g)) parseChartSrc(m[1]!, f);
});

test("guide charts: the app's chart, drawn for a phone and a desktop, static", async () => {
  const body = "![a](chart:car-example/excursion)\n\n![b](chart:car-example/response?at=30)";
  const c = await guideCharts(body, "x.md");
  assert.equal(c.count, 2);
  const ex = c.draw("chart:car-example/excursion");
  assert.equal(ex.match(/<figure class="chart"/g)?.length, 2, "wide and narrow");
  assert.match(ex, /class="gc-wide"/);
  assert.match(ex, /class="gc-narrow"/);
  assert.match(ex, /Xmax 12\.3 mm/);
  for (const name of ["Sealed 28 L", "Ported 45 L, 33 Hz", "Ported 45 L, 28 Hz"]) assert.match(ex, new RegExp(name));
  assert.doesNotMatch(ex, /Hover or tap/, "no hover hint on a static chart");
  // A fixed cursor: its badge and the cursor column.
  const at = c.draw("chart:car-example/response?at=30");
  assert.match(at, /cursor-badge/);
  assert.match(at, /@ 30\.\d Hz/);
  // Clip-path ids are unique across every drawing on the page.
  const ids = [...(ex + at).matchAll(/ id="([^"]+)"/g)].map((m) => m[1]);
  assert.equal(new Set(ids).size, ids.length);
  // The page's style: the app's chart rules (the dashed −3 dB guides included), and the layout switch.
  assert.match(c.style, /\.guide\{/);
  assert.match(c.style, /\.gc-narrow\{display:none\}/);
  assert.throws(() => c.draw("chart:car-example/maxspl"), /wasn't drawn/);
});
