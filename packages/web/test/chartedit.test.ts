import { test } from "node:test";
import assert from "node:assert/strict";
import { ventedFb, prFb } from "../../engine/src/index.ts";
import { DEFAULT_STATE, type AppState } from "../src/state.ts";
import { airOf, portOf, vbOf } from "../src/sim.ts";
import { eqQ, moveEq, retune } from "../src/chartEdit.ts";
import { addFilterAt, applyFit, changeFilterType, worstLimit, combineLanes, eqOnlyDb, excursionLane, fitToLimits, moveHighPass, type LaneKind } from "../src/chartEdit.ts";
import { limitsOf, PORT_LIMIT, runDesigns, solveDriver } from "../src/sim.ts";
import type { EqItem } from "../src/state.ts";

const s0: AppState = { ...DEFAULT_STATE, eq: [{ id: "e1", on: true, target: "all", type: "peak", freq: 40, gain_db: -3, q: 2 }] };
const byKind = (s: AppState, k: string) => s.designs.find((d) => d.kind === k)!;

test("dragging a ported box's tuning sets the port length that tunes it there", () => {
  const v = byKind(s0, "vented");
  const s = retune(s0, v.id, 27.3);
  const d = byKind(s, "vented") as Extract<AppState["designs"][number], { kind: "vented" }>;
  assert.equal(d.targetFb, 27.3);
  const fb = ventedFb(vbOf(s, d), portOf(d), d.count, undefined, airOf(s));
  assert.ok(Math.abs(fb - 27.3) < 0.1, `Fb ${fb}`);
  // Far too high for this port: unchanged (the handle stops).
  assert.equal(retune(s0, v.id, 190), s0);
});

test("dragging a PR box's tuning sets the added mass; below the bare tuning it stops", () => {
  const p = byKind(s0, "pr") as Extract<AppState["designs"][number], { kind: "pr" }>;
  const s = retune(s0, p.id, 25);
  const d = byKind(s, "pr") as typeof p;
  assert.ok(d.addedMass_g > p.addedMass_g);
  assert.ok(Math.abs(prFb(vbOf(s, d), d.params, d.count, d.addedMass_g, airOf(s)) - 25) < 0.1);
  const bare = prFb(vbOf(s0, p), p.params, p.count, 0, airOf(s0));
  assert.equal(retune(s0, p.id, bare + 20), s0);
});

test("EQ points move within 10–500 Hz and ±24 dB; the wheel steps Q", () => {
  const e = (s: AppState) => s.eq[0] as Extract<AppState["eq"][number], { type: "peak" }>;
  assert.deepEqual([e(moveEq(s0, "e1", 63.27, 4.26)).freq, e(moveEq(s0, "e1", 63.27, 4.26)).gain_db], [63.3, 4.3]);
  assert.deepEqual([e(moveEq(s0, "e1", 2, 40)).freq, e(moveEq(s0, "e1", 2, 40)).gain_db], [10, 24]);
  assert.equal(e(eqQ(s0, "e1", true)).q, 2.2);
  assert.equal(e(eqQ(s0, "e1", false)).q, 1.82);
});

