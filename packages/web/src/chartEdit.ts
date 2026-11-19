/**
 * Editing on the response chart: what dragging a handle does to the app state. Pure
 * functions, so they're easy to test; App turns them into chart handles.
 */
import { abs, eqStageResponse, highPassResponse, portLengthForFb, type EqStage, type SimulationResult } from "@sbg/engine";
import { prTuning } from "./presets.ts";
import { airOf, checkFromHz, DEEP_ALLOW, DEEP_FLOOR_HZ, deepSplitOf, endCorrectionOf, portOf, vbOf } from "./sim.ts";
import { newId, type AppState, type DesignState, type EqItem } from "./state.ts";

const r1 = (v: number) => Math.round(v * 10) / 10;
/** Frequencies as people type them: 0.1 Hz below 100 Hz, whole hertz above. */
const roundF = (f: number) => (f < 100 ? r1(f) : Math.round(f));

/** Boxes with a tuning that dragging can set: ported (port length) and passive radiator (added mass). */
export const tunable = (d: DesignState) => d.on && (d.kind === "vented" || d.kind === "pr");

/** The design tuned to `fb`, or null when it can't get there (port too short, mass below zero). */
export function retuned(s: AppState, d: DesignState, fb: number): DesignState | null {
  const vb = vbOf(s, d);
  const air = airOf(s);
  const target = roundF(Math.min(200, Math.max(5, fb)));
  if (d.kind === "vented") {
    const len = portLengthForFb(vb, portOf(d, 0), target, d.count, endCorrectionOf(s), air);
    if (!(len >= 0.5) || !Number.isFinite(len)) return null;
    return { ...d, length_cm: r1(len), targetFb: target };
  }
  if (d.kind === "pr") {
    const m = prTuning(d, vb, air).massFor(target, vb);
    if (!(m >= 0) || !Number.isFinite(m)) return null;
    return { ...d, addedMass_g: r1(m), targetFb: target };
  }
  return null;
}

/** Sets a design's tuning; unchanged state when it can't reach it (the handle stops there). */
export function retune(s: AppState, id: string, fb: number): AppState {
  const d = s.designs.find((x) => x.id === id);
  const next = d && retuned(s, d, fb);
  return next ? { ...s, designs: s.designs.map((x) => (x.id === id ? next : x)) } : s;
}

/** EQ points that can be dragged: peaking and shelves (frequency and gain). */
export const draggableEq = (e: EqItem): e is Extract<EqItem, { type: "peak" | "lowshelf" | "highshelf" }> => e.on && e.type !== "linkwitz";

/** Moves an EQ point to frequency f and gain g (dB), within 10–500 Hz and ±24 dB. */
export function moveEq(s: AppState, id: string, f: number, g: number): AppState {
  return {
    ...s,
    eq: s.eq.map((e) =>
      e.id === id && draggableEq(e) ? { ...e, freq: roundF(Math.min(500, Math.max(10, f))), gain_db: r1(Math.min(24, Math.max(-24, g))) } : e,
    ),
  };
}

/** Widens (down) or narrows (up) an EQ point: Q in steps of 10 %, 0.3–10. */
export function eqQ(s: AppState, id: string, up: boolean): AppState {
  return {
    ...s,
    eq: s.eq.map((e) => (e.id === id && draggableEq(e) ? { ...e, q: Math.round(Math.min(10, Math.max(0.3, e.q * (up ? 1.1 : 1 / 1.1))) * 100) / 100 } : e)),
  };
}

/** Filters the chart's "add" menu can put in. */
export type AddType = "peak" | "lowshelf" | "highshelf" | "highpass" | "linkwitz";
/** A sealed box's alignment, for a Linkwitz Transform that corrects it. */
export interface SealedRef {
  id: string;
  fc: number;
  qtc: number;
}

/** Adds a filter at frequency f. picked = handle/chip id to select ("eq-<id>" or "hp"), null when nothing was added. */
export function addFilterAt(s: AppState, type: AddType, f: number, sealed?: SealedRef | null): { state: AppState; picked: string | null } {
  if (type === "highpass") {
    return { state: { ...s, highPass: { ...s.highPass, on: true, freq: roundF(Math.min(200, Math.max(5, f))) } }, picked: "hp" };
  }
  const id = newId(s.eq);
  const base = { id, on: true, target: "all" };
  let item: EqItem;
  if (type === "peak") item = { ...base, type, freq: roundF(Math.min(500, Math.max(10, f))), gain_db: 0, q: 1.4 };
  else if (type === "lowshelf" || type === "highshelf") item = { ...base, type, freq: roundF(Math.min(500, Math.max(10, f))), gain_db: 0, q: 0.707 };
  else {
    if (!sealed) return { state: s, picked: null };
    const f0 = r1(sealed.fc);
    item = { id, on: true, target: sealed.id, type: "linkwitz", f0, q0: Math.round(sealed.qtc * 1000) / 1000, fp: Math.min(roundF(f), f0), qp: 0.707 };
  }
  return { state: { ...s, eq: [...s.eq, item] }, picked: `eq-${id}` };
}

