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

test("the F3 in the car is where the curve the chart draws (cabin gain added) crosses −3 dB, so the chart's dots sit on the −3 dB line", () => {
  const car: AppState = { ...DEFAULT_STATE, roomGain: { ...DEFAULT_STATE.roomGain, mode: "car", ...ROOM_PRESETS.car } };
  for (const d of runDesigns(car, solveDriver(car))) {
    if (d.f3Room == null) continue;
    const r = d.result;
    const i = r.freq.findIndex((f) => f >= d.f3Room!);
    const t = Math.log(d.f3Room / r.freq[i - 1]!) / Math.log(r.freq[i]! / r.freq[i - 1]!);
    const y = r.spl[i - 1]! + t * (r.spl[i]! - r.spl[i - 1]!) - (r.summary.bandPeakSpl ?? r.summary.referenceSpl);
    assert.ok(Math.abs(y + 3) < 0.05, `${d.label}: ${y} dB at ${d.f3Room} Hz`);
  }
});
