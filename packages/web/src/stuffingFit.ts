/**
 * Fit a box's stuffing to a measured impedance sweep of the finished box: the volume it
 * really acts as and its absorption loss (Qa), so the simulation matches the box.
 *
 * The simulated impedance (this driver, Settings' air and port loss, the box's leakage) is compared
 * with the measurement around the box's resonance peaks, on a log scale, and a grid search
 * then a pattern search find the gain and Qa with the smallest error. It's the guide's
 * Vb = Vas / ((fc/Fs)² − 1) and "lower Qa until the peak matches", done over the whole curve
 * at once; like them it's only as good as the driver's own T/S parameters.
 *
 * So it also says how far to trust the numbers: how flat the error is around the best fit, and
 * how far the result moves when each of the driver's Vas, Fs, Qes and Qms is off by its
 * tolerance (refitted one at a time, combined root-sum-square, as in measurement-uncertainty
 * practice). The tolerances depend on where the driver's values come from: a datasheet's
 * (production drivers vary) or the user's own (typed in or measured).
 */
import { resampleCurve, simulate, type DriverInput } from "@sbg/engine";
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
  /**
   * False when the fit ran into the ends of its search (a box ±40 % or more off, Qa at its
   * floor) or still matches badly: then stuffing doesn't explain the measurement, and the
   * values shouldn't be applied without a second look.
   */
  usable: boolean;
  /** Volume the box likely acts as, allowing for the fit's flatness and the driver tolerances (L). */
  acting_range_l: [number, number];
  /** Qa likely range, the same way. */
  qa_range: [number, number];
  /** What moves the volume most: one of the driver's values, or the fit itself (a flat error). */
  spread_by: keyof DriverTolerance | "fit";
  /** Which tolerances were allowed for, and how much. */
  source: FitSource;
  tolerance: DriverTolerance;
  /** The range is too wide to read the numbers as precise (only warns; `usable` is separate). */
  ambiguous: boolean;
}

/** Where the driver's T/S values came from: the database's datasheet, untouched, or the user's own. */
export type FitSource = "datasheet" | "yours";
/** Relative tolerances (≈ 95 % bounds) on the driver values the fit depends on. */
export interface DriverTolerance {
  vas: number;
  fs: number;
  qes: number;
  qms: number;
}

/**
 * Datasheet: production drivers vary (Fs typically ±15 %, Vas ±20–30 % unit to unit).
 * Yours: an impedance sweep gets Fs and the Qs closely; Vas (added mass or a test box) is the weak link.
 */
export const FIT_TOLERANCE: Record<FitSource, DriverTolerance> = {
  datasheet: { vas: 0.25, fs: 0.15, qes: 0.15, qms: 0.2 },
  yours: { vas: 0.1, fs: 0.02, qes: 0.05, qms: 0.1 },
};

/** The result reads as ambiguous past these: volume ± this share of itself, or Qa high/low ratio. */
export const AMBIGUOUS_VOLUME = 0.15;
export const AMBIGUOUS_QA_RATIO = 2.5;

/** "Fits about as well": the error (mean squared log) up to this much above the best, at least FLAT_FLOOR. */
const FLAT_RISE = 0.25;
const FLAT_FLOOR = 1e-4;

const GAIN = [-45, 40] as const;
const QA = [1.5, 300] as const;
const POINTS = 64;

