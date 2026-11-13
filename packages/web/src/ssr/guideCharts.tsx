/**
 * The app's charts drawn ahead of time for the guide pages (site/build.ts). Same components and
 * the same chart builders (chartProps.ts) as the app, so a guide's chart is the app's chart.
 * Built with `vite build -c vite.ssr.config.ts` and imported by the site build.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { ChartEmphasis, LogChart } from "../LogChart.tsx";
import { AirChart } from "../AirChart.tsx";
import { delayChart, excursionChart, impedanceChart, maxSplChart, portChart, prChart, pressureChart, responseChart, zaChart, type ChartDraw } from "../chartProps.ts";
import { airLimitOf, driverInputOf, runDesigns, solveDriver, transientsOf } from "../sim.ts";
import { TimeChart } from "../TimeChart.tsx";
import { combineRuns } from "../guideRuns.ts";
import { GUIDE } from "../palette.ts";
import type { AppState } from "../state.ts";

/** The charts a guide can show (the app's chart tabs; "phase" is the impedance chart's phase view, "airmax" the air chart at max SPL). */
export const GUIDE_CHART_KINDS = ["response", "spl", "excursion", "maxspl", "maxvolts", "maxamps", "pr", "port", "pressure", "impedance", "phase", "za", "delay", "impulse", "step", "air", "airmax"] as const;
export type GuideChartKind = (typeof GUIDE_CHART_KINDS)[number];

export interface GuideChartOptions {
  /** A fixed cursor (Hz): its line, dots and values in the legend. */
  at?: number;
  /** Both layouts (the page shows one by width), or only the phone one (a panel beside another). */
  layout?: "both" | "narrow";
}

/** An example's state, and which of its designs to draw (numbered from 1; all when left out). */
export interface GuideChartRun {
  state: AppState;
  pick?: number[];
}

/** The screen widths each chart is drawn for: a phone and the guide's column. */
export const GUIDE_CHART_WIDTHS = { narrow: 360, wide: 700 } as const;

let next = 0;

/**
 * One chart, drawn twice (phone and desktop layouts; the page's CSS shows one), or once at phone
 * width for a panel. `runs` are examples from site/examples.ts: several share one chart (see
 * combineRuns in guideRuns.ts).
 */
export function renderGuideChart(runs: GuideChartRun[], kind: GuideChartKind, o: GuideChartOptions = {}): string {
  const solvedAll = runs.map((r) => solveDriver(r.state));
  if (runs.length > 1 && (kind === "impulse" || kind === "step")) throw new Error(`a ${kind} chart draws one example`);
  const { state, designs } = combineRuns(runs.map((r, i) => ({ run: { state: r.state, designs: runDesigns(r.state, solvedAll[i]!) }, ...(r.pick ? { pick: r.pick } : {}) })));
  const solved = solvedAll[0]!;
  const input = { state, designs, sd_cm2: solved.missing.length > 0 ? undefined : driverInputOf(state, solved).sd_cm2 };
  const draws: Record<Exclude<GuideChartKind, "air" | "airmax" | "impulse" | "step">, () => ChartDraw> = {
    response: () => responseChart(input, "relative"),
    spl: () => responseChart(input, "absolute"),
    excursion: () => excursionChart(input),
    maxspl: () => maxSplChart(input, "spl"),
    maxvolts: () => maxSplChart(input, "volts"),
    maxamps: () => maxSplChart(input, "amps"),
    pr: () => prChart(input),
    port: () => portChart(input),
    pressure: () => pressureChart(input),
    impedance: () => impedanceChart(input, "ohms"),
    phase: () => impedanceChart(input, "phase"),
    za: () => zaChart(input),
    delay: () => delayChart(input),
  };
  const faded = designs.filter((d) => d.compare).map((d) => d.label);
  const main = designs.filter((d) => !d.compare);
  const chart = (still: { width: number; at?: number }) =>
    kind === "impulse" || kind === "step" ? (
      // As the app's Impulse / step tab draws it.
      <TimeChart
        title={kind === "impulse" ? "Impulse response" : "Step response"}
        curves={transientsOf(runs[0]!.state, solved, main)}
        view={kind}
        from_ms={-5}
        to_ms={kind === "impulse" ? 60 : 120}
        still={still}
      />
    ) : kind === "air" || kind === "airmax" ? (
      <AirChart
        designs={designs}
        freq={designs[0]?.result.freq ?? new Float64Array()}
        hidden={false}
        limit_pct={airLimitOf(state)}
        highPassOn={state.highPass.on}
        view={{ unit: "pct", at: kind === "airmax" ? "max" : "now" }}
        onView={() => {}}
        still={still}
      />
    ) : (
      <LogChart {...draws[kind]()} still={still} />
    );
  const one = (layout: keyof typeof GUIDE_CHART_WIDTHS) =>
    // Each drawing gets its own id prefix: clip paths must not collide on a page of charts.
    renderToStaticMarkup(
      <ChartEmphasis.Provider value={faded}>{chart({ width: GUIDE_CHART_WIDTHS[layout], at: o.at })}</ChartEmphasis.Provider>,
      { identifierPrefix: `gc${next++}-` },
    );
  if (o.layout === "narrow") return one("narrow");
  return `<div class="gc-wide">${one("wide")}</div><div class="gc-narrow">${one("narrow")}</div>`;
}

/** A guide figure's own curves (site/figures.ts): plain data, drawn by the same LogChart. */
export interface GuidePlot {
  title: string;
  unit: string;
  freq: number[];
  series: { label: string; color: string; y: number[]; dash?: string }[];
  guides?: { value: number; label: string }[];
  yMin?: number;
  yMax?: number;
  digits?: number;
  noPeak?: boolean;
}

/** One figure chart, in both layouts or the phone one (beside another panel), like renderGuideChart. */
export function renderGuidePlot(p: GuidePlot, layout: "both" | "narrow" = "both"): string {
  const props = {
    title: p.title,
    unit: p.unit,
    freq: Float64Array.from(p.freq),
    series: p.series.map((c) => ({ label: c.label, color: c.color, y: Float64Array.from(c.y), ...(c.dash ? { dash: c.dash } : {}) })),
    ...(p.guides ? { limits: p.guides.map((g) => ({ ...g, color: GUIDE })), limitStyle: "guide" as const } : {}),
    ...(p.yMin === undefined ? {} : { yMin: p.yMin }),
    ...(p.yMax === undefined ? {} : { yMax: p.yMax }),
    ...(p.digits === undefined ? {} : { digits: p.digits }),
    ...(p.noPeak ? { noPeak: true } : {}),
  };
  const one = (l: keyof typeof GUIDE_CHART_WIDTHS) => renderToStaticMarkup(<LogChart {...props} still={{ width: GUIDE_CHART_WIDTHS[l] }} />, { identifierPrefix: `gp${next++}-` });
  if (layout === "narrow") return one("narrow");
  return `<div class="gc-wide">${one("wide")}</div><div class="gc-narrow">${one("narrow")}</div>`;
}
