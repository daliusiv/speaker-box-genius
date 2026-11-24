/**
 * Dipole EQ for an open baffle (Boxes → Open baffle → Dipole EQ): a 6 dB/oct low shelf that lifts
 * the bass the dipole loses below its peak, and a peaking cut at the peak, both aimed at that one
 * design, then the shelf cut back to the limits (Xmax, port, air) as "Cut to …" would.
 *
 * Target: the same driver in a wall (infinite baffle, open rear, half space). An open baffle is
 * that response × the dipole factor in full space, so OB − IB (dB) is the factor alone; the EQ
 * is fitted to cancel it from about two octaves below the peak to just above it.
 */
import { eqStageResponse, abs, type EqStage } from "@sbg/engine";
import { fitToLimits } from "./chartEdit.ts";
import { airLimitOf, driveAt, limitsOf, portLimitOf, runDesigns, type Design, type LimitKind } from "./sim.ts";
import { newDesign, newId, type AppState, type DesignState, type EqItem } from "./state.ts";
import type { SolveResult } from "@sbg/engine";

const PAST: Partial<Record<LimitKind, string>> = { xmax: "Xmax", port: "the port speed limit", air: "the air distortion limit" };

/** Most the shelf lifts before the fit to limits: 12 dB = two octaves of 6 dB/oct. */
export const DIPOLE_SHELF_MAX_DB = 12;

const one = (s: AppState, solved: SolveResult, d: DesignState): Design | undefined =>
  runDesigns({ ...s, baffle: { ...s.baffle, on: false }, designs: [{ ...d, on: true }] }, solved).find((x) => !x.compare && x.design.id === d.id);

/** The open baffle and the same driver in a wall, in one run (one frequency grid: charts go to 1 kHz with an open baffle on), no EQ. */
function pair(s: AppState, solved: SolveResult, d: DesignState): { ob: Design; ib: Design } | null {
  const ibd = { ...newDesign("ib", []), id: `${d.id}-ib`, name: d.name, on: true, rear: "open" } as DesignState;
  const run = runDesigns({ ...s, eq: [], baffle: { ...s.baffle, on: false }, designs: [{ ...d, on: true }, ibd] }, solved).filter((x) => !x.compare);
  const ob = run.find((x) => x.design.id === d.id);
  const ib = run.find((x) => x.design.id === ibd.id);
  return ob && ib && ob.result.freq.length === ib.result.freq.length ? { ob, ib } : null;
}

const db = (st: EqStage, f: number) => 20 * Math.log10(abs(eqStageResponse(st, f)));
const r1 = (x: number) => Math.round(x * 10) / 10;
const r2 = (x: number) => Math.round(x * 100) / 100;

/** Is this item the Dipole EQ of that design (replaced, not stacked, when it's added again)? */
export const isDipoleEqOf = (e: EqItem, id: string, fPeak: number) =>
  e.target === id && (e.type === "lowshelf1" || (e.type === "peak" && e.gain_db < 0 && e.freq > fPeak * 0.5 && e.freq < fPeak * 1.4));

/**
 * The two EQ items for an open-baffle design and a one-line note, or null when the design isn't
 * an open baffle or can't be simulated. `eq` is the project's EQ with any earlier Dipole EQ of
 * this design taken out; the caller replaces state.eq with it.
 */
