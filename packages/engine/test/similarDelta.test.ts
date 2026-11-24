import { test } from "node:test";
import assert from "node:assert/strict";
import { DEMOTE_F3, demoteTier, simDelta } from "../src/similar.ts";
import type { DriverInput, EnclosureInput } from "../src/model.ts";

// A 12-inch woofer in a 60 L box tuned near 30 Hz.
const T: DriverInput = { fs: 28, qms: 5, qes: 0.42, vas_l: 120, re: 6, sd_cm2: 500, le_mh: 1.2, xmax_mm: 8, pe_w: 400 };
const vented: EnclosureInput = { kind: "vented", vb_l: 60, port: { shape: "round", diameter_cm: 10, length_cm: 30 }, ql: 10, qa: 100, qp: 100 };
const sealed: EnclosureInput = { kind: "sealed", vb_l: 60, ql: 10, qa: 100, qp: 100 };

test("identical drivers: every difference 0", () => {
  for (const box of [sealed, vented]) {
    const d = simDelta(T, { ...T }, box);
    assert.equal(d.dF3, 0);
    assert.equal(d.dMaxSpl, 0);
    assert.equal(d.dLevel283, 0);
    assert.deepEqual(d.worseLimits, []);
    assert.equal(d.peFromTarget, false);
    assert.ok(d.f3Target! > 20 && d.f3Target! < 80);
  }
});

test("a clone with more Xmax plays louder in the bass, same F3 and level", () => {
  // Power handling out of the way, so excursion sets the bass's max SPL.
  const X = { ...T, pe_w: 20000 };
  const d = simDelta(X, { ...X, xmax_mm: 16 }, sealed);
  assert.equal(d.dF3, 0);
  assert.equal(d.dLevel283, 0);
  assert.ok(d.dMaxSpl! > 3 && d.dMaxSpl! <= 20 * Math.log10(2) + 1e-9, `dMaxSpl ${d.dMaxSpl}`);
  const less = simDelta(X, { ...X, xmax_mm: 4 }, sealed);
  assert.ok(less.dMaxSpl! < -3, `dMaxSpl ${less.dMaxSpl}`);
});

test("level at 2.83 V follows Re: half the Re, +3 dB more volts into it (passband)", () => {
  const d = simDelta(T, { ...T, re: 3, qes: 0.21 }, sealed);
  // Bl² ∝ Re / Qes (same Fs, Mms): Bl/Re ×2 → passband +6.02 dB at the same volts.
  assert.ok(Math.abs(d.dLevel283 - 20 * Math.log10(2)) < 0.01, `${d.dLevel283}`);
});

test("missing Xmax leaves Δmax SPL out; missing Pe takes the target's, flagged", () => {
  assert.equal(simDelta(T, { ...T, xmax_mm: undefined }, sealed).dMaxSpl, null);
  const noPe = simDelta(T, { ...T, pe_w: undefined }, sealed);
  assert.equal(noPe.peFromTarget, true);
  assert.equal(noPe.dMaxSpl, 0);
});

test("a stiffer, lighter-motor clone in the target's box: F3 moves", () => {
  const d = simDelta(T, { ...T, fs: 45, vas_l: 50 }, sealed);
  assert.ok(d.dF3! > DEMOTE_F3, `dF3 ${d.dF3}`);
});

test("demoteTier: one step down past 15 % higher F3 or −3 dB max SPL; risky stays", () => {
  assert.equal(demoteTier("close", null), "close");
  assert.equal(demoteTier("close", { dF3: 0.1, dMaxSpl: -2 }), "close");
  assert.equal(demoteTier("close", { dF3: 0.16, dMaxSpl: 0 }), "usable");
  // A lower F3 (more bass in the same box) isn't a reason to demote.
  assert.equal(demoteTier("close", { dF3: -0.3, dMaxSpl: 0 }), "close");
  assert.equal(demoteTier("close", { dF3: 0, dMaxSpl: -3.1 }), "usable");
  assert.equal(demoteTier("usable", { dF3: 0.2, dMaxSpl: null }), "risky");
  assert.equal(demoteTier("risky", { dF3: 0.5, dMaxSpl: -9 }), "risky");
  assert.equal(demoteTier("usable", { dF3: null, dMaxSpl: null }), "usable");
});

test("maxSplAt: both curves read at one frequency; identical → equal, more Xmax → louder, null without asking or without Xmax", () => {
  assert.equal(simDelta(T, { ...T }, sealed).maxSplAt, null);
  assert.equal(simDelta(T, { ...T, xmax_mm: undefined }, sealed, {}, 30).maxSplAt, null);
  const same = simDelta(T, { ...T }, vented, {}, 30);
  assert.equal(same.maxSplAt!.freq, 30);
  assert.equal(same.maxSplAt!.candidate, same.maxSplAt!.target);
  assert.ok(same.maxSplAt!.target > 80 && same.maxSplAt!.target < 140, `${same.maxSplAt!.target}`);
  const X = { ...T, pe_w: 20000 };
  const more = simDelta(X, { ...X, xmax_mm: 16 }, sealed, {}, 30);
  // Excursion-limited at 30 Hz in a sealed box: twice the Xmax → +6.02 dB.
  assert.ok(Math.abs(more.maxSplAt!.candidate - more.maxSplAt!.target - 20 * Math.log10(2)) < 0.05, `${more.maxSplAt!.candidate - more.maxSplAt!.target}`);
});
