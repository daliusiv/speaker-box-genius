/**
 * Fit a box's stuffing to a measured impedance sweep of the finished box: the volume it
 * really acts as and its absorption loss (Qa), so the simulation matches the box.
 *
 * The simulated impedance (this driver, Settings' air, leakage and port losses) is compared
 * with the measurement around the box's resonance peaks, on a log scale, and a grid search
 * then a pattern search find the gain and Qa with the smallest error. It's the guide's
 * Vb = Vas / ((fc/Fs)² − 1) and "lower Qa until the peak matches", done over the whole curve
 * at once; like them it's only as good as the driver's own T/S parameters.
 */
import { resampleCurve, simulate } from "@sbg/engine";
import { builtVbOf, driverInputOf, enclosureOf, simOptionsOf, solveDriver } from "./sim.ts";
import type { AppState, DesignState } from "./state.ts";
import type { StuffableKind } from "./stuffing.ts";

export interface StuffingFit {
  /** How much bigger the box acts than its net volume (%). */
  gain_pct: number;
  /** Absorption loss as a Q at the tuning. */
  qa: number;
  /** Net volume as built and the volume it acts as (L). */
  built_l: number;
  acting_l: number;
  /** Frequencies compared (Hz). */
  band: [number, number];
  /** RMS difference between the fitted simulation and the measurement (%). */
  error_pct: number;
  /** Things to check before trusting the result. */
  warnings: string[];
}

const GAIN = [-45, 40] as const;
const QA = [1.5, 300] as const;
const POINTS = 64;

/** The tallest impedance peak between 8 and 400 Hz (Hz), or null if the curve has none. */
function mainPeak(f: number[], v: number[]): number | null {
  let best = -1;
  for (let i = 1; i < f.length - 1; i++) {
    if (f[i]! < 8 || f[i]! > 400) continue;
    if (v[i]! > v[i - 1]! && v[i]! >= v[i + 1]! && (best < 0 || v[i]! > v[best]!)) best = i;
  }
  return best < 0 ? null : f[best]!;
}

/** Fit the stuffing of `d` (sealed, ported or PR) to a measured impedance curve, or say why it can't. */
export function fitStuffing(s: AppState, d: DesignState & { kind: StuffableKind }, measured: { f: number[]; v: number[] }): StuffingFit | string {
  const solved = solveDriver(s);
  if (solved.missing.length > 0) return "Enter the driver's parameters first: the fit compares the measurement with a simulation of this driver.";
  const built = builtVbOf(s, d);
  if (!(built > 0)) return "Enter the box volume first.";
  const fpk = mainPeak(measured.f, measured.v);
  if (fpk === null) return "No impedance peak between 8 and 400 Hz in this measurement. Is it an impedance sweep (.zma) of the box?";

  // Around the resonances: a ported or PR box's two peaks sit within about 3× of the taller one.
  const lo = Math.max(measured.f[0]!, 8, fpk / (d.kind === "sealed" ? 2.5 : 3.5));
  const hi = Math.min(measured.f[measured.f.length - 1]!, 600, fpk * (d.kind === "sealed" ? 2.5 : 3));
  if (!(hi > lo * 2)) return "The measurement doesn't cover enough of the range around the box's resonance.";

  const driver = driverInputOf(s, solved);
  const opts = { ...simOptionsOf(s), fMin: lo, fMax: hi, points: POINTS, highPass: null, eq: [] };
  let target: Float64Array | null = null;

  const cost = (gain: number, qa: number): number => {
    const losses = { ...s.settings.losses, qa };
    try {
      const r = simulate(driver, enclosureOf(d, built * (1 + gain / 100), losses, s.volume.wall_mm), opts);
      target ??= resampleCurve(measured, r.freq);
      let sum = 0;
      let n = 0;
      for (let i = 0; i < r.freq.length; i++) {
        const m = target[i]!;
        const z = r.impedanceOhm[i]!;
        if (!(m > 0) || !(z > 0)) continue;
        const e = Math.log(z / m);
        sum += e * e;
        n++;
      }
      return n > 10 ? sum / n : Infinity;
    } catch {
      return Infinity;
    }
  };

  // Coarse grid: gain every 5 %, Qa on a log scale.
  const lq = [Math.log(QA[0]), Math.log(QA[1])];
  let best = { g: 0, q: Math.log(s.settings.losses.qa), c: Infinity };
  for (let g = GAIN[0]; g <= GAIN[1]; g += 5) {
    for (let k = 0; k <= 14; k++) {
      const q = lq[0]! + ((lq[1]! - lq[0]!) * k) / 14;
      const c = cost(g, Math.exp(q));
      if (c < best.c) best = { g, q, c };
    }
  }
  if (!Number.isFinite(best.c)) return "The simulation couldn't run for this design; check its port or passive radiators.";

  // Pattern search from there, halving the steps until they're tiny.
  let sg = 2.5;
  let sq = (lq[1]! - lq[0]!) / 28;
  while (sg > 0.05) {
    let moved = false;
    for (const [dg, dq] of [[sg, 0], [-sg, 0], [0, sq], [0, -sq], [sg, sq], [-sg, -sq], [sg, -sq], [-sg, sq]] as const) {
      const g = Math.min(GAIN[1], Math.max(GAIN[0], best.g + dg));
      const q = Math.min(lq[1]!, Math.max(lq[0]!, best.q + dq));
      const c = cost(g, Math.exp(q));
      if (c < best.c) {
        best = { g, q, c };
        moved = true;
      }
    }
    if (!moved) {
      sg /= 2;
      sq /= 2;
    }
  }

  const gain = Math.round(best.g * 10) / 10;
  const qaRaw = Math.exp(best.q);
  const qa = qaRaw >= 100 ? Math.round(qaRaw / 5) * 5 : qaRaw >= 10 ? Math.round(qaRaw) : Math.round(qaRaw * 10) / 10;
  const error_pct = Math.round(Math.sqrt(best.c) * 1000) / 10;

  const warnings: string[] = [];
  if (error_pct > 12)
    warnings.push(
      `The best fit is still ${error_pct}% off the measurement, so something else differs from the simulation: check the driver's T/S parameters (measure them in free air), Re, the number of drivers and their wiring, ${d.kind === "vented" ? "the port size and length" : d.kind === "pr" ? "the passive radiators and added mass" : "air leaks"}.`,
    );
  if (best.g >= GAIN[1] - 0.5)
    warnings.push("The fit wants a box at least 40% bigger, past what stuffing can physically do: the driver's Vas or Fs is probably off, or the box leaks.");
  else if (best.g <= GAIN[0] + 0.5) warnings.push("The fit wants a box much smaller than its net volume: check the volume and the driver's Vas.");
  if (qaRaw >= QA[1] * 0.95) warnings.push("Hardly any absorption loss: Qa is at the top of its range.");
  if (qaRaw <= QA[0] * 1.05) warnings.push("Qa is at the bottom of its range: the peaks are more damped than stuffing alone explains (leaks, or Settings' Ql too high?).");

  return { gain_pct: gain, qa, built_l: built, acting_l: built * (1 + gain / 100), band: [lo, hi], error_pct, warnings };
}