export function dipoleEq(s: AppState, solved: SolveResult, id: string): { eq: EqItem[]; note: string } | null {
  const d = s.designs.find((x) => x.id === id);
  if (!d || d.kind !== "ob" || solved.missing.length > 0) return null;
  const ob = one(s, solved, d);
  const fPeak = ob?.result.summary.ob?.fPeak;
  if (!ob || !fPeak) return null;
  const rest = s.eq.filter((e) => !isDipoleEqOf(e, id, fPeak));
  const both = pair(s, solved, d);
  if (!both) return null;

  // OB − IB from two octaves under the peak to just above it (the first null comes after).
  const lo = fPeak / 4, hi = fPeak * 1.25;
  const pts: { f: number; e: number }[] = [];
  both.ob.result.freq.forEach((f, i) => {
    const e = both.ob.result.spl[i]! - both.ib.result.spl[i]!;
    if (f >= lo && f <= hi && Number.isFinite(e)) pts.push({ f, e });
  });
  if (pts.length < 8) return null;

  // Coarse grid, then the best cell refined: shelf gain and centre, cut gain, frequency (a frame's
  // highest point can sit by its quarter-wave, not the dipole peak) and Q.
  const cost = (g: number, fs: number, c: number, q: number, fc: number) => {
    const sh: EqStage = { type: "lowshelf1", freq: fs, gain_db: g };
    const pk: EqStage = { type: "peak", freq: fc, gain_db: c, q };
    let sum = 0;
    for (const p of pts) {
      const r = p.e + db(sh, p.f) + (c < 0 ? db(pk, p.f) : 0);
      sum += r * r;
    }
    return sum / pts.length;
  };
  let best = { g: 0, fs: fPeak / 2, c: 0, q: 1, fc: fPeak, v: Infinity };
  for (let g = 0; g <= DIPOLE_SHELF_MAX_DB; g += 2)
    for (let k = 0; k <= 8; k++) {
      const fs = fPeak * 0.12 * 2 ** (k / 4);
      for (let c = -12; c <= 0; c += 2)
        for (const q of [0.7, 1.4, 2.8])
          for (const m of [0.75, 0.9, 1, 1.1]) {
            const v = cost(g, fs, c, q, fPeak * m);
            if (v < best.v) best = { g, fs, c, q, fc: fPeak * m, v };
          }
    }
  for (let it = 0; it < 30; it++) {
    let moved = false;
    for (const [dg, dfs, dc, dq, dfc] of [
      [0.5, 1, 0, 1, 1], [-0.5, 1, 0, 1, 1], [0, 1.04, 0, 1, 1], [0, 1 / 1.04, 0, 1, 1],
      [0, 1, 0.5, 1, 1], [0, 1, -0.5, 1, 1], [0, 1, 0, 1.1, 1], [0, 1, 0, 1 / 1.1, 1], [0, 1, 0, 1, 1.03], [0, 1, 0, 1, 1 / 1.03],
    ] as const) {
      const g = Math.min(DIPOLE_SHELF_MAX_DB, Math.max(0, best.g + dg));
      const c = Math.max(-15, Math.min(0, best.c + dc));
      const q = Math.min(6, Math.max(0.5, best.q * dq));
      const v = cost(g, best.fs * dfs, c, q, best.fc * dfc);
      if (v < best.v - 1e-9) {
        best = { g, fs: best.fs * dfs, c, q, fc: best.fc * dfc, v };
        moved = true;
      }
    }
    if (!moved) break;
  }

  const ids = [...rest];
  const shelf: EqItem = { id: newId(ids), on: true, target: id, type: "lowshelf1", freq: Math.round(best.fs), gain_db: r1(best.g) };
  ids.push(shelf);
  const cut: EqItem | null = best.c <= -0.5 ? { id: newId(ids), on: true, target: id, type: "peak", freq: Math.round(best.fc), gain_db: r1(best.c), q: r2(best.q) } : null;
  let eq = [...rest, shelf, ...(cut ? [cut] : [])];

  // Then the shelf back to the limits, as the filter panel's "Cut to …". A few rounds: a smaller
  // shelf moves the design's F3, and with it the band the limits are judged in.
  let shelfDb = shelf.gain_db;
  for (let k = 0; k < 4 && shelfDb > 0; k++) {
    const now = eq.find((e) => e.id === shelf.id)!;
    const withEq = one({ ...s, eq }, solved, d);
    const fit = withEq ? fitToLimits(withEq.result, now, s.xmax_mm, s.highPass.on, portLimitOf(s), airLimitOf(s)) : null;
    if (!fit || !("gain_db" in fit)) break;
    shelfDb = Math.max(0, fit.gain_db);
    eq = eq.map((e) => (e.id === shelf.id ? ({ ...e, gain_db: shelfDb } as EqItem) : e));
  }
  // The fit scales the run it has; the re-run can land a hair over (0.3 % at 100 W, #351): step
  // down 0.1 dB until the design is within the limits, so the EQ never adds a warning.
  const over = () => {
    const r = one({ ...s, eq }, solved, d)?.result;
    return r ? limitsOf(r, s.xmax_mm, s.highPass.on, portLimitOf(s), airLimitOf(s)).over.length > 0 : false;
  };
  const before = one({ ...s, eq: rest }, solved, d)?.result;
  const bareLimits = before ? limitsOf(before, s.xmax_mm, s.highPass.on, portLimitOf(s), airLimitOf(s)) : null;
  const overAlready = (bareLimits?.over.length ?? 0) > 0;
  for (let k = 0; !overAlready && shelfDb < shelf.gain_db && k < 20 && shelfDb > 0 && over(); k++) {
    shelfDb = Math.max(0, r1(shelfDb - 0.1));
    eq = eq.map((e) => (e.id === shelf.id ? ({ ...e, gain_db: shelfDb } as EqItem) : e));
  }

  const parts = [`a 6 dB/oct shelf +${shelfDb} dB at ${shelf.freq} Hz`];
  if (cut) parts.push(`a cut −${Math.abs(cut.gain_db)} dB at ${cut.freq} Hz (Q ${cut.q})`);
  const cutBack = shelfDb < shelf.gain_db ? ` The shelf was cut from +${shelf.gain_db} dB to stay within the limits.` : "";
  // Already past a limit with no EQ: the drive is the cause, so the shelf can't be fitted (the
  // fit leaves it alone). Say so, with the drive that would let it be fitted.
  const tooLoud = overAlready && bareLimits
    ? ` At ${driveAt(s, 1)} the board is already past ${PAST[bareLimits.over[0]!] ?? "a limit"} without EQ, so the shelf isn't fitted to the limits: set the drive below ${driveAt(s, bareLimits.safeScale)} and add the Dipole EQ again.`
    : "";
  return { eq, note: `Dipole EQ for ${d.name}: ${parts.join(" and ")} (Signal → EQ).${cutBack}${tooLoud}` };
}
