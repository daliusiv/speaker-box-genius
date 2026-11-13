/**
 * Several examples, or some of an example's designs, on one guide chart (site/guideCharts.ts and
 * the {{color:…}} placeholders in site/liveNumbers.ts). Kept out of the app's own code paths: the
 * app always draws one project.
 */
import { colorOf, type Design } from "./sim.ts";
import type { AppState, DesignState } from "./state.ts";

/** One example's run: its state and its designs as runDesigns gives them (main, then comparison-driver runs). */
export interface GuideRun {
  state: AppState;
  designs: Design[];
}

/**
 * The designs to draw: `pick` numbers each run's designs from 1 (as the {{num:…}} placeholders do),
 * all of them when it's left out. One run keeps its colours. Several runs are coloured as the app
 * colours one project's designs, in the order given (each example's comparison-driver run takes
 * its box's colour, dashed), and the first run's settings (filter, limits) stand for all. Runs
 * simulated over different ranges are brought onto one grid over the range they share.
 */
export function combineRuns(runs: { run: GuideRun; pick?: number[] }[]): GuideRun {
  if (runs.length === 0) throw new Error("no examples");
  const chosen: { run: GuideRun; designs: Design[] }[] = runs.map(({ run, pick }) => ({
    run,
    designs: pick
      ? pick.map((n) => {
          const d = run.designs[n - 1];
          if (!d) throw new Error(`no design ${n}: the example has ${run.designs.length}`);
          return d;
        })
      : run.designs,
  }));
  if (chosen.length === 1) return { state: chosen[0]!.run.state, designs: chosen[0]!.designs };
  // Examples can simulate different ranges (a baffle or pipe ports go to 1 kHz): bring every
  // design onto one grid, the finest one cut to the range they all share.
  const grids = chosen.map((c) => c.designs[0]!.result.freq);
  const lo = Math.max(...grids.map((g) => g[0]!)), hi = Math.min(...grids.map((g) => g[g.length - 1]!));
  const finest = grids.reduce((a, g) => (g.length / Math.log(g[g.length - 1]! / g[0]!) > a.length / Math.log(a[a.length - 1]! / a[0]!) ? g : a));
  const freq = finest.filter((f) => f >= lo - 1e-9 && f <= hi + 1e-9);
  const same = grids.every((g) => g.length === freq.length && g.every((f, i) => Math.abs(f - freq[i]!) < 1e-9));
  if (!same) for (const c of chosen) c.designs = c.designs.map((d) => ({ ...d, result: resample(d.result, freq) }));
  const ids = new Map<string, string>();
  const boxes: DesignState[] = [];
  chosen.forEach(({ designs }, i) =>
    designs.forEach((d) => {
      const key = `${i}:${d.design.id}`;
      if (ids.has(key)) return;
      const id = `g${i}-${d.design.id}`;
      ids.set(key, id);
      boxes.push({ ...d.design, id });
    }),
  );
  const state: AppState = { ...chosen[0]!.run.state, designs: boxes };
  const designs = chosen.flatMap(({ designs }, i) =>
    designs.map((d) => {
      const id = ids.get(`${i}:${d.design.id}`)!;
      return { ...d, design: { ...d.design, id } as DesignState, color: colorOf(state, id) };
    }),
  );
  return { state, designs };
}

/** "iron-law:1,3+coil-20": the examples (and their designs) one chart or colour placeholder asks for. */
export function parseRunSpec(spec: string): { example: string; pick?: number[] }[] {
  return spec.split("+").map((part) => {
    const m = /^([\w-]+)(?::(\d+(?:,\d+)*))?$/.exec(part);
    if (!m) throw new Error(`"${part}" isn't example or example:1,2`);
    return { example: m[1]!, ...(m[2] ? { pick: m[2].split(",").map(Number) } : {}) };
  });
}

/**
 * A result on another frequency grid: every per-frequency array (one level of nesting too)
 * interpolated on a log-frequency axis; labels per point (what limits it) take the nearest.
 */
function resample<T extends { freq: Float64Array }>(r: T, to: Float64Array): T {
  const from = r.freq;
  const n = from.length;
  const pos = Array.from(to, (f) => {
    let i = 1;
    while (i < n - 1 && from[i]! < f) i++;
    const t = (Math.log(f) - Math.log(from[i - 1]!)) / (Math.log(from[i]!) - Math.log(from[i - 1]!));
    return { i, t: Math.min(1, Math.max(0, t)) };
  });
  const each = (v: unknown, deep: boolean): unknown => {
    if (v instanceof Float64Array && v.length === n) return Float64Array.from(pos, ({ i, t }) => v[i - 1]! + t * (v[i]! - v[i - 1]!));
    if (Array.isArray(v) && v.length === n) return pos.map(({ i, t }) => v[t < 0.5 ? i - 1 : i]);
    if (deep && v && typeof v === "object" && !ArrayBuffer.isView(v) && !Array.isArray(v)) return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, each(x, false)]));
    return v;
  };
  const out = Object.fromEntries(Object.entries(r).map(([k, v]) => [k, each(v, true)])) as T;
  return { ...out, freq: to };
}