/** Moves the high-pass corner to f, within 5–200 Hz. */
export function moveHighPass(s: AppState, f: number): AppState {
  return { ...s, highPass: { ...s.highPass, freq: roundF(Math.min(200, Math.max(5, f))) } };
}

/** The EQ chain alone (dB) at each frequency, for one design (EQ items targeting "all" or that design id) plus the high-pass when on. */
export function eqOnlyDb(eq: EqItem[], hp: AppState["highPass"], freq: ArrayLike<number>, designId: string): Float64Array {
  const stages = eq.filter((e) => e.on && (e.target === "all" || e.target === designId)).map(stageOf);
  const out = new Float64Array(freq.length);
  for (let i = 0; i < freq.length; i++) {
    let m = 1;
    for (const st of stages) m *= abs(eqStageResponse(st, freq[i]!));
    if (hp.on) m *= abs(highPassResponse(hp, freq[i]!));
    out[i] = 20 * Math.log10(m);
  }
  return out;
}

const stageOf = ({ id: _id, on: _on, target: _t, ...stage }: EqItem) => stage as EqStage;

/** How close to a limit a point is: past it, close to it, or fine. */
export type LaneKind = "ok" | "near" | "over";

/** Which limit is the closest at a point. */
export type WorstKind = "xmax" | "pr" | "port" | "air";

/** The worst point against any limit: its ratio (1 = at the limit), frequency and which limit. Null when no limit applies anywhere. */
export function worstLimit(r: SimulationResult, xmax_mm: number, highPassOn: boolean, portLimit: number, airLimit = Infinity): { kind: WorstKind; ratio: number; f: number } | null {
  const kinds: WorstKind[] = [];
  const ratios = limitRatios(r, xmax_mm, highPassOn, portLimit, airLimit, kinds);
  let at = -1;
  for (let i = 0; i < ratios.length; i++) if (ratios[i]! > 0 && (at < 0 || ratios[i]! > ratios[at]!)) at = i;
  return at < 0 ? null : { kind: kinds[at]!, ratio: ratios[at]!, f: r.freq[at]! };
}

/**
 * Each point's worst ratio to its limits (1 = at it): cone and passive radiators against Xmax,
 * port speeds against `portLimit`, air distortion (%) against `airLimit`. Same windows as limitsOf: checked from checkFromHz, and in a
 * tuned box's deep-bass zone the cone may go DEEP_ALLOW times past Xmax. Outside them, 0.
 */
function limitRatios(r: SimulationResult, xmax_mm: number, highPassOn: boolean, portLimit: number, airLimit: number, kinds?: WorstKind[]): Float64Array {
  const fMin = checkFromHz(highPassOn, r.summary.f3);
  const split = deepSplitOf(r, highPassOn);
  const lo = split ?? fMin;
  const out = new Float64Array(r.freq.length);
  for (let i = 0; i < out.length; i++) {
    const f = r.freq[i]!;
    const deep = split !== null && f >= DEEP_FLOOR_HZ && f < split;
    const coneOn = f >= lo || deep;
    const allow = deep ? DEEP_ALLOW : 1;
    let w = 0;
    let kind: WorstKind = "xmax";
    const take = (v: number, k: WorstKind) => {
      if (v > w) {
        w = v;
        kind = k;
      }
    };
    if (coneOn && r.excursionMm && xmax_mm > 0) take((r.excursionMm[i] ?? 0) / (allow * xmax_mm), "xmax");
    if (coneOn && r.prGroups) for (const g of r.prGroups) if (g.xmax_mm) take((g.excursionMm[i] ?? 0) / (allow * g.xmax_mm), "pr");
    if (f >= fMin) {
      if (r.portVelocity) take((r.portVelocity[i] ?? 0) / portLimit, "port");
      if (r.rearPortVelocity) take((r.rearPortVelocity[i] ?? 0) / portLimit, "port");
      // Air distortion grows with the drive's amplitude, like excursion, so it scales with |H| too.
      if (r.airHd2 && Number.isFinite(airLimit)) take((r.airHd2[i] ?? 0) / airLimit, "air");
    }
    out[i] = w;
    if (kinds) kinds[i] = kind;
  }
  return out;
}

/** Per frequency: "over" past a limit, "near" within `near` (default 80 %) of it, else "ok". */
export function excursionLane(r: SimulationResult, xmax_mm: number, highPassOn: boolean, portLimit: number, near = 0.8, airLimit = Infinity): LaneKind[] {
  return Array.from(limitRatios(r, xmax_mm, highPassOn, portLimit, airLimit), (v) => (v > 1 ? "over" : v >= near ? "near" : "ok"));
}

const RANK: Record<LaneKind, number> = { ok: 0, near: 1, over: 2 };
/** The worst of several lanes at each point. */
export function combineLanes(lanes: LaneKind[][]): LaneKind[] {
  const n = Math.max(0, ...lanes.map((l) => l.length));
  return Array.from({ length: n }, (_, i) => lanes.reduce<LaneKind>((w, l) => (l[i] && RANK[l[i]!] > RANK[w] ? l[i]! : w), "ok"));
}