test("addFilterAt: peak, shelves, high-pass, Linkwitz", () => {
  const a = addFilterAt(DEFAULT_STATE, "peak", 53.37);
  assert.equal(a.picked, `eq-${a.state.eq[a.state.eq.length - 1]!.id}`);
  const p = a.state.eq[a.state.eq.length - 1]!;
  assert.deepEqual([p.type, p.on, p.target], ["peak", true, "all"]);
  assert.equal((p as { freq: number }).freq, 53.4);
  assert.equal((p as { q: number }).q, 1.4);
  assert.equal((p as { gain_db: number }).gain_db, 0);
  const b = addFilterAt(a.state, "lowshelf", 5);
  const c = addFilterAt(b.state, "highshelf", 900.4);
  const ids = c.state.eq.map((e) => e.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.equal((b.state.eq.at(-1) as { freq: number; q: number }).freq, 10);
  assert.equal((c.state.eq.at(-1) as { freq: number; q: number }).freq, 500);
  assert.equal((c.state.eq.at(-1) as { q: number }).q, 0.707);
  const h = addFilterAt(DEFAULT_STATE, "highpass", 250);
  assert.equal(h.picked, "hp");
  assert.deepEqual([h.state.highPass.on, h.state.highPass.freq], [true, 200]);
  assert.equal(addFilterAt(DEFAULT_STATE, "highpass", 2).state.highPass.freq, 5);
  const none = addFilterAt(DEFAULT_STATE, "linkwitz", 20);
  assert.equal(none.state, DEFAULT_STATE);
  assert.equal(none.picked, null);
  const lt = addFilterAt(DEFAULT_STATE, "linkwitz", 15, { id: "d9", fc: 55.46, qtc: 0.9876 });
  const it = lt.state.eq.at(-1)! as Extract<EqItem, { type: "linkwitz" }>;
  assert.deepEqual([it.target, it.f0, it.q0, it.fp, it.qp], ["d9", 55.5, 0.988, 15, 0.707]);
  assert.equal((addFilterAt(DEFAULT_STATE, "linkwitz", 80, { id: "d9", fc: 55, qtc: 0.7 }).state.eq.at(-1) as { fp: number }).fp, 55);
});

test("moveHighPass clamps and rounds", () => {
  assert.equal(moveHighPass(DEFAULT_STATE, 1).highPass.freq, 5);
  assert.equal(moveHighPass(DEFAULT_STATE, 999).highPass.freq, 200);
  assert.equal(moveHighPass(DEFAULT_STATE, 33.37).highPass.freq, 33.4);
  assert.equal(moveHighPass(DEFAULT_STATE, 120.4).highPass.freq, 120);
});

test("eqOnlyDb: peak, high-pass, targeting, empty", () => {
  const hpOff = { ...DEFAULT_STATE.highPass, on: false };
  const pk: EqItem = { id: "a", on: true, target: "all", type: "peak", freq: 100, gain_db: 6, q: 1.4 };
  assert.ok(Math.abs(eqOnlyDb([pk], hpOff, [100], "d1")[0]! - 6) < 0.01);
  const hp = { on: true, type: "butterworth" as const, order: 2, freq: 35 };
  assert.ok(Math.abs(eqOnlyDb([], hp, [35], "d1")[0]! + 3.01) < 0.02);
  assert.equal(eqOnlyDb([{ ...pk, target: "other" }], hpOff, [100], "d1")[0], 0);
  assert.equal(eqOnlyDb([{ ...pk, on: false }], hpOff, [100], "d1")[0], 0);
  assert.deepEqual(Array.from(eqOnlyDb([], hpOff, [20, 50], "d1")), [0, 0]);
});

/** A bare result: sealed-like (no deep split), checked from 20 Hz. */
function fake(freq: number[], exc: number[], extra: Record<string, unknown> = {}) {
  return { freq: Float64Array.from(freq), excursionMm: Float64Array.from(exc), summary: { f3: 50, fc: 50 }, ...extra } as never;
}

test("excursionLane and combineLanes", () => {
  const r = fake([10, 20, 30, 40, 50], [99, 4, 8, 8.1, 10.1]);
  assert.deepEqual(excursionLane(r, 10, false, 17), ["ok", "ok", "near", "near", "over"]);
  assert.deepEqual(excursionLane(r, 10, true, 17), ["over", "ok", "near", "near", "over"]);
  const r2 = fake([20, 30, 40], [0, 0, 0], { portVelocity: Float64Array.from([0, 17.5, 14]), prGroups: [{ excursionMm: Float64Array.from([0, 0, 9]), xmax_mm: 10 }] });
  assert.deepEqual(excursionLane(r2, 10, false, 17), ["ok", "over", "near"]);
  assert.deepEqual(combineLanes([["ok", "near", "ok"], ["ok", "ok", "over"], ["near", "ok", "ok"]]), ["near", "near", "over"] satisfies LaneKind[]);
  assert.deepEqual(combineLanes([]), []);
  // Deep-bass zone of a tuned box: twice Xmax allowed between 20 Hz and 0.7 Fb.
  const t = fake([20, 25, 40], [16.5, 21, 9], { summary: { f3: 30, fb: 50 } });
  assert.deepEqual(excursionLane(t, 10, false, 17), ["near", "over", "near"]);
});

/** Sealed default driver at 300 W with a boost, plus its result. */
function boosted(item: EqItem, power = 300) {
  const sealed = DEFAULT_STATE.designs.find((d) => d.kind === "sealed")!;
  const s: AppState = { ...DEFAULT_STATE, power, highPass: { ...DEFAULT_STATE.highPass, on: false }, designs: [sealed], eq: [item] };
  return { s, r: runDesigns(s, solveDriver(s))[0]!.result };
}

test("fitToLimits cuts a boosted peak to just within Xmax", () => {
  const pk: EqItem = { id: "b1", on: true, target: "all", type: "peak", freq: 40, gain_db: 15, q: 1.4 };
  const { s, r } = boosted(pk, 20);
  const l0 = limitsOf(r, s.xmax_mm, false);
  assert.ok(l0.x! / s.xmax_mm > 1, `needs to be over Xmax, ratio ${l0.x! / s.xmax_mm}`);
  const fit = fitToLimits(r, pk, s.xmax_mm, false, PORT_LIMIT)!;
  assert.ok(fit && "gain_db" in fit && fit.gain_db < 15);
  const s2 = applyFit(s, "b1", fit);
  const r2 = runDesigns(s2, solveDriver(s2))[0]!.result;
  const ratio = limitsOf(r2, s2.xmax_mm, false).x! / s2.xmax_mm;
  assert.ok(ratio <= 1.0 && ratio >= 0.95, `ratio ${ratio}`);
  assert.equal(fitToLimits(r2, s2.eq[0]!, s2.xmax_mm, false, PORT_LIMIT), null);
  assert.equal(fitToLimits(r, { ...pk, on: false }, s.xmax_mm, false, PORT_LIMIT), null);
});

test("fitToLimits raises a Linkwitz corner until within Xmax", () => {
  const { s: s0, r: r0 } = boosted({ id: "z", on: false, target: "all", type: "peak", freq: 40, gain_db: 0, q: 1 }, 20);
  const sum = r0.summary;
  const lt: EqItem = { id: "l1", on: true, target: s0.designs[0]!.id, type: "linkwitz", f0: sum.fc!, q0: sum.qtc!, fp: sum.fc! / 3, qp: 0.707 };
  const { s, r } = boosted(lt, 20);
  assert.ok(limitsOf(r, s.xmax_mm, false).x! > s.xmax_mm, "linkwitz drives it past Xmax");
  const fit = fitToLimits(r, lt, s.xmax_mm, false, PORT_LIMIT)!;
  assert.ok(fit && "fp" in fit && fit.fp > (lt as { fp: number }).fp && fit.fp <= sum.fc!);
  const s2 = applyFit(s, "l1", fit);
  const r2 = runDesigns(s2, solveDriver(s2))[0]!.result;
  const ratio = limitsOf(r2, s2.xmax_mm, false).x! / s2.xmax_mm;
  assert.ok(ratio <= 1.0 && ratio >= 0.9, `ratio ${ratio}`);
});

test("fitToLimits leaves it to the drive when the box is past a limit without the filter", () => {
  const pk: EqItem = { id: "b1", on: true, target: "all", type: "peak", freq: 40, gain_db: 6, q: 1.4 };
  const { s: s0, r: r0 } = boosted({ ...pk, on: false }, 300);
  assert.ok(limitsOf(r0, s0.xmax_mm, false).x! > s0.xmax_mm, "past Xmax with no EQ");
  const { s, r } = boosted(pk, 300);
  assert.equal(fitToLimits(r, pk, s.xmax_mm, false, PORT_LIMIT), null);
});

test("worstLimit: the worst point, which limit, and none when nothing is checked", () => {
  const r = fake([20, 30, 40, 50], [0, 12, 8, 9]);
  assert.deepEqual(worstLimit(r, 10, false, 17), { kind: "xmax", ratio: 1.2, f: 30 });
  const r2 = fake([20, 30, 40], [0, 0, 5], { portVelocity: Float64Array.from([0, 17.5, 14]), prGroups: [{ excursionMm: Float64Array.from([0, 0, 9]), xmax_mm: 10 }] });
  assert.deepEqual(worstLimit(r2, 10, false, 17), { kind: "port", ratio: 17.5 / 17, f: 30 });
  const r3 = fake([20, 30, 40], [0, 0, 5], { prGroups: [{ excursionMm: Float64Array.from([0, 0, 12]), xmax_mm: 10 }] });
  assert.equal(worstLimit(r3, 10, false, 17)!.kind, "pr");
  assert.equal(worstLimit(fake([10], [99]), 10, false, 17), null);
  // Air distortion counts when a limit is given (%), as limitsOf counts it.
  const r4 = fake([20, 30, 40], [0, 5, 0], { airHd2: Float64Array.from([0, 6, 2.7]) });
  assert.equal(worstLimit(r4, 10, false, 17)!.kind, "xmax");
  assert.deepEqual(worstLimit(r4, 10, false, 17, 3), { kind: "air", ratio: 2, f: 30 });
  assert.deepEqual(excursionLane(r4, 10, false, 17, 0.8, 3), ["ok", "over", "near"]);
});

test("changeFilterType: peak/shelves keep id and freq, to/from high-pass, Linkwitz needs a sealed box", () => {
  const pk: EqItem = { id: "e1", on: true, target: "all", type: "peak", freq: 45, gain_db: 6, q: 3 };
  const s: AppState = { ...DEFAULT_STATE, eq: [pk], highPass: { ...DEFAULT_STATE.highPass, on: false } };
  const ls = changeFilterType(s, "eq-e1", "lowshelf");
  assert.equal(ls.picked, "eq-e1");
  assert.deepEqual(ls.state.eq, [{ id: "e1", on: true, target: "all", type: "lowshelf", freq: 45, gain_db: 0, q: 0.707 }]);
  const back = changeFilterType(ls.state, "eq-e1", "peak");
  assert.deepEqual([(back.state.eq[0] as { q: number }).q, (back.state.eq[0] as { gain_db: number }).gain_db], [1.4, 0]);
  assert.equal(changeFilterType(s, "eq-e1", "peak").state, s);
  const hp = changeFilterType(s, "eq-e1", "highpass");
  assert.deepEqual([hp.picked, hp.state.eq.length, hp.state.highPass.on, hp.state.highPass.freq], ["hp", 0, true, 45]);
  assert.equal(changeFilterType({ ...s, eq: [{ ...pk, freq: 400 }] }, "eq-e1", "highpass").state.highPass.freq, 200);
  // A high-pass already on: not moved, the item kept.
  const on = { ...s, highPass: { ...s.highPass, on: true, freq: 25 } };
  assert.equal(changeFilterType(on, "eq-e1", "highpass").state, on);
  const fromHp = changeFilterType({ ...s, highPass: { ...s.highPass, on: true, freq: 30 } }, "hp", "highshelf");
  assert.equal(fromHp.state.highPass.on, false);
  const made = fromHp.state.eq.at(-1)! as { type: string; freq: number; id: string };
  assert.deepEqual([made.type, made.freq, fromHp.picked], ["highshelf", 30, `eq-${made.id}`]);
  // Linkwitz: nothing without a sealed box; fp = min(freq, f0), target the sealed box.
  assert.equal(changeFilterType(s, "eq-e1", "linkwitz").state, s);
  const lt = changeFilterType(s, "eq-e1", "linkwitz", { id: "d9", fc: 40, qtc: 0.9 });
  assert.deepEqual(lt.state.eq[0], { id: "e1", on: true, target: "d9", type: "linkwitz", f0: 40, q0: 0.9, fp: 40, qp: 0.707 });
  assert.equal(lt.picked, "eq-e1");
});
