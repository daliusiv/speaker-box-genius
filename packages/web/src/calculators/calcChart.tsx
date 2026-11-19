/**
 * A calculator's live response chart: the app's own chart (LogChart + responseChart, as the app
 * and the guide pages draw it), still (no cursor), at the width of its box. The page's styles for
 * it come from the worked example's chart, drawn the same way at build (site/calculators.ts).
 */
import { createRoot, type Root } from "react-dom/client";
import { ChartEmphasis, LogChart } from "../LogChart.tsx";
import { responseChart } from "../chartProps.ts";
import { driverInputOf, runDesigns, solveDriver, type Design } from "../sim.ts";
import type { AppState } from "../state.ts";

/** The guide pages' two drawing widths (packages/web/src/ssr/guideCharts.tsx): a phone and the page column. */
const WIDTHS = { narrow: 360, wide: 700 } as const;

const roots = new WeakMap<HTMLElement, Root>();
const last = new WeakMap<HTMLElement, () => void>();
let watching = false;

/** The width to draw at: the page column's on wide screens, the phone layout below 600 px. */
const widthFor = (el: HTMLElement) => (el.clientWidth >= 600 ? WIDTHS.wide : WIDTHS.narrow);

/**
 * Draws the relative response of `state`'s designs into `el` (designs already run can be passed
 * in, so a page that simulated them for its numbers doesn't run them twice). Redraws on resize.
 */
export function drawResponse(el: HTMLElement, state: AppState, designs?: Design[]) {
  const draw = () => {
    const solved = solveDriver(state);
    const run = designs ?? runDesigns(state, solved);
    if (run.length === 0) {
      roots.get(el)?.render(null);
      return;
    }
    const input = { state, designs: run, sd_cm2: solved.missing.length > 0 ? undefined : driverInputOf(state, solved).sd_cm2 };
    let root = roots.get(el);
    if (!root) {
      el.innerHTML = "";
      root = createRoot(el);
      roots.set(el, root);
    }
    root.render(
      <ChartEmphasis.Provider value={[]}>
        <LogChart {...responseChart(input, "relative")} still={{ width: widthFor(el) }} />
      </ChartEmphasis.Provider>,
    );
  };
  last.set(el, draw);
  draw();
  if (!watching && typeof window !== "undefined") {
    watching = true;
    let wide = window.innerWidth >= 640;
    window.addEventListener("resize", () => {
      const now = window.innerWidth >= 640;
      if (now === wide) return;
      wide = now;
      document.querySelectorAll<HTMLElement>("[data-calc-chart]").forEach((c) => last.get(c)?.());
    });
  }
}
