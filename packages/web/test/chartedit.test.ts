import { test } from "node:test";
import assert from "node:assert/strict";
import { ventedFb, prFb } from "../../engine/src/index.ts";
import { DEFAULT_STATE, type AppState } from "../src/state.ts";
import { airOf, portOf, vbOf } from "../src/sim.ts";
import { eqQ, moveEq, retune } from "../src/chartEdit.ts";

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
