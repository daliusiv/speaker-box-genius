/**
 * The app's charts in the guide pages, drawn at build from the guide's example:
 *
 *   ![caption](chart:car-example/response)          relative response (the app's default view)
 *   ![caption](chart:car-example/spl)               response in dB SPL
 *   ![caption](chart:car-example/excursion)         cone excursion
 *   ![caption](chart:car-example/maxspl)            maximum SPL, with the limits strip
 *   also maxvolts and maxamps (the amplifier volts/current for max SPL), pr, port, pressure, impedance, phase, za, delay, impulse, step, air and airmax (air distortion at max SPL)
 *   ![caption](chart:car-example/excursion?at=34)   with a fixed cursor at 34 Hz
 *   ![caption](chart:iron-law:1,3/spl)                 only designs 1 and 3 (numbered as {{num:…}} numbers them)
 *   ![caption](chart:coil-20+coil-120/spl)             several examples on one chart, coloured as one project
 *   ![caption](chart:iron-law:1,3/spl|iron-law:2,4/spl "PA box|Home box")  two (or three) charts side by
 *       side, stacked on phones; the title (optional) labels each chart, so the caption needn't say left or right
 *   ![caption](figure:subs-difference)   a figure worked out from the engine but not an app chart (site/figures.ts)
 *
 * The drawing is packages/web/src/ssr/guideCharts.tsx (the app's own LogChart and chart builders),
 * bundled for Node by Vite once per build; the styles are the app's (site/appCss.ts).
 */
import { execSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { EXAMPLES } from "./examples.ts";
import { appChartCss } from "./appCss.ts";
import type { AppState } from "../packages/web/src/state.ts";
import { parseRunSpec } from "../packages/web/src/guideRuns.ts";
import { figure, type FigurePlot } from "./figures.ts";
import { renderXY, XY_STYLE } from "./xyPlot.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const KINDS = ["response", "spl", "excursion", "maxspl", "maxvolts", "maxamps", "pr", "port", "pressure", "impedance", "phase", "za", "delay", "impulse", "step", "air", "airmax"] as const;
type Kind = (typeof KINDS)[number];

type Run = { state: AppState; pick?: number[] };
type Renderer = (runs: Run[], kind: Kind, o: { at?: number; layout?: "both" | "narrow" }) => string;
/** One chart of a figure: its examples (and designs), its kind, an optional cursor. */
export interface ChartPanel {
  runs: { example: string; pick?: number[] }[];
  kind: Kind;
  at?: number;
}
const MAX_PANELS = 3;
let renderer: Promise<{ chart: Renderer; plot: (p: FigurePlot, layout: "both" | "narrow") => string }> | null = null;

/** Builds the chart bundle (about a second) and loads it, once per process. */
function load(): Promise<{ chart: Renderer; plot: (p: FigurePlot, layout: "both" | "narrow") => string }> {
  renderer ??= (async () => {
    execSync("pnpm --filter @sbg/web build:ssr", { cwd: ROOT, stdio: "pipe" });
    const m = (await import(pathToFileURL(join(ROOT, "packages", "web", "ssr-dist", "guideCharts.mjs")).href)) as { renderGuideChart: Renderer; renderGuidePlot: (p: FigurePlot, layout: "both" | "narrow") => string };
    return { chart: m.renderGuideChart, plot: m.renderGuidePlot };
  })();
  return renderer;
}

/** Reads `chart:example/kind?at=34` (and the forms above); throws (naming the file) on anything else. */
export function parseChartSrc(src: string, file = "page"): ChartPanel[] {
  if (!src.startsWith("chart:")) throw new Error(`${file}: "${src}" isn't chart:example/kind`);
  const parts = src.slice(6).split("|");
  if (parts.length > MAX_PANELS) throw new Error(`${file}: "${src}": at most ${MAX_PANELS} charts side by side`);
  return parts.map((part) => {
    const m = /^([\w:,+-]+)\/(\w+)(?:\?at=([\d.]+))?$/.exec(part);
    if (!m) throw new Error(`${file}: "${src}" isn't chart:example/kind (kinds: ${KINDS.join(", ")})`);
    if (!(KINDS as readonly string[]).includes(m[2]!)) throw new Error(`${file}: "${src}": no chart "${m[2]}" (kinds: ${KINDS.join(", ")})`);
    let runs: ChartPanel["runs"];
    try {
      runs = parseRunSpec(m[1]!);
    } catch (e) {
      throw new Error(`${file}: "${src}": ${(e as Error).message}`);
    }
    for (const r of runs) if (!EXAMPLES[r.example]) throw new Error(`${file}: "${src}": no example called "${r.example}" (see site/examples.ts)`);
    return { runs, kind: m[2] as Kind, ...(m[3] ? { at: Number(m[3]) } : {}) };
  });
}

/** Draws one panel (both layouts, or the phone one beside another panel). */
function drawPanel(render: Renderer, p: ChartPanel, layout: "both" | "narrow", src: string, file: string): string {
  try {
    return render(
      p.runs.map((r) => ({ state: EXAMPLES[r.example]!(), ...(r.pick ? { pick: r.pick } : {}) })),
      p.kind,
      { ...(p.at === undefined ? {} : { at: p.at }), layout },
    );
  } catch (e) {
    throw new Error(`${file}: "${src}": ${(e as Error).message}`);
  }
}

/**
 * Draws every chart a page asks for (before the page's Markdown is turned into HTML, which is
 * synchronous); `draw` then hands each one over by its src.
 */
export async function guideCharts(body: string, file = "page"): Promise<{ count: number; style: string; draw: (src: string, title?: string) => string }> {
  const srcs = [...new Set([...body.matchAll(/!\[[^\]]*\]\(((?:chart|figure):[^)\s]+)(?: "[^"]*")?\)/g)].map((m) => m[1]!))];
  const drawn = new Map<string, string | string[]>();
  const labelled = new Map<string, string[]>();
  if (srcs.length) {
    const r = await load();
    for (const src of srcs) {
      if (src.startsWith("figure:")) {
        // A figure (site/figures.ts): its own curves, app charts, or both; each panel labelled by the figure.
        const name = src.slice(7);
        let f;
        try {
          f = figure(name);
        } catch (e) {
          throw new Error(`${file}: "${src}": ${(e as Error).message}`);
        }
        const layout = f.panels.length === 1 ? "both" : "narrow";
        const html = f.panels.map((p) => ("plot" in p ? r.plot(p.plot, layout) : "xy" in p ? renderXY(p.xy, layout) : drawPanel(r.chart, parseChartSrc(`chart:${p.chart}`, file)[0]!, layout, src, file)));
        labelled.set(src, f.panels.map((p) => p.label ?? ""));
        drawn.set(src, f.panels.length === 1 ? html[0]! : html);
        continue;
      }
      const panels = parseChartSrc(src, file);
      drawn.set(src, panels.length === 1 ? drawPanel(r.chart, panels[0]!, "both", src, file) : panels.map((p) => drawPanel(r.chart, p, "narrow", src, file)));
    }
  }
  return {
    count: srcs.length,
    style: srcs.length ? appChartCss([...drawn.values()].flat().join("")) + GUIDE_CHART_STYLE + XY_STYLE : "",
    draw: (src, title) => {
      const html = drawn.get(src);
      if (html === undefined) throw new Error(`${file}: "${src}" wasn't drawn`);
      if (title !== undefined && labelled.has(src)) throw new Error(`${file}: "${src}": a figure labels its own charts`);
      const labels = labelled.get(src) ?? (title === undefined ? [] : title.split("|"));
      if (title !== undefined && labels.length !== (typeof html === "string" ? 1 : html.length)) throw new Error(`${file}: "${src}": the title "${title}" needs one label per chart, split by |`);
      const label = (i: number) => (labels[i] ? `<div class="gc-label">${esc(labels[i]!)}</div>` : "");
      if (typeof html === "string") return label(0) + html;
      return `<div class="gc-panels gc-${html.length}">${html.map((h, i) => `<div>${label(i)}${h}</div>`).join("")}</div>`;
    },
  };
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** The app's chart styles, fitted into a guide page (whose own figure, table and caption styles are broader). */
export const GUIDE_CHART_STYLE = `
.guide-chart .chart{padding:.8rem .9rem .6rem;border:1px solid var(--border);border-radius:.7rem;background:var(--card)}
.guide-chart .chart figcaption{margin:0 0 .3rem;color:var(--fg);font-size:.85rem}
.guide-chart .chart-title{white-space:normal!important;overflow:visible!important}
.guide-chart .legend th,.guide-chart .legend td{border-bottom:0}
.guide-chart .legend{margin:0}
.guide-chart .legend-wrap{overflow-x:auto}
.guide-chart > figcaption{margin-top:.5rem}
.gc-narrow{display:none}
.gc-panels{display:grid;gap:.6rem;align-items:start}
.gc-panels.gc-2{grid-template-columns:repeat(2,minmax(0,1fr))}
.gc-panels.gc-3{grid-template-columns:repeat(3,minmax(0,1fr))}
.gc-panels .chart{padding:.6rem .5rem .5rem}
.gc-label{margin:0 0 .3rem;color:var(--muted);font-size:.85rem;font-weight:600}
@media (max-width:560px){.gc-wide{display:none}.gc-narrow{display:block}.guide-chart .chart{padding:.6rem .4rem .5rem}.gc-panels.gc-2,.gc-panels.gc-3{grid-template-columns:1fr}}
`;

/** "Name": the curve labels and colours from a drawn chart's legend, for a share card. */
function legendOf(html: string): { color: string; label: string }[] {
  const out: { color: string; label: string }[] = [];
  for (const m of html.matchAll(/<span class="legend-swatch" style="background:([^";]+)[^"]*"[^>]*><\/span><span class="legend-label"[^>]*>([^<]*)</g)) out.push({ color: m[1]!, label: m[2]! });
  return out;
}

/**
 * A guide's share card (1200 × 630), as a page for headless Chrome: the guide's title, the chart
 * (`chart:example/kind`, or the first chart of a figure; the app's desktop drawing without its legend table) and its curves' names.
 */
export async function guideCardHtml(title: string, src: string, file = "page"): Promise<string> {
  // A figure of several charts: its first one.
  const r = await load();
  const both = drawPanel(r.chart, parseChartSrc(src, file)[0]!, "both", src, file);
  const wide = both.slice(0, both.indexOf('<div class="gc-narrow">'));
  const names = legendOf(wide).slice(0, 4);
  return `<!doctype html><html><head><meta charset="utf-8"><style>
${appChartCss(wide)}
html,body{margin:0;width:1200px;height:630px;overflow:hidden;background:#11141a;color:#e6e9ef;font-family:Inter,"Segoe UI",Roboto,"DejaVu Sans",Arial,sans-serif}
.card{box-sizing:border-box;width:1200px;height:630px;padding:34px 44px 26px;display:flex;flex-direction:column}
.site{color:#8b93a3;font-size:22px;font-weight:600}
.site b{color:#fb923c}
h1{margin:6px 0 10px;font-size:42px;line-height:1.12;letter-spacing:-.01em;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.plot{flex:1;min-height:0;display:flex;justify-content:center}
.plot .gc-wide,.plot figure.chart,.plot .chart-body{height:100%}
.plot figure.chart{display:flex;flex-direction:column}
.plot .chart figcaption,.plot .legend-wrap,.plot [role=status]{display:none}
.plot svg{height:100%;width:auto;max-width:100%}
.names{display:flex;flex-wrap:wrap;gap:6px 26px;font-size:20px;color:#c4cad6}
.names i{display:inline-block;width:14px;height:14px;border-radius:3px;margin-right:8px;vertical-align:-1px}
</style></head><body><div class="card">
<div class="site"><b>●</b> Speaker Box Genius · Guides</div>
<h1>${esc(title)}</h1>
<div class="plot">${wide}</div>
<div class="names">${names.map((n) => `<span><i style="background:${n.color}"></i>${esc(n.label)}</span>`).join("")}</div>
</div></body></html>`;
}
