import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fillLive } from "./liveNumbers.ts";
import { chartCss, classesIn } from "./appCss.ts";
import { guideCharts, parseChartSrc } from "./guideCharts.ts";
import { markdown } from "./build.ts";

test("live numbers: values, rounding, colours and limits come from the example", () => {
  assert.equal(fillLive("{{num:car-example/1/f3}}"), "42.5");
  assert.equal(fillLive("{{num:car-example/1/f3:2}}"), "42.45");
  assert.equal(fillLive("{{num:car-example/3/len}}"), "116.7");
  assert.equal(fillLive("{{num:car-example/1/limit@25}} / {{num:car-example/3/limit@30}}"), "Xmax / power");
  assert.equal(fillLive("{{color:car-example/1}}, {{color:car-example/2}}, {{color:car-example/3}}"), "blue, orange, light orange");
  assert.equal(fillLive("{{num:car-example/1/xmaxW}}"), "290");
});

test("live numbers: drive volts, amplifier watts, LT boost, 10 V level and lowest impedance", () => {
  // 40 W into the drive's Re is 11.8 V; the LT's boost from fc 49.2 Hz to 25 Hz is 40·log10(49.2/25).
  assert.equal(fillLive("{{num:lt-example/1/vset}}"), "11.8");
  assert.equal(fillLive("{{num:lt-example/2/boost@25}} dB, ×{{num:lt-example/2/boostx@25}}"), "11.8 dB, ×15");
  assert.ok(Number(fillLive("{{num:lt-example/1/vout@25}}")) > 11.8 * 2, "the LT's boost reaches the amp");
  assert.ok(Number(fillLive("{{num:lt-example/2/vw@25}}")) > Number(fillLive("{{num:lt-example/2/pw@25}}")), "V²/Re is above the real watts");
  // An isobaric pair in series: 6 dB less per volt, twice the impedance.
  assert.equal(fillLive("{{num:iso-single/1/zmin}} {{num:iso-series/1/zmin}}"), "3.6 7.1");
  assert.equal(fillLive("{{diff:iso-single/1/iso-series/1/v10@60:0}}"), "6");
});