/** A fix for one EQ item: the gain to cut to, or the Linkwitz Transform's new corner. */
export type Fit = { gain_db: number } | { fp: number };

/**
 * The gentlest change to one EQ item that brings the design back within its limits. Excursion
 * and port speed scale with the filter's response, so no new simulation: each point's ratio is
 * scaled by |H_new| / |H_now| of that item alone. Peak and shelves: the largest gain (down to
 * -24 dB) that fits, rounded down to 0.1 dB. Linkwitz: the lowest fp (up to f0) that fits,
 * rounded up to 0.1 Hz. Null when already within limits, the item is off, nothing fits, or the
 * design is past a limit even without this item (then the drive, not this filter, is the cause).
 */
export function fitToLimits(r: SimulationResult, item: EqItem, xmax_mm: number, highPassOn: boolean, portLimit: number, airLimit = Infinity): Fit | null {
  if (!item.on) return null;
  const base = limitRatios(r, xmax_mm, highPassOn, portLimit, airLimit);
  const cur = Float64Array.from(r.freq, (f) => abs(eqStageResponse(stageOf(item), f)));
  const worst = (st: EqStage) => {
    let w = 0;
    for (let i = 0; i < base.length; i++) {
      if (base[i]! <= 0) continue;
      w = Math.max(w, (base[i]! * abs(eqStageResponse(st, r.freq[i]!))) / cur[i]!);
    }
    return w;
  };
  if (worst(stageOf(item)) <= 1) return null;
  // Past a limit even without this filter: the drive (or another filter) is the cause, not this one.
  let without = 0;
  for (let i = 0; i < base.length; i++) if (base[i]! > 0) without = Math.max(without, base[i]! / cur[i]!);
  if (without > 1) return null;
  if (item.type === "linkwitz") {
    const at = (fp: number) => worst({ ...stageOf(item), fp } as EqStage);
    let good = item.f0;
    let bad = item.fp;
    if (at(good) > 1) return null;
    for (let k = 0; k < 40; k++) {
      const mid = (good + bad) / 2;
      if (at(mid) <= 1) good = mid;
      else bad = mid;
    }
    const fp = Math.min(item.f0, Math.ceil(good * 10 - 1e-9) / 10);
    return fp <= item.fp ? null : { fp };
  }
  const at = (gain_db: number) => worst({ ...stageOf(item), gain_db } as EqStage);
  let bad = item.gain_db;
  let good = -24;
  if (at(good) > 1) return null;
  for (let k = 0; k < 40; k++) {
    const mid = (good + bad) / 2;
    if (at(mid) <= 1) good = mid;
    else bad = mid;
  }
  const gain_db = Math.floor(good * 10 + 1e-9) / 10;
  return gain_db >= item.gain_db ? null : { gain_db };
}

/** Applies a fit to the one item. */
export function applyFit(s: AppState, id: string, fit: Fit): AppState {
  return { ...s, eq: s.eq.map((e) => (e.id === id ? ({ ...e, ...fit } as EqItem) : e)) };
}

/**
 * Turns the picked filter ("hp" or "eq-<id>") into another type in place, as one new state.
 * Peak and shelves keep id and frequency (gain 0, that type's usual Q); to the high-pass the EQ
 * item becomes the high-pass at its frequency, unless a high-pass is already on (it would be
 * moved and the item lost: nothing changes); from it, an EQ item at the high-pass's frequency.
 * A Linkwitz Transform needs `sealed`, the sealed box this filter applies to (the caller decides:
 * the item's own target, or for "all" the only sealed box); without one nothing changes.
 */
export function changeFilterType(s: AppState, picked: string, to: AddType, sealed?: SealedRef | null): { state: AppState; picked: string | null } {
  const same = { state: s, picked };
  if (picked === "hp") {
    if (to === "highpass" || (to === "linkwitz" && !sealed)) return same;
    const off = { ...s, highPass: { ...s.highPass, on: false } };
    return addFilterAt(off, to, s.highPass.freq, sealed);
  }
  const item = s.eq.find((e) => `eq-${e.id}` === picked);
  if (!item || item.type === to) return same;
  const f = item.type === "linkwitz" ? item.fp : item.freq;
  if (to === "highpass") {
    if (s.highPass.on) return same;
    const next = moveHighPass({ ...s, eq: s.eq.filter((e) => e.id !== item.id), highPass: { ...s.highPass, on: true } }, f);
    return { state: next, picked: "hp" };
  }
  let swap: EqItem;
  if (to === "linkwitz") {
    if (!sealed) return same;
    const f0 = r1(sealed.fc);
    swap = { id: item.id, on: item.on, target: sealed.id, type: "linkwitz", f0, q0: Math.round(sealed.qtc * 1000) / 1000, fp: Math.min(roundF(f), f0), qp: 0.707 };
  } else {
    swap = { id: item.id, on: item.on, target: item.target, type: to, freq: roundF(Math.min(500, Math.max(10, f))), gain_db: 0, q: to === "peak" ? 1.4 : 0.707 };
  }
  return { state: { ...s, eq: s.eq.map((e) => (e.id === item.id ? swap : e)) }, picked };
}
