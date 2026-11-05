/**
 * Editing on the response chart: what dragging a handle does to the app state. Pure
 * functions, so they're easy to test; App turns them into chart handles.
 */
import { portLengthForFb } from "@sbg/engine";
import { prTuning } from "./presets.ts";
import { airOf, portOf, vbOf } from "./sim.ts";
import type { AppState, DesignState, EqItem } from "./state.ts";

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
    const len = portLengthForFb(vb, portOf(d, 0), target, d.count, undefined, air);
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

/** EQ points that can be dragged: peaking and low shelf (frequency and gain). */
export const draggableEq = (e: EqItem): e is Extract<EqItem, { type: "peak" | "lowshelf" }> => e.on && (e.type === "peak" || e.type === "lowshelf");

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
