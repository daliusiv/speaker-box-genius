/**
 * The app's charts drawn ahead of time for the guide pages (site/build.ts). Same components and
 * the same chart builders (chartProps.ts) as the app, so a guide's chart is the app's chart.
 * Built with `vite build -c vite.ssr.config.ts` and imported by the site build.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { ChartEmphasis, LogChart } from "../LogChart.tsx";
import { excursionChart, maxSplChart, responseChart, type ChartDraw } from "../chartProps.ts";
import { driverInputOf, runDesigns, solveDriver } from "../sim.ts";
import type { AppState } from "../state.ts";

export type GuideChartKind = "response" | "spl" | "excursion" | "maxspl";

export interface GuideChartOptions {
  /** A fixed cursor (Hz): its line, dots and values in the legend. */
  at?: number;
}

/** The screen widths each chart is drawn for: a phone and the guide's column. */
export const GUIDE_CHART_WIDTHS = { narrow: 360, wide: 700 } as const;

let next = 0;

/**
 * One chart, drawn twice (phone and desktop layouts; the page's CSS shows one). `state` is an
 * example from site/examples.ts.
 */
export function renderGuideChart(state: AppState, kind: GuideChartKind, o: GuideChartOptions = {}): string {
  const solved = solveDriver(state);
  const designs = runDesigns(state, solved);
  const input = { state, designs, sd_cm2: solved.missing.length > 0 ? undefined : driverInputOf(state, solved).sd_cm2 };
  const draw: ChartDraw =
    kind === "response" ? responseChart(input, "relative") : kind === "spl" ? responseChart(input, "absolute") : kind === "excursion" ? excursionChart(input) : maxSplChart(input, "spl");
  const faded = designs.filter((d) => d.compare).map((d) => d.label);
  const one = (layout: keyof typeof GUIDE_CHART_WIDTHS) =>
    // Each drawing gets its own id prefix: clip paths must not collide on a page of charts.
    renderToStaticMarkup(
      <ChartEmphasis.Provider value={faded}>
        <LogChart {...draw} still={{ width: GUIDE_CHART_WIDTHS[layout], at: o.at }} />
      </ChartEmphasis.Provider>,
      { identifierPrefix: `gc${next++}-` },
    );
  return `<div class="gc-wide">${one("wide")}</div><div class="gc-narrow">${one("narrow")}</div>`;
}
