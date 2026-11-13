import { LogChart } from "./LogChart.tsx";
import { AIR_COMPRESSION_CAUTION, checkFromHz, type Design } from "./sim.ts";

import { LIMIT } from "./palette.ts";

const AIR_TEAL = LIMIT.air;
/** The box air's distortion fades well before this; the chart stops here so the bass gets the width (boxes only). */
const AIR_F_MAX = 200;
/** Along a line or horn (σ = 2·HD2): from here a rough estimate, from twice it outside the model (a shock forms at σ = 1). */
const PATH_CAUTION_PCT = 25;
const dbc = (pct: number) => 20 * Math.log10(pct / 100);
/** What sets max SPL at a frequency (SimulationResult.limitedBy), in words. */
const LIMIT_WORDS: Record<string, string> = {
  thermal: "power (Pe)",
  xmax: "cone Xmax",
  "pr-xmax": "PR Xmax",
  port: "port speed",
  amp: "amplifier",
  air: "air distortion",
};

/**
 * Air distortion: the 2nd harmonic a box's air spring adds, or that builds up along a line or
 * horn as the wave steepens (airModel "path", at the mouth) (HD2, radiated, against the
 * fundamental at each frequency), at the drive set or at each design's max SPL; in % or dBc.
 * The legend gives each box's peak (above the same floor as the summary's peaks), so the answer
 * doesn't need a hover. The scale follows the curves; a limit far above them is named, not drawn.
 * Where the cone squeezes the air by more than AIR_COMPRESSION_CAUTION (ΔV/Vb) the estimate
 * loosens, and past twice that it's outside the model: said in the legend's "Air squeezed".
 */
export function AirChart(p: {
  designs: Design[];
  freq: Float64Array;
  hidden: boolean;
  limit_pct: number;
  highPassOn: boolean;
  view: { unit: "pct" | "dbc"; at: "now" | "max" };
  onView: (v: Partial<{ unit: "pct" | "dbc"; at: "now" | "max" }>) => void;
  /** Drawn once for a guide page (see LogChart's `still`). */
  still?: { width: number; at?: number };
}) {
  const { unit, at } = p.view;
  // Along a path it grows with frequency, so a line or horn gets the whole sweep.
  const anyPath = p.designs.some((d) => d.result.airModel === "path");
  const anySpring = p.designs.some((d) => d.result.airModel === "spring");
  const cut = anyPath ? -1 : p.freq.findIndex((f) => f > AIR_F_MAX * 1.001);
  const n = Math.max(1, cut < 0 ? p.freq.length : cut);
  const freq = p.freq.subarray(0, n);
  const floor = checkFromHz(p.highPassOn);
  const toUnit = (v: number) => (unit === "dbc" ? dbc(v) : v);
  let peakAll = 0;
  const series = p.designs
    .filter((d) => d.result.airHd2)
    .map((d) => {
      const now = d.result.airHd2!;
      const src = at === "max" ? d.result.airHd2AtMax! : now;
      const comp = d.result.airCompression!;
      const path = d.result.airModel === "path";
      const y = new Float64Array(n);
      const squeezed: string[] = [];
      const limitBy: string[] = [];
      for (let i = 0; i < n; i++) {
        const v = src[i]!;
        y[i] = Number.isFinite(v) && v > 0 ? toUnit(v) : NaN;
        // Compression scales with the drive as HD2 does.
        const c = comp[i]! * (at === "max" && now[i]! > 0 ? v / now[i]! : 1);
        squeezed.push(
          path
            ? v > 2 * PATH_CAUTION_PCT
              ? "path: outside the model"
              : v > PATH_CAUTION_PCT
                ? "path: rough estimate"
                : "along the path"
            : c > 2 * AIR_COMPRESSION_CAUTION
              ? `${(c * 100).toFixed(0)} %: outside the model`
              : c > AIR_COMPRESSION_CAUTION
                ? `${(c * 100).toFixed(0)} %: rough estimate`
                : Number.isFinite(c)
                  ? `${(c * 100).toFixed(1)} %`
                  : "",
        );
        limitBy.push(LIMIT_WORDS[d.result.limitedBy[i] ?? ""] ?? "");
      }
      for (let i = 0; i < n; i++) if (Number.isFinite(src[i]!)) peakAll = Math.max(peakAll, src[i]!);
      return { label: d.label, color: d.color, dash: d.dash, y, cols: [squeezed, limitBy], over: toUnit(p.limit_pct) };
    });
  // The limit is drawn when it's near the curves; far above them it would squash them flat.
  const limitShown = p.limit_pct <= Math.max(peakAll, 0.1) * 1.6;
  const top = Math.max(peakAll, limitShown ? p.limit_pct : 0, 0.1);
  const yMax = unit === "dbc" ? dbc(top) + 6 : top * 1.15;
  const yMin = unit === "dbc" ? Math.max(-100, dbc(Math.max(peakAll, 0.1)) - 60) : 0;
  const fmtPct = (v: number) => (unit === "dbc" ? `${dbc(v).toFixed(0)} dBc` : `${v < 10 ? v.toFixed(1) : v.toFixed(0)} %`);
  return (
    <LogChart
      forum
      chartId="air"
      still={p.still}
      columns={["Air squeezed", "Max SPL set by"]}
      peakFrom={floor}
      hidden={p.hidden}
      best="low"
      shortTitle="Air distortion"
      title={`${anyPath && !anySpring ? "Line air distortion" : anyPath ? "Air distortion" : "Box air distortion"} (2nd harmonic)${at === "max" ? " at max SPL" : ""}`}
      unit={unit === "dbc" ? "dBc" : "%"}
      digits={unit === "dbc" ? 1 : 2}
      freq={freq}
      series={series}
      limits={limitShown ? [{ value: toUnit(p.limit_pct), label: `Limit ${p.limit_pct} %`, color: AIR_TEAL }] : []}
      yMin={yMin}
      yMax={yMax}
      actions={
        <>
          <div className="unit-switch" role="group" aria-label="Drive">
            <button aria-pressed={at === "now"} onClick={() => p.onView({ at: "now" })} title="At the power set above">
              This power
            </button>
            <button aria-pressed={at === "max"} onClick={() => p.onView({ at: "max" })} title="At each design's maximum SPL (its first limit)">
              Max SPL
            </button>
          </div>
          <div className="unit-switch" role="group" aria-label="Unit">
            <button aria-pressed={unit === "pct"} onClick={() => p.onView({ unit: "pct" })} title="HD2 as a percentage of the fundamental">
              %
            </button>
            <button aria-pressed={unit === "dbc"} onClick={() => p.onView({ unit: "dbc" })} title="HD2 in dB below the fundamental (1 % = −40 dBc)">
              dBc
            </button>
          </div>
        </>
      }
      info={
        <p>
          {anyPath ? "The air only" : "The box\u2019s air only"}: the driver&rsquo;s own distortion isn&rsquo;t included. Over the limit ({fmtPct(p.limit_pct)}{limitShown ? "" : ", above this scale"}) a value shows red. Peaks are taken from {floor} Hz up. More in Settings &rarr; Air distortion.
        </p>
      }
    />
  );
}