/** Worse than this RMS mismatch (%), the result isn't offered as is. */
export const FIT_MAX_ERROR = 15;

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
export function fitStuffing(
  s: AppState,
  d: DesignState & { kind: StuffableKind },
  measured: { f: number[]; v: number[] },
  opts: { source?: FitSource; tolerance?: DriverTolerance } = {},
): StuffingFit | string {
  const source = opts.source ?? "yours";
  const tolerance = opts.tolerance ?? FIT_TOLERANCE[source];
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
  // Settings' losses with this box's own leakage, if it has one (the fit finds Qa).
  const base = d.ql !== undefined ? { ...s.settings.losses, ql: d.ql } : s.settings.losses;
  const simOpts = { ...simOptionsOf(s, true), fMin: lo, fMax: hi, points: POINTS, highPass: null, eq: [] };

  // A free-air sweep of the driver (its peak at about Fs) can't be fitted to a box, whose peak
  // sits well away from Fs: say so instead of fitting nonsense.
  const fs = driver.fs;
  try {
    const empty = simulate(driver, enclosureOf(d, built, base, s.volume.wall_mm), { ...simOptionsOf(s, true), fMin: 5, fMax: 600, points: 240, highPass: null, eq: [] });
    const fBox = mainPeak([...empty.freq], [...empty.impedanceOhm]);
    if (Math.abs(fpk / fs - 1) < 0.1 && fBox !== null && Math.abs(fBox / fs - 1) > 0.15) {
      return (
        `This looks like a free-air sweep of the driver: its peak is at ${fpk.toFixed(1)} Hz, right at the driver's Fs (${fs.toFixed(1)} Hz), while in this box the peak should be near ${fBox.toFixed(0)} Hz. ` +
        "Measure the driver mounted in the finished box for this fit. A free-air sweep belongs in Driver → Edit T/S → Fill from → Measure from an impedance sweep, which fits the driver's own T/S parameters from it."
      );
    }
  } catch {
    // The fit below reports a design that can't be simulated.
  }
  const target = { v: null as Float64Array | null };
  const costFor = (drv: DriverInput) => (gain: number, qa: number): number => {
    const losses = { ...base, qa };
    try {
      const r = simulate(drv, enclosureOf(d, built * (1 + gain / 100), losses, s.volume.wall_mm), simOpts);
      target.v ??= resampleCurve(measured, r.freq);
      let sum = 0;
      let n = 0;
      for (let i = 0; i < r.freq.length; i++) {
        const m = target.v[i]!;
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
  const lq = [Math.log(QA[0]), Math.log(QA[1])] as const;
  const cost = costFor(driver);
  const best = searchFit(cost, lq, { g: 0, q: Math.log(s.settings.losses.qa) }, false);
  if (!Number.isFinite(best.c)) return "The simulation couldn't run for this design; check its port or passive radiators.";

  const gain = Math.round(best.g * 10) / 10;
  const qaRaw = Math.exp(best.q);
  const qa = roundQa(qaRaw);
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

  const atLimit = best.g >= GAIN[1] - 0.5 || best.g <= GAIN[0] + 0.5 || qaRaw <= QA[0] * 1.05;
  const usable = !atLimit && error_pct <= FIT_MAX_ERROR;

  // How far to trust it: flatness around the best fit, then each driver value at ± its tolerance.
  const flat = flatness(cost, best);
  const sens = (Object.keys(tolerance) as (keyof DriverTolerance)[]).map((k) => {
    const t = tolerance[k];
    if (!(t > 0)) return { k, dg: 0, dq: 0 };
    const at = (sign: 1 | -1) => {
      const f = 1 + sign * t;
      // With frequency-dependent damping, Rms (not Qms) sets the losses: Qms ∝ 1/Rms.
      if (k === "qms" && driver.fdd) return searchFit(costFor({ ...driver, fdd: { ...driver.fdd, rms: driver.fdd.rms / f } }), lq, best, true);
      const key: "vas_l" | "fs" | "qes" | "qms" = k === "vas" ? "vas_l" : k;
      return searchFit(costFor({ ...driver, [key]: driver[key] * f }), lq, best, true);
    };
    const up = at(1);
    const down = at(-1);
    if (!Number.isFinite(up.c) || !Number.isFinite(down.c)) return { k, dg: 0, dq: 0 };
    return { k, dg: Math.abs(up.g - down.g) / 2, dq: Math.abs(up.q - down.q) / 2 };
  });
  const hg = Math.sqrt(sens.reduce((t, x) => t + x.dg ** 2, flat.g ** 2));
  const hq = Math.sqrt(sens.reduce((t, x) => t + x.dq ** 2, flat.q ** 2));
  const top = sens.reduce((m, x) => (x.dg > m.dg ? x : m), { k: "fit" as keyof DriverTolerance | "fit", dg: flat.g });
  const acting = built * (1 + gain / 100);
  // Within what the search allows: past that the fit has nothing to say.
  const acting_range_l: [number, number] = [round1(built * (1 + Math.max(GAIN[0], best.g - hg) / 100)), round1(built * (1 + Math.min(GAIN[1], best.g + hg) / 100))];
  const qa_range: [number, number] = [roundQa(Math.max(QA[0], Math.exp(best.q - hq))), roundQa(Math.min(QA[1], Math.exp(best.q + hq)))];
  const ambiguous = (built * hg) / 100 > AMBIGUOUS_VOLUME * acting || Math.exp(2 * hq) > AMBIGUOUS_QA_RATIO;

  return {
    gain_pct: gain,
    qa,
    built_l: built,
    acting_l: acting,
    band: [lo, hi],
    error_pct,
    warnings,
    usable,
    acting_range_l,
    qa_range,
    spread_by: top.k,
    source,
    tolerance,
    ambiguous,
  };
}

const round1 = (x: number) => Math.round(x * 10) / 10;
const roundQa = (q: number) => (q >= 100 ? Math.round(q / 5) * 5 : q >= 10 ? Math.round(q) : Math.round(q * 10) / 10);

type Cost = (gain: number, qa: number) => number;
interface Point {
  /** Gain (%), ln Qa, and the error there. */
  g: number;
  q: number;
  c: number;
}

/**
 * Best gain and ln Qa: a coarse grid (gain every 5 %, Qa on a log scale) then a pattern search,
 * halving its steps until they're tiny. `warm` starts the pattern search at `start` with small
 * steps and skips the grid: a refit after a small change to the driver.
 */
function searchFit(cost: Cost, lq: readonly [number, number], start: { g: number; q: number }, warm: boolean): Point {
  const ev = (g: number, q: number): Point => ({ g, q, c: cost(g, Math.exp(q)) });
  let best = warm ? ev(start.g, start.q) : { g: start.g, q: start.q, c: Infinity };
  if (!warm) {
    for (let g = GAIN[0]; g <= GAIN[1]; g += 5) {
      for (let k = 0; k <= 14; k++) {
        const p = ev(g, lq[0] + ((lq[1] - lq[0]) * k) / 14);
        if (p.c < best.c) best = p;
      }
    }
    if (!Number.isFinite(best.c)) return best;
  }
  let sg = warm ? 1 : 2.5;
  let sq = (lq[1] - lq[0]) / (warm ? 70 : 28);
  while (sg > 0.05) {
    let moved = false;
    for (const [dg, dq] of [[sg, 0], [-sg, 0], [0, sq], [0, -sq], [sg, sq], [-sg, -sq], [sg, -sq], [-sg, sq]] as const) {
      const p = ev(Math.min(GAIN[1], Math.max(GAIN[0], best.g + dg)), Math.min(lq[1], Math.max(lq[0], best.q + dq)));
      if (p.c < best.c) {
        best = p;
        moved = true;
      }
    }
    if (!moved) {
      sg /= 2;
      sq /= 2;
    }
  }
  return best;
}

/**
 * Half-widths in gain (%) and ln Qa over which the fit stays about as good (error up to
 * FLAT_RISE above the best), each with the other re-optimised: from the error's curvature at the
 * best fit. Not a statistical confidence interval (the residuals are model error, not noise).
 */
function flatness(cost: Cost, b: Point): { g: number; q: number } {
  const hg = 1;
  const hq = 0.05;
  const c = (g: number, q: number) => cost(g, Math.exp(q));
  const c0 = b.c;
  const gg = (c(b.g + hg, b.q) - 2 * c0 + c(b.g - hg, b.q)) / hg ** 2;
  const qq = (c(b.g, b.q + hq) - 2 * c0 + c(b.g, b.q - hq)) / hq ** 2;
  const gq = (c(b.g + hg, b.q + hq) - c(b.g + hg, b.q - hq) - c(b.g - hg, b.q + hq) + c(b.g - hg, b.q - hq)) / (4 * hg * hq);
  const rise = Math.max(FLAT_RISE * c0, FLAT_FLOOR);
  // A flat or saddle-shaped error says nothing: then the whole search range.
  const effG = gg - (qq > 0 ? gq ** 2 / qq : Infinity);
  const effQ = qq - (gg > 0 ? gq ** 2 / gg : Infinity);
  return {
    g: effG > 0 && Number.isFinite(effG) ? Math.min(GAIN[1] - GAIN[0], Math.sqrt(rise / effG)) : GAIN[1] - GAIN[0],
    q: effQ > 0 && Number.isFinite(effQ) ? Math.min(Math.log(QA[1] / QA[0]), Math.sqrt(rise / effQ)) : Math.log(QA[1] / QA[0]),
  };
}
