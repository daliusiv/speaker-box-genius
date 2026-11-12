/**
 * The app's charts in the guide pages, drawn at build from the guide's example:
 *
 *   ![caption](chart:car-example/response)          relative response (the app's default view)
 *   ![caption](chart:car-example/spl)               response in dB SPL
 *   ![caption](chart:car-example/excursion)         cone excursion
 *   ![caption](chart:car-example/maxspl)            maximum SPL, with the limits strip
 *   ![caption](chart:car-example/excursion?at=34)   with a fixed cursor at 34 Hz
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

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const KINDS = ["response", "spl", "excursion", "maxspl"] as const;
type Kind = (typeof KINDS)[number];

type Renderer = (state: AppState, kind: Kind, o: { at?: number }) => string;
let renderer: Promise<Renderer> | null = null;

/** Builds the chart bundle (about a second) and loads it, once per process. */
function load(): Promise<Renderer> {
  renderer ??= (async () => {
    execSync("pnpm --filter @sbg/web build:ssr", { cwd: ROOT, stdio: "pipe" });
    const m = (await import(pathToFileURL(join(ROOT, "packages", "web", "ssr-dist", "guideCharts.mjs")).href)) as { renderGuideChart: Renderer };
    return m.renderGuideChart;
  })();
  return renderer;
}

/** Reads `chart:example/kind?at=34`; throws (naming the file) on anything else. */
export function parseChartSrc(src: string, file = "page"): { example: string; kind: Kind; at?: number } {
  const m = /^chart:([\w-]+)\/(\w+)(?:\?at=([\d.]+))?$/.exec(src);
  if (!m) throw new Error(`${file}: "${src}" isn't chart:example/kind (kinds: ${KINDS.join(", ")})`);
  if (!(KINDS as readonly string[]).includes(m[2]!)) throw new Error(`${file}: "${src}": no chart "${m[2]}" (kinds: ${KINDS.join(", ")})`);
  if (!EXAMPLES[m[1]!]) throw new Error(`${file}: "${src}": no example called "${m[1]}" (see site/examples.ts)`);
  return { example: m[1]!, kind: m[2] as Kind, ...(m[3] ? { at: Number(m[3]) } : {}) };
}

/**
 * Draws every chart a page asks for (before the page's Markdown is turned into HTML, which is
 * synchronous); `draw` then hands each one over by its src.
 */
export async function guideCharts(body: string, file = "page"): Promise<{ count: number; style: string; draw: (src: string) => string }> {
  const srcs = [...new Set([...body.matchAll(/!\[[^\]]*\]\((chart:[^)\s]+)\)/g)].map((m) => m[1]!))];
  const drawn = new Map<string, string>();
  if (srcs.length) {
    const render = await load();
    for (const src of srcs) {
      const c = parseChartSrc(src, file);
      drawn.set(src, render(EXAMPLES[c.example]!(), c.kind, c.at === undefined ? {} : { at: c.at }));
    }
  }
  return {
    count: srcs.length,
    style: srcs.length ? appChartCss([...drawn.values()].join("")) + GUIDE_CHART_STYLE : "",
    draw: (src) => {
      const html = drawn.get(src);
      if (html === undefined) throw new Error(`${file}: "${src}" wasn't drawn`);
      return html;
    },
  };
}

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
@media (max-width:560px){.gc-wide{display:none}.gc-narrow{display:block}.guide-chart .chart{padding:.6rem .4rem .5rem}}
`;
