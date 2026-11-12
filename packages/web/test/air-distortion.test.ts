import { test } from "node:test";
import assert from "node:assert/strict";
import { simulate } from "@sbg/engine";
import { DEFAULT_STATE, decodeState, encodeState } from "../src/state.ts";
import { AIR_FILL_N, airLimitOf, limitsOf, simOptionsOf } from "../src/sim.ts";

const DRV = { fs: 30, qms: 5.2, qes: 0.4, vas_l: 50, re: 3.4, sd_cm2: 330, xmax_mm: 12, pe_w: 300 };

test("air distortion: always worked out for boxes, skipped in searches unless counted in Max SPL", () => {
  assert.deepEqual(simOptionsOf(DEFAULT_STATE).airDistortion, { threshold: 0.1, limit: false, n: AIR_FILL_N.empty });
  assert.equal(simOptionsOf(DEFAULT_STATE, true).airDistortion, null);
  const counted = { ...DEFAULT_STATE, settings: { ...DEFAULT_STATE.settings, airInMaxSpl: true } };
  assert.deepEqual(simOptionsOf(counted, true).airDistortion, { threshold: 0.1, limit: true, n: AIR_FILL_N.empty });
  assert.ok(!encodeState(DEFAULT_STATE).includes("air"), "defaults are stripped from links");
});

test("air distortion settings survive a link; the limit is clamped to 1–30 %", () => {
  const on = { ...DEFAULT_STATE, settings: { ...DEFAULT_STATE.settings, airLimit_pct: 5, airInMaxSpl: true, airFill: "filled" as const } };
  const back = decodeState(encodeState(on))!;
  assert.equal(back.settings.airLimit_pct, 5);
  assert.equal(back.settings.airInMaxSpl, true);
  assert.equal(back.settings.airFill, "filled");
  assert.deepEqual(simOptionsOf(back).airDistortion, { threshold: 0.05, limit: true, n: AIR_FILL_N.filled });
  const wild = decodeState(encodeState({ ...on, settings: { ...on.settings, airLimit_pct: 500 } }))!;
  assert.equal(wild.settings.airLimit_pct, 30);
});

test("limits: air distortion over its limit is flagged, and only when modelled", () => {
  const box = { kind: "sealed" as const, vb_l: 8 };
  const r = simulate(DRV, box, { power: 200, airDistortion: { threshold: 0.1, limit: false } });
  const peak = Math.max(...r.airHd2!.filter((_, i) => r.freq[i]! >= 20));
  const tight = limitsOf(r, 12, false, 17, peak / 2);
  assert.ok(tight.over.includes("air"));
  assert.ok(Math.abs(tight.hd2! - peak) < 1e-9);
  assert.ok(tight.safeScale <= 0.5 + 1e-9);
  assert.ok(!limitsOf(r, 12, false, 17, peak * 2).over.includes("air"));
  const off = simulate(DRV, box, { power: 200 });
  assert.equal(limitsOf(off, 12, false, 17, 0.001).hd2, null);
  // Callers that don't pass a limit (the calculators) never count it.
  assert.ok(!limitsOf(r, 12, false, 17).over.includes("air"));
  assert.equal(airLimitOf(DEFAULT_STATE), 10);
});
