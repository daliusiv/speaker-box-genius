/**
 * The open baffle calculator's sums (the page at /calculators/open-baffle/), with the app's own
 * open baffle model and Dipole EQ: the board's numbers are the ones the app's Open baffle card
 * shows (openBaffleFrequencies, the same call the simulator makes), and with a driver every
 * figure comes from a run of the full simulator. No DOM, so the site build and the tests use it.
 */
import { openBaffleFrequencies, STANDARD_AIR, type Air } from "@sbg/engine";
import { fixOpenBaffle, newDesign, type AppState, type DesignState, type EqItem, type ObDesign } from "../state.ts";
import { airLimitOf, limitsOf, portLimitOf, runDesigns, solveDriver, type Design } from "../sim.ts";
import { dipoleEq } from "../dipoleEq.ts";
import { suitsOpenBaffle, suitsOpenBaffleDsp } from "../boxType.ts";

/** The board as the form gives it: sizes in cm, the driver's centre from the left and bottom edges. */
export interface ObForm {
  frame: "flat" | "h" | "u";
  w_cm: number;
  h_cm: number;
  x_cm: number;
  y_cm: number;
  t_cm: number;
  depth_cm: number;
}

/** The frequency the bass loss against a wall is quoted at (Hz). */
export const LOSS_HZ = 40;

/** Why a board can't be worked out: what the form should say to fix. */
export type ObProblem = "size" | "driver" | "depth";

/** The board's sizes checked as the app's open baffle needs them (the rules of state.ts fixOpenBaffle). */
export function obProblem(b: ObForm): ObProblem | null {
  if (!(b.w_cm >= 5 && b.h_cm >= 5)) return "size";
  if (!(b.x_cm > 0 && b.x_cm < b.w_cm && b.y_cm > 0 && b.y_cm < b.h_cm)) return "driver";
  if (b.frame !== "flat" && !(b.depth_cm > b.t_cm + 1)) return "depth";
  return null;
}

/** The app's open baffle design for the board (sizes made usable as a link's would be). */
export function obDesign(b: ObForm, id = "d1", name = "Open baffle"): ObDesign {
  const base = newDesign("ob", []) as ObDesign;
  return { ...base, id, name, on: true, ...fixOpenBaffle({ ...b }, base) };
}

/** Path D, dipole peak, first null and (frames) quarter-wave: the Open baffle card's numbers. `sd_m2` 0 = a point source. */
export function boardNumbers(b: ObForm, sd_m2 = 0, air: Air = STANDARD_AIR) {
  const d = obDesign(b);
  return openBaffleFrequencies({ kind: "open-baffle", frame: d.frame, w_cm: d.w_cm, h_cm: d.h_cm, x_cm: d.x_cm, y_cm: d.y_cm, t_cm: d.t_cm, depth_cm: d.depth_cm }, air, sd_m2);
}

/** Board shapes for "Board for a peak at …": square with the driver centred, or twice as tall as wide with it a third of the way up. */
export type ObAspect = "square" | "tall";

/** A flat board of `aspect` at width `w_cm`, the driver centred across. */
export function boardOfWidth(w_cm: number, aspect: ObAspect, t_cm: number): ObForm {
  const h_cm = aspect === "tall" ? 2 * w_cm : w_cm;
  return { frame: "flat", w_cm, h_cm, x_cm: w_cm / 2, y_cm: aspect === "tall" ? h_cm / 3 : h_cm / 2, t_cm, depth_cm: 30 };
}

/**
 * The widths "Board for a peak" searches (cm), by shape: a peak outside what these give gets no
 * board. The top keeps the board's edge under about 6 m, which the model still builds in a few
 * seconds (its build time grows as the cube of the edge length).
 */
export const PEAK_WIDTHS = { square: { min: 15, max: 150 }, tall: { min: 10, max: 100 } } as const;
/** fPeak × width (Hz·cm) of a board with the driver where boardOfWidth puts it: the first guess. */
const PEAK_TIMES_WIDTH = { square: 23_800, tall: 17_800 } as const;

/**
 * The flat board whose dipole peak falls at `fPeak` (Hz), with the model the app uses. The peak
 * goes almost as 1 / width, so each step scales the width by peak found / peak wanted (one or
 * two steps, each a model build). The width is rounded to the nearest cm, so the peak it gives
 * is within about 1 % of the one asked for. Null when that peak needs a board outside PEAK_WIDTHS.
 */
export function boardForPeak(fPeak: number, aspect: ObAspect, t_cm: number, sd_m2 = 0, air: Air = STANDARD_AIR): ObForm | null {
  if (!(fPeak > 0)) return null;
  const peakAt = (w: number) => boardNumbers(boardOfWidth(w, aspect, t_cm), sd_m2, air).fPeak;
  const { min, max } = PEAK_WIDTHS[aspect];
  const first = PEAK_TIMES_WIDTH[aspect] / fPeak;
  if (first < min * 0.95 || first > max * 1.05) return null;
  let w = Math.min(max, Math.max(min, Math.round(first)));
  let got = peakAt(w);
  for (let i = 0; i < 4; i++) {
    const next = Math.min(max, Math.max(min, Math.round(w * (got / fPeak))));
    if (next === w) break;
    w = next;
    got = peakAt(w);
  }
  return Math.abs(got / fPeak - 1) <= 0.02 ? boardOfWidth(w, aspect, t_cm) : null;
}

