/**
 * SPICE validation: engine vs SPICE, per output and frequency region, against the tolerances in
 * docs/validation.md. Works on plain arrays so it needs nothing from the engine.
 */
import { wrapDeg, type Outputs } from "./run.ts";

export const TOL = {
  /** SPL: dB, 95th percentile and worst; points more than 60 dB below the case's peak are skipped. */
  splP95: 0.01,
  splWorst: 0.02,
  splFloorDb: 60,
  /** Impedance: relative. */
  z: 0.001,
  /** Excursion, port speed, box pressure: relative, or this fraction of the case's maximum. */
  rel: 0.001,
  relFloor: 1e-6,
  /** Phase: degrees (wrapped), where SPL is within 40 dB of its peak. Impedance phase everywhere. */
  phase: 0.1,
  phaseMaskDb: 40,
  /** Group delay: ms or relative, whichever is larger; same 40 dB mask. */
  gdMs: 0.05,
  gdRel: 0.005,
} as const;

/** Solver agreement (ngspice vs mna.py): relative, with an absolute floor for values near zero. */
export const SOLVER_TOL = { rel: 1e-6, abs: 1e-12 } as const;

export type Region = "below" | "around" | "above";
export const regionOf = (f: number, fRef: number | null): Region =>
  fRef === null ? "around" : f < fRef / 2 ? "below" : f > fRef * 2 ? "above" : "around";

export interface Stat {
  output: string;
  worst: number;
  mean: number;
  p95: number;
  worstHz: number;
  worstRegion: Region;
  tol: number;
  pass: boolean;
  /** Worst, sum and count of the compared points in each region (for the published summary). */
  regions: Record<Region, { worst: number; sum: number; n: number }>;
}

type Arr = ArrayLike<number>;

function stat(output: string, freq: number[], diffs: (number | null)[], tol: number, fRef: number | null, useP95 = false, worstTol = tol): Stat {
  const vals: number[] = [];
  let worst = 0;
  let worstHz = freq[0]!;
  const regions: Stat["regions"] = { below: { worst: 0, sum: 0, n: 0 }, around: { worst: 0, sum: 0, n: 0 }, above: { worst: 0, sum: 0, n: 0 } };
  diffs.forEach((d, k) => {
    if (d === null) return;
    vals.push(d);
    const r = regions[regionOf(freq[k]!, fRef)];
    r.worst = Math.max(r.worst, d);
    r.sum += d;
    r.n++;
    if (d > worst) {
      worst = d;
      worstHz = freq[k]!;
    }
  });
  const sorted = vals.slice().sort((a, b) => a - b);
  const p95 = sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(0.95 * sorted.length))]! : 0;
  const mean = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
  const pass = useP95 ? p95 <= tol && worst <= worstTol : worst <= tol;
  return { output, worst, mean, p95, worstHz, worstRegion: regionOf(worstHz, fRef), tol, pass, regions };
}

const relDiffs = (a: Arr, b: Arr, floorFrac: number) => {
  let max = 0;
  for (let k = 0; k < b.length; k++) max = Math.max(max, Math.abs(b[k]!));
  const floor = max * floorFrac;
  return Array.from({ length: b.length }, (_, k) => Math.abs(a[k]! - b[k]!) / Math.max(Math.abs(b[k]!), floor, 1e-300));
};

/** The engine's result, reduced to what's compared (SimulationResult fits this shape). */
export interface EngineOutputs {
  spl: Arr;
  phaseDeg: Arr;
  groupDelayMs: Arr;
  impedanceOhm: Arr;
  impedancePhaseDeg: Arr;
  excursionMm: Arr;
  portVelocity: Arr | null;
  boxPressurePa: Arr | null;
  prGroups: { excursionMm: Arr }[] | null;
  rearPortVelocity: Arr | null;
  frontChamberPressurePa: Arr | null;
}

export function compare(spice: Outputs, eng: EngineOutputs, fRef: number | null): Stat[] {
  const f = spice.freq;
  const peak = Math.max(...spice.spl);
  const splMask = spice.spl.map((s) => s >= peak - TOL.splFloorDb);
  const phMask = spice.spl.map((s) => s >= peak - TOL.phaseMaskDb);
  const out: Stat[] = [];
  out.push(stat("SPL (dB)", f, spice.spl.map((s, k) => (splMask[k] ? Math.abs(s - eng.spl[k]!) : null)), TOL.splP95, fRef, true, TOL.splWorst));
  out.push(stat("SPL phase (°)", f, spice.phaseDeg.map((p, k) => (phMask[k] ? Math.abs(wrapDeg(p - eng.phaseDeg[k]!)) : null)), TOL.phase, fRef));
  out.push(
    stat(
      "Group delay (ms)",
      f,
      spice.groupDelayMs.map((g, k) => {
        if (!phMask[k]) return null;
        const e = eng.groupDelayMs[k]!;
        const d = Math.abs(g - e);
        // Pass when within either bound: report the difference relative to the looser one.
        return d / Math.max(TOL.gdMs, TOL.gdRel * Math.abs(e));
      }),
      1,
      fRef,
    ),
  );
  out.push(stat("Impedance", f, relDiffs(spice.impedanceOhm, eng.impedanceOhm, 0), TOL.z, fRef));
  out.push(stat("Impedance phase (°)", f, spice.impedancePhaseDeg.map((p, k) => Math.abs(wrapDeg(p - eng.impedancePhaseDeg[k]!))), TOL.phase, fRef));
  out.push(stat("Excursion", f, relDiffs(spice.excursionMm, eng.excursionMm, TOL.relFloor), TOL.rel, fRef));
  if (spice.portVelocity && eng.portVelocity) out.push(stat("Port air speed", f, relDiffs(spice.portVelocity, eng.portVelocity, TOL.relFloor), TOL.rel, fRef));
  spice.prGroupsMm.forEach((x, k) => {
    const e = eng.prGroups?.[k]?.excursionMm;
    if (!e) throw new Error(`engine has no PR group ${k}`);
    out.push(stat(`PR ${k + 1} excursion`, f, relDiffs(x, e, TOL.relFloor), TOL.rel, fRef));
  });
  if (spice.boxPressurePa && eng.boxPressurePa) out.push(stat("Box pressure", f, relDiffs(spice.boxPressurePa, eng.boxPressurePa, TOL.relFloor), TOL.rel, fRef));
  if (spice.rearPortVelocity && eng.rearPortVelocity) out.push(stat("Rear port air speed", f, relDiffs(spice.rearPortVelocity, eng.rearPortVelocity, TOL.relFloor), TOL.rel, fRef));
  if (spice.frontChamberPressurePa && eng.frontChamberPressurePa)
    out.push(stat("Front chamber pressure", f, relDiffs(spice.frontChamberPressurePa, eng.frontChamberPressurePa, TOL.relFloor), TOL.rel, fRef));
  return out;
}

export const formatStat = (s: Stat) =>
  `${s.pass ? "ok  " : "FAIL"} ${s.output}: worst ${s.worst.toExponential(2)} at ${s.worstHz.toFixed(1)} Hz (${s.worstRegion}), mean ${s.mean.toExponential(2)}, tol ${s.tol}`;
