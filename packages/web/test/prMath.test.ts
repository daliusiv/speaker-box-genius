import { test } from "node:test";
import assert from "node:assert/strict";
import { prFb } from "@sbg/engine";
import { fewestThatKeepUp, prCalc, prCheck, prDesignOf, type PrCalcInput } from "../src/calculators/prMath.ts";
import { DEFAULT_STATE, EXAMPLE_PR } from "../src/state.ts";
import { airOf, runDesigns, solveDriver } from "../src/sim.ts";
import { prTuning } from "../src/presets.ts";

const AIR = airOf(DEFAULT_STATE);
const base: PrCalcInput = { vb_l: 50, fb: 30, count: 2, pr: { ...EXAMPLE_PR } };

test("PR calculator: the added mass tunes back to the target, as the app's own PR design does", () => {
  for (const i of [base, { ...base, count: 1 }, { ...base, count: 4, fb: 25 }, { ...base, vb_l: 20, fb: 40 }]) {
    const r = prCalc(i, AIR)!;
    assert.ok(r && !r.tooLow, JSON.stringify(i));
    assert.ok(Math.abs(prFb(i.vb_l, i.pr, i.count, r.addedMass_g, AIR) - i.fb) < 1e-6);
    assert.ok(Math.abs(r.fb - i.fb) < 1e-6);
    // The design it opens in the app tunes the same (mass rounded to 0.1 g).
    const d = prDesignOf(i, r, "PR");
    assert.ok(Math.abs(prTuning(d, d.vb_l, AIR).fb - i.fb) < 0.01);
    assert.ok(r.bareFb > i.fb && r.fsLoaded < r.fs);
    assert.equal(r.totalMass_g, i.pr.mms_g + r.addedMass_g);
    assert.ok(Math.abs(r.vd_cm3 - i.pr.sd_cm2 * (i.pr.xmax_mm / 10) * i.count) < 1e-9);
  }
});

test("PR calculator: too heavy, too much mass, over the published maximum, bad input", () => {
  const heavy = prCalc({ ...base, count: 1, vb_l: 200, fb: 40 }, AIR)!;
  assert.ok(heavy.tooLow && heavy.addedMass_g === 0 && heavy.bareFb < 40 && heavy.fb === heavy.bareFb);
  const r = prCalc({ ...base, maxAdded_g: 50 }, AIR)!;
  assert.ok(r.overMax && r.lowestFb! > base.fb);
  assert.ok(!prCalc({ ...base, maxAdded_g: 1e4 }, AIR)!.overMax);
  assert.equal(prCalc({ ...base, vb_l: 0 }, AIR), null);
  assert.equal(prCalc({ ...base, pr: { ...base.pr, vas_l: 0 } }, AIR), null);
});

test("PR calculator: the keep-up check matches the simulator's own peaks, and more PRs keep up better", () => {
  const s = { ...DEFAULT_STATE, drive: "watts" as const, power: 100 };
  const one = { ...base, count: 1 };
  const r1 = prCalc(one, AIR)!;
  const c1 = prCheck(s, one, r1)!;
  const st = { ...s, designs: [prDesignOf(one, r1, "PR")] };
  const [d] = runDesigns(st, solveDriver(st));
  assert.ok(d && d.result.summary.f3 === c1.f3);
  const r4 = prCalc({ ...base, count: 4 }, AIR)!;
  const c4 = prCheck(s, { ...base, count: 4 }, r4)!;
  assert.ok(c4.prUse < c1.prUse, `${c4.prUse} < ${c1.prUse}`);
  // Use doesn't depend on power (excursion scales with drive).
  const c1b = prCheck({ ...s, power: 10 }, one, r1)!;
  assert.ok(Math.abs(c1b.prUse - c1.prUse) < 1e-6);
  const f = fewestThatKeepUp(s, one, AIR);
  if (f) assert.ok(f.c.prUse <= 1 && f.count >= 1);
});