/** What the driver suits, by the driver picker's Suits rules (boxType.ts). */
export type ObSuits = "passive" | "dsp" | "neither";
/** The driver's Qts (from Qes and Qms when it isn't given). */
export const qtsOf = (s: AppState): number | undefined => s.ts.qts ?? (s.ts.qes && s.ts.qms ? (s.ts.qes * s.ts.qms) / (s.ts.qes + s.ts.qms) : undefined);
export function obSuits(s: AppState): ObSuits {
  const qts = qtsOf(s);
  if (suitsOpenBaffle({ qts, fs: s.ts.fs })) return "passive";
  if (suitsOpenBaffleDsp({ qts, xmax_mm: s.xmax_mm, fs: s.ts.fs })) return "dsp";
  return "neither";
}

export interface ObResult {
  d_m: number;
  fPeak: number;
  fNull: number;
  fQuarter: number | null;
  /** F3 of the open baffle without EQ, and with the Dipole EQ (Hz). */
  f3: number | null;
  f3Eq: number | null;
  /** Level at LOSS_HZ against the same driver in a wall (dB, negative = less), without and with the EQ. */
  loss: number | null;
  lossEq: number | null;
  /** The Dipole EQ (aimed at the open baffle "d1") and its one-line note. */
  eq: EqItem[];
  eqNote: string;
  /** Peak cone excursion with the EQ at the power set (mm, one way), the driver's Xmax, and whether a limit is passed. */
  x_mm: number | null;
  xmax_mm: number;
  over: boolean;
  /** The bare board (no EQ) already passes a limit at this power: no EQ can help, the power has to come down. */
  overBare: boolean;
  power_w: number;
  suits: ObSuits;
  /** The open baffle with its Dipole EQ: what "Open in the simulator" opens. */
  open: AppState;
  /** The chart's state and runs: open baffle, with the Dipole EQ, and the same driver in a wall (dashed). */
  chart: AppState;
  designs: Design[];
}

/** The level at `hz` on a response, by interpolation on a log frequency axis; null outside it. */
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

/** The dash of the in-a-wall curve on the chart. */
export const WALL_DASH = "6 4";

/**
 * Runs the board with the driver of `s` (its T/S, Xmax, power): the open baffle, the same with
 * its Dipole EQ, and the same driver in a wall, all in one run (one frequency grid). Null when the
 * driver isn't complete or the board can't be simulated.
 */
export function readOb(s: AppState, b: ObForm): ObResult | null {
  const base: AppState = { ...s, eq: [], highPass: { ...s.highPass, on: false }, baffle: { ...s.baffle, on: false } };
  const ob = obDesign(b, "d1", "Open baffle");
  const one: AppState = { ...base, designs: [ob] };
  const solved = solveDriver(one);
  if (solved.missing.length > 0) return null;
  const fit = dipoleEq(one, solved, "d1");
  if (!fit) return null;
  const withEq = { ...ob, id: "d2", name: "With the Dipole EQ" } as DesignState;
  const wall = { ...newDesign("ib", []), id: "d3", name: "Same driver in a wall", on: true, rear: "open" } as DesignState;
  const chart: AppState = { ...base, designs: [ob, withEq, wall], eq: fit.eq.map((e) => ({ ...e, target: "d2" })) };
  const run = runDesigns(chart, solved).filter((d) => !d.compare);
  const get = (id: string) => run.find((d) => d.design.id === id);
  const r0 = get("d1"), r1 = get("d2"), rw = get("d3");
  if (!r0 || !r1 || !rw || !r0.result.summary.ob) return null;
  const designs = run.map((d) => (d.design.id === "d3" ? { ...d, dash: WALL_DASH } : d));
  const lim = limitsOf(r1.result, s.xmax_mm, false, portLimitOf(chart), airLimitOf(chart));
  const bare = limitsOf(r0.result, s.xmax_mm, false, portLimitOf(chart), airLimitOf(chart));
  const at = (d: Design) => levelAt(d.result.freq, d.result.spl, LOSS_HZ);
  const l0 = at(r0), l1 = at(r1), lw = at(rw);
  const sm = r0.result.summary.ob;
  return {
    d_m: sm.d_m,
    fPeak: sm.fPeak,
    fNull: sm.fNull,
    fQuarter: sm.fQuarter,
    f3: r0.result.summary.f3,
    f3Eq: r1.result.summary.f3,
    loss: l0 !== null && lw !== null ? l0 - lw : null,
    lossEq: l1 !== null && lw !== null ? l1 - lw : null,
    eq: fit.eq,
    eqNote: fit.note,
    x_mm: lim.x,
    xmax_mm: s.xmax_mm,
    over: lim.over.length > 0,
    overBare: bare.over.length > 0,
    power_w: s.power,
    suits: obSuits(s),
    open: { ...s, designs: [ob], eq: fit.eq, baffle: { ...s.baffle, on: false } },
    chart,
    designs,
  };
}
