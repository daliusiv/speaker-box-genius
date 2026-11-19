import { test } from "node:test";
import assert from "node:assert/strict";
import { solveTs } from "@sbg/engine";
import { measuredTs } from "../src/measuredTs.ts";

// The RSS265HF-4's datasheet, and a sample measured fresh with a 24 % stiffer suspension (Fs +15 %).
const sheet = { fs: 25.6, qms: 3.06, qes: 0.53, qts: 0.45, vas_l: 54, re: 3.5, sd_cm2: 356.3, mms_g: 120, bl: 11.43 };
const sweep = { fs: 29.44, qms: 3.519, qes: 0.6095, re: 3.5, sd_cm2: 356.3 };
const mms = (ts: Record<string, number>) => solveTs(ts).values.mms_g!;

test("measured values without an added-mass sweep keep the driver's Mms, so Vas follows the measured suspension", () => {
  const ts = measuredTs(sheet, mms(sheet), sweep);
  assert.equal(ts.mms_g, 120);
  assert.equal(ts.vas_l, undefined);
  const out = solveTs(ts).values;
  // Only Cms changed: Vas falls by 1.15² from the datasheet's Mms (its own Vas is 7 % off that) and Bl stays (as
  // Fs, Qes, Re and Mms give it).
  const vasOfMms = solveTs({ fs: 25.6, mms_g: 120, sd_cm2: 356.3 }).values.vas_l!;
  assert.ok(Math.abs(out.vas_l! / (vasOfMms / 1.15 ** 2) - 1) < 2e-3, `Vas ${out.vas_l}`);
  const blOfSheet = solveTs({ fs: 25.6, qes: 0.53, re: 3.5, mms_g: 120 }).values.bl!;
  assert.ok(Math.abs(out.bl! / blOfSheet - 1) < 2e-3, `Bl ${out.bl}`);
  assert.equal(solveTs(ts).conflicts.length, 0);
});

test("the kept Mms is the one worked out from the previous values when it wasn't typed", () => {
  const core = { fs: 25.6, qms: 3.06, qes: 0.53, vas_l: 54, re: 3.5, sd_cm2: 356.3 };
  const ts = measuredTs(core, mms(core), sweep);
  assert.ok(Math.abs(ts.mms_g! - mms(core)) < 0.01);
  assert.equal(ts.vas_l, undefined);
});

test("without a cone area the previous Vas is kept; an added-mass sweep keeps nothing from before", () => {
  const { sd_cm2: _sd, ...noSd } = sweep;
  assert.deepEqual(measuredTs({ fs: 25.6, vas_l: 54 }, undefined, noSd), { vas_l: 54, ...noSd });
  const withMass = { ...sweep, mms_g: 118.5 };
  assert.deepEqual(measuredTs(sheet, 120, withMass), withMass);
});
