/**
 * The sealed box calculator's sums (the page at /calculators/sealed-box/), with the app's own
 * alignment and simulation code: the box for a target Qtc is the one the sealed preset sizes
 * (WinISD's closed-box wizard, with the drivers counted as the app counts them), and every
 * figure for a box comes from a run of the full simulator. No DOM, so the site build and the
 * tests use it too.
 */
import { sealedVolumeForAlignment } from "@sbg/engine";
import { newDesign, type AppState, type SealedDesign } from "../state.ts";
import { alignmentDriver, limitsOf, PORT_LIMIT, runDesigns, solveDriver } from "../sim.ts";
import { SEALED_MAX_VAS } from "../presets.ts";

/** The frequency the output is quoted at (Hz). */
export const OUTPUT_HZ = 30;

/** Why no box comes out of a target Qtc. */
export type SealedProblem =
  /** The driver's Fs, Qts or Vas isn't known yet. */
  | "incomplete"
  /** The driver's own Q is at or above the target: a box only raises Q, so none reaches it. */
  | "qts";

export interface SealedSizing {
  vb_l: number;
  /** Twice Vas (times the drivers): where the app's sealed preset stops. */
  maxVb_l: number;
  /** The box is bigger than that. */
  pastMax: boolean;
}

/** The driver's Qts as the alignment helpers see it (with the wired coils and isobaric pair). */
export function qtsOfState(s: AppState): number | null {
  const a = alignmentDriver(solveDriver(s), s);
  return a ? (a.qms * a.qes) / (a.qms + a.qes) : null;
}

/** The net box volume for a target Qtc, or why there isn't one. Counts `s.drivers` as the app does. */
export function boxForQtc(s: AppState, qtc: number): SealedSizing | SealedProblem {
  const a = alignmentDriver(solveDriver(s), s);
  if (!a) return "incomplete";
  const vb = sealedVolumeForAlignment(a, qtc, s.drivers);
  if (vb === null || !(vb > 0) || !Number.isFinite(vb)) return "qts";
  const maxVb_l = SEALED_MAX_VAS * a.vas_l * s.drivers;
  return { vb_l: vb, maxVb_l, pastMax: vb > maxVb_l };
}

/** A box volume as the design holds it: to 0.01 L, which the links and the table both use. */
export const roundVb = (vb_l: number) => Math.round(vb_l * 100) / 100;

/** The app's state for a sealed box of `vb_l` with the driver, drivers and power of `s`. */
export function sealedState(s: AppState, vb_l: number, name = `Sealed ${roundVb(vb_l)} L`): AppState {
  const d = newDesign("sealed", []) as SealedDesign;
  return { ...s, designs: [{ ...d, id: "d1", name, vb_l: roundVb(vb_l) }] };
}

export interface SealedResult {
  vb_l: number;
  /** Total Q and resonance of the box, as the simulation reads them (box losses counted). */
  qtc: number | null;
  fc: number | null;
  f3: number | null;
  f10: number | null;
  /** The response's rise above its passband (dB, 0 or more); 0 when there is none. */
  peakDb: number;
  /** Peak cone excursion above F3, one way, per driver (mm). */
  x_mm: number | null;
  xmax_mm: number;
  /** dB SPL at 1 m at OUTPUT_HZ, at the power set. */
  spl30: number | null;
  power_w: number;
}

/** The level at `hz` on a response (dB), by interpolation on a log frequency axis; null outside its range. */
export function levelAt(freq: ArrayLike<number>, spl: ArrayLike<number>, hz: number): number | null {
  for (let i = 1; i < freq.length; i++) {
    const f0 = freq[i - 1]!;
    const f1 = freq[i]!;
    if (hz < f0 || hz > f1) continue;
    const t = f1 === f0 ? 0 : Math.log(hz / f0) / Math.log(f1 / f0);
    return spl[i - 1]! + t * (spl[i]! - spl[i - 1]!);
  }
  return null;
}

/**
 * The box's own peak above its passband (dB, 0 when it has none): the highest point below five
 * times its resonance over the passband level, with the voice coil's inductance left out so the
 * slow rise of the upper bass doesn't pass for the box's hump.
 */
export function boxPeakDb(state: AppState): number {
  const bare = { ...state, le_mh: 0, l2_mh: 0, r2_ohm: 0 };
  const [d] = runDesigns(bare, solveDriver(bare));
  if (!d) return 0;
  const r = d.result;
  const limit = 5 * (r.summary.fc ?? 100);
  let top = -Infinity;
  for (let i = 0; i < r.freq.length; i++) if (r.freq[i]! <= limit) top = Math.max(top, r.spl[i]!);
  return Number.isFinite(top) ? Math.max(0, top - r.summary.referenceSpl) : 0;
}

/** Runs the sealed box of `state` (its first design) and reads off what the page shows. Null if it can't be simulated. */
export function readSealed(state: AppState): SealedResult | null {
  const solved = solveDriver(state);
  if (solved.missing.length > 0) return null;
  const [d] = runDesigns(state, solved);
  if (!d) return null;
  const r = d.result;
  const fc = r.summary.fc ?? null;
  const lim = limitsOf(r, state.xmax_mm, false, PORT_LIMIT);
  return {
    vb_l: state.designs[0]!.vb_l,
    qtc: r.summary.qtc ?? null,
    fc,
    f3: r.summary.f3,
    f10: r.summary.f10,
    peakDb: boxPeakDb(state),
    x_mm: lim.x,
    xmax_mm: state.xmax_mm,
    spl30: levelAt(r.freq, r.spl, OUTPUT_HZ),
    power_w: state.power,
  };
}

/** Above this Qtc the response has a peak worth a row of its own (the reading of a 0.707 box is 0.705). */
export const PEAK_QTC = 0.71;