test("live numbers: typographic minus, level against the passband, a tuned box's impedance peaks", () => {
  assert.equal(fillLive("{{num:stuffing-ported-empty/1/rel@30}}"), "−12.7");
  assert.equal(fillLive("{{diff:car-example/1/car-example/1/f3}}"), "0.0");
  assert.equal(fillLive("{{num:losses-ql10/1/zlo}} @ {{num:losses-ql10/1/zlof}}, {{num:losses-ql10/1/zpk}} @ {{num:losses-ql10/1/zpkf}}"), "28.6 @ 19, 26.9 @ 73");
  assert.throws(() => fillLive("{{num:stuffing-sealed/1/zpk}}", "x.md"), /tuned box/);
  assert.equal(fillLive("{{num:subsonic-off/1/xr}} × Xmax"), "2.4 × Xmax");
  assert.equal(fillLive("{{num:tl-example/3/linelen}} cm, {{num:tl-example/3/vol}} L, {{num:tl-example/3/portd}} cm port"), "86 cm, 24 L, 7.3 cm port");
  assert.throws(() => fillLive("{{num:car-example/1/ripple}}", "x.md"), /needs a line/);
  assert.equal(fillLive("{{num:assistant-example/1/x20}} / {{num:assistant-example/1/prx20}}"), "9.5 / 14.0");
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
  assert.deepEqual(parseChartSrc("chart:car-example/excursion?at=34"), [{ runs: [{ example: "car-example" }], kind: "excursion", at: 34 }]);
  assert.deepEqual(parseChartSrc("chart:iron-law:1,3+coil-20/spl|iron-law:2,4/maxspl"), [
    { runs: [{ example: "iron-law", pick: [1, 3] }, { example: "coil-20" }], kind: "spl" },
    { runs: [{ example: "iron-law", pick: [2, 4] }], kind: "maxspl" },
  ]);
  assert.throws(() => parseChartSrc("chart:a/spl|a/spl|a/spl|a/spl", "x.md"), /at most 3/);
  assert.throws(() => parseChartSrc("chart:car-example/transient", "x.md"), /x\.md: .*no chart "transient"/);
  assert.throws(() => parseChartSrc("chart:nope/response", "x.md"), /no example called "nope"/);
  // Every chart a guide asks for is a real example and kind.
  const pages = join(import.meta.dirname, "pages");
  for (const f of readdirSync(pages).filter((f) => f.endsWith(".md")))
    for (const m of readFileSync(join(pages, f), "utf8").matchAll(/\]\((chart:[^)\s]+)(?: "[^"]*")?\)/g)) parseChartSrc(m[1]!, f);
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

test("guide charts: some designs, several examples on one chart, and charts side by side", async () => {
  const pick = "chart:iron-law:1,3/spl";
  const both = "chart:coil-20+coil-120+coil-180/spl";
  const panels = "chart:iron-law:1,3/spl|iron-law:2,4/spl";
  const c = await guideCharts(`![a](${pick})\n\n![b](${both})\n\n![c](${panels})`, "x.md");
  // Designs 1 and 3 only: the PA box with each driver.
  const p = c.draw(pick);
  assert.match(p, /PA box: 150 L, 35 Hz · 18SW115/);
  assert.match(p, /PA box: 150 L, 35 Hz · SS18-22/);
  assert.doesNotMatch(p, /Home box/);
  // Three one-design examples on one chart, coloured as one project's three ported boxes; the colour words agree.
  const b = c.draw(both).slice(0, c.draw(both).indexOf('class="gc-narrow"'));
  for (const name of ["coil at 20 °C", "coil at 120 °C", "coil at 180 °C"]) assert.match(b, new RegExp(name));
  for (const color of ["#f97316", "#fdba74", "#c2410c"]) assert.match(b, new RegExp(`background:${color}`));
  assert.equal(fillLive("{{color:coil-20+coil-120+coil-180/1}}, {{color:coil-20+coil-120+coil-180/2}}, {{color:coil-20+coil-120+coil-180/3}}"), "orange, light orange, dark orange");
  assert.equal(fillLive("{{color:coil-120/1}}"), "orange", "on its own it keeps its own colour");
  // Side by side: one phone-width drawing each, in a two-column grid that stacks on phones.
  const g = c.draw(panels);
  assert.match(g, /^<div class="gc-panels gc-2">/);
  assert.equal(g.match(/<figure class="chart"/g)?.length, 2);
  assert.doesNotMatch(g, /gc-wide/);
  assert.match(c.style, /\.gc-panels\.gc-2\{grid-template-columns:repeat\(2/);
  assert.match(c.style, /max-width:560px.*\.gc-panels\.gc-2,\.gc-panels\.gc-3\{grid-template-columns:1fr\}/s);
  // A title labels each chart (so a caption needn't say left or right, which is top and bottom on a phone).
  const t = c.draw(panels, "PA box|Home & <garage>");
  assert.match(t, /<div><div class="gc-label">PA box<\/div><figure/);
  assert.match(t, /<div class="gc-label">Home &amp; &lt;garage&gt;<\/div>/);
  assert.throws(() => c.draw(panels, "Only one"), /one label per chart/);
  assert.match(markdown('![cap](chart:x/spl "A")', (src, title) => `[${src} ${title}]`), /\[chart:x\/spl A\]/);
  assert.throws(() => markdown('![cap](img/a.png "A")'), /only chart figures take a title/);
  await assert.rejects(guideCharts("![](chart:iron-law:9/spl)", "x.md"), /x\.md: .*no design 9/);
  await assert.rejects(guideCharts("![](chart:coil-20+coil-120/impulse)", "x.md"), /one example/);
});

test("guide figures: the engine's own curves, drawn like the charts, with values for the caption", async () => {
  const c = await guideCharts("![a](figure:car-cabin-length)\n\n![b](figure:baffle-step-placement)", "x.md");
  // One chart: both layouts, the four cabins, no Peak column.
  const one = c.draw("figure:car-cabin-length");
  assert.match(one, /class="gc-wide"/);
  for (const n of ["1.8 m", "2.5 m \\(the app&#x27;s car preset\\)", "3.5 m", "4.5 m"]) assert.match(one, new RegExp(n));
  // Two panels: the figure's own curves beside an app chart, each labelled by the figure.
  const two = c.draw("figure:baffle-step-placement");
  assert.match(two, /^<div class="gc-panels gc-2"><div><div class="gc-label">30 × 30 cm baffle<\/div>/);
  assert.match(two, /<div class="gc-label">Maximum SPL of the bookshelf<\/div><figure class="chart" data-chart="maxspl"/);
  assert.throws(() => c.draw("figure:baffle-step-placement", "A|B"), /labels its own charts/);
  // Values for the text, and the errors that stop the build.
  assert.equal(fillLive("{{fig:car-cabin-length/at30_250}} dB from {{fig:car-cabin-length/start_250:0}} Hz"), "12.9 dB from 69 Hz");
  assert.equal(fillLive("{{fig:subs-difference/sealedColor}}"), "blue");
  assert.throws(() => fillLive("{{fig:nope/x}}", "x.md"), /x\.md: .*no figure called "nope"/);
  assert.throws(() => fillLive("{{fig:car-cabin-length/nope}}", "x.md"), /has no value "nope"/);
  await assert.rejects(guideCharts("![](figure:nope)", "x.md"), /x\.md: .*no figure called "nope"/);
  // Examples simulated over different ranges (baffle step on: to 1 kHz; off: to 500 Hz) share one grid, over the range both cover.
  const { combineRuns } = await import("../packages/web/src/guideRuns.ts");
  const { EXAMPLES } = await import("./examples.ts");
  const { runDesigns, solveDriver } = await import("../packages/web/src/sim.ts");
  const runOf = (k: string) => { const s = EXAMPLES[k]!(); return { state: s, designs: runDesigns(s, solveDriver(s)) }; };
  const ib = runOf("baffle-ib"), free = runOf("baffle-free");
  assert.notEqual(ib.designs[0]!.result.freq.length, free.designs[0]!.result.freq.length);
  const both = combineRuns([{ run: ib }, { run: free }]);
  const f = both.designs[0]!.result.freq;
  for (const d of both.designs) assert.equal(d.result.freq, f), assert.equal(d.result.spl.length, f.length);
  assert.ok(f[f.length - 1]! <= 500.001 && f.length >= 300, "the finer grid, to 500 Hz");
  const i100 = f.findIndex((x) => x >= 100);
  const j100 = free.designs[0]!.result.freq.findIndex((x) => x >= f[i100]! - 1e-9);
  assert.ok(Math.abs(both.designs[1]!.result.spl[i100]! - free.designs[0]!.result.spl[j100]!) < 0.05, "values carried over");
});

test("guide figures: x–y charts for axes that aren't frequency, and a four-chart figure", async () => {
  const c = await guideCharts("![a](figure:amp-matching)\n\n![b](figure:dvc-wiring)", "x.md");
  const amp = c.draw("figure:amp-matching");
  assert.match(amp, /class="gc-wide"/);
  assert.match(amp, /<figure class="chart xy">/);
  assert.match(amp, /load impedance, Ω/);
  for (const d of ["550 W @ 2 Ω", "1100 W bridged @ 4 Ω"]) assert.match(amp, new RegExp(d));
  assert.match(amp, /One sub 3\.15–17\.5 Ω/);
  assert.match(amp, /<ul class="xy-legend"><li>/);
  // Deterministic: drawing the same figure again gives the same ids (pages must not change between builds).
  assert.doesNotMatch(amp, /Math\.random/);
  const dvc = c.draw("figure:dvc-wiring");
  assert.match(dvc, /^<div class="gc-panels gc-4">/);
  assert.equal(dvc.match(/class="gc-label"/g)?.length, 4);
  assert.match(c.style, /\.gc-panels\.gc-4\{grid-template-columns:repeat\(2/);
  assert.match(c.style, /\.xy-legend\{/);
});

test("guide charts: the site and the drawing agree on the chart kinds", () => {
  const list = (src: string, name: string) => JSON.parse(new RegExp(`${name} = (\\[[^\\]]*\\])`).exec(src)![1]!.replace(/\s+/g, " ")) as string[];
  const site = list(readFileSync(join(import.meta.dirname, "guideCharts.ts"), "utf8"), "KINDS");
  const drawn = list(readFileSync(join(import.meta.dirname, "..", "packages", "web", "src", "ssr", "guideCharts.tsx"), "utf8"), "GUIDE_CHART_KINDS");
  assert.deepEqual(site, drawn);
});

test("guide charts: every kind draws", async () => {
  const kinds = ["response", "spl", "excursion", "maxspl", "maxvolts", "maxamps", "impedance", "phase", "delay", "impulse", "step", "air", "airmax"];
  const body = kinds.map((k) => `![${k}](chart:box-types-example/${k})`).join("\n\n") + "\n\n![](chart:box-types-example/pr)\n\n![](chart:box-types-example/port)\n\n![](chart:box-types-example/pressure)\n\n![](chart:tl-example/za)";
  const c = await guideCharts(body, "x.md");
  for (const m of body.matchAll(/\((chart:[^)]+)\)/g)) assert.match(c.draw(m[1]!), /<svg/, m[1]);
  assert.doesNotMatch(c.draw("chart:box-types-example/air"), /unit-switch|info-button/, "no switches or (i) on a static chart");
});

test("guide share cards: the guide's title, the chart without its legend table, and the curves' names", async () => {
  const { guideCardHtml } = await import("./guideCharts.ts");
  const html = await guideCardHtml("Car <subs>", "chart:car-example/response", "x.md");
  assert.match(html, /<h1>Car &lt;subs&gt;<\/h1>/);
  assert.match(html, /<svg/);
  assert.match(html, /\.plot \.chart figcaption,\.plot \.legend-wrap/);
  for (const n of ["Sealed 28 L", "Ported 45 L, 33 Hz", "Ported 45 L, 28 Hz"]) assert.match(html, new RegExp(`</i>${n}</span>`));
  assert.ok(!html.includes('class="gc-narrow"'), "desktop drawing only");
});

test("live numbers: differences, comparison-driver runs and the extra metrics", () => {
  // Design 2 minus design 1, here and across examples; the comparison driver's runs come after the main ones.
  assert.match(fillLive("{{diff:compare-example/1/3/f3:1}}"), /^−12\.[34]$/);
  assert.match(fillLive("{{diff:car-example/1/car-nocabin/1/spl@30}}"), /^\d+\.\d$/);
  assert.equal(fillLive("{{num:compare-example/3/qtc}}"), "0.51");
  assert.match(fillLive("{{num:box-types-example/1/w@25}} {{num:box-types-example/3/prx}} {{num:box-types-example/2/gd@40}} {{num:compare-example/4/volts@30}}"), /^\d+ \d+\.\d \d+\.\d \d+\.\d$/);
  assert.throws(() => fillLive("{{num:box-types-example/1/prx}}", "x.md"), /no passive radiators/);
});

test("live numbers: who leads, by how much", () => {
  assert.equal(fillLive("{{lead:subs-example/1/3/max@25|15″|10s| dB}}"), "15″ +2.5 dB");
  assert.match(fillLive("{{lead:subs-example/1/3/max@80|15″|10s| dB}}"), /^10s \+1\.\d dB$/);
  assert.equal(fillLive("{{lead:subs-example/2/4/max@20|15″|10s| dB}}"), "same");
  assert.match(fillLive("{{num:subs-example/1/xin}}"), /^\d\.\d$/);
});

test("live numbers: group delay peak and cycles", () => {
  assert.match(fillLive("{{num:group-delay/2/gdp}} {{num:group-delay/2/gdpf}} {{num:group-delay/2/gdc@40}}"), /^\d+\.\d \d+\.?\d? 0\.\d\d$/);
});
