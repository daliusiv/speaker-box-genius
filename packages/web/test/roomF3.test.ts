import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_STATE, ROOM_PRESETS, type AppState } from "../src/state.ts";
import { runDesigns, solveDriver } from "../src/sim.ts";

test("with cabin gain the summary keeps the box's own F3 and adds the F3 in the car", () => {
  const off = runDesigns(DEFAULT_STATE, solveDriver(DEFAULT_STATE));
  assert.ok(off.every((d) => d.f3Room === undefined));
  const car: AppState = { ...DEFAULT_STATE, roomGain: { ...DEFAULT_STATE.roomGain, mode: "car", ...ROOM_PRESETS.car } };
  const on = runDesigns(car, solveDriver(car));
  for (const [i, d] of on.entries()) {
    assert.equal(d.result.summary.f3, off[i]!.result.summary.f3, "the box's own F3 doesn't change");
    assert.ok(d.f3Room === null || d.f3Room < d.result.summary.f3!, `${d.label}: in the car ${d.f3Room} vs ${d.result.summary.f3}`);
  }
});
