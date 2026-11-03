import { test } from "node:test";
import assert from "node:assert/strict";
import {
  passiveRadiatorModel,
  prAddedMassForFb,
  prFb,
  prGroupsAddedMassForFb,
  prGroupsFb,
  type DriverInput,
  type PassiveRadiatorInput,
} from "../src/model.ts";
import { simulate, type SimulationOptions } from "../src/simulate.ts";

/** Mixed passive radiators: a box holding more than one kind of PR. */

const DRIVER: DriverInput = { fs: 30, qms: 5.2, qes: 0.4, vas_l: 50, re: 3.4, sd_cm2: 330, xmax_mm: 12, pe_w: 300 };
const PR_A: PassiveRadiatorInput = { mms_g: 122, sd_cm2: 330, vas_l: 80, qms: 6, xmax_mm: 18 };
const PR_B: PassiveRadiatorInput = { mms_g: 60, sd_cm2: 220, vas_l: 35, qms: 8, xmax_mm: 10 };
const OPTS: SimulationOptions = { power: 100, points: 300 };

const maxRelDiff = (a: Float64Array, b: Float64Array) => {
  let m = 0;
  for (let i = 0; i < a.length; i++) m = Math.max(m, Math.abs(a[i]! - b[i]!) / Math.max(1e-9, Math.abs(b[i]!)));
  return m;
};
const maxAbsDiff = (a: Float64Array, b: Float64Array) => {
  let m = 0;
  for (let i = 0; i < a.length; i++) m = Math.max(m, Math.abs(a[i]! - b[i]!));
  return m;
};

test("two groups of the same PR behave exactly like one group of two", () => {
  const one = simulate(DRIVER, { kind: "passive-radiator", vb_l: 50, pr: PR_A, prCount: 2, addedMass_g: 40 }, OPTS);
  const split = simulate(
    DRIVER,
    { kind: "passive-radiator", vb_l: 50, pr: PR_A, prCount: 1, addedMass_g: 40, extraPrs: [{ pr: PR_A, count: 1, addedMass_g: 40 }] },
    OPTS,
  );
  assert.ok(maxAbsDiff(split.spl, one.spl) < 1e-9);
  assert.ok(maxRelDiff(split.excursionMm, one.excursionMm) < 1e-9);
  assert.ok(maxRelDiff(split.impedanceOhm, one.impedanceOhm) < 1e-9);
  assert.ok(maxRelDiff(split.prGroups![1]!.excursionMm, one.prExcursionMm!) < 1e-9);
  assert.ok(Math.abs(split.summary.fb! - one.summary.fb!) < 1e-9);
  assert.deepEqual(split.limitedBy, one.limitedBy);
});

test("1 + 3 of the same PR equals 4", () => {
  const four = simulate(DRIVER, { kind: "passive-radiator", vb_l: 60, pr: PR_B, prCount: 4 }, OPTS);
  const mixed = simulate(DRIVER, { kind: "passive-radiator", vb_l: 60, pr: PR_B, prCount: 1, extraPrs: [{ pr: PR_B, count: 3 }] }, OPTS);
  assert.ok(maxAbsDiff(mixed.spl, four.spl) < 1e-9);
  assert.ok(maxRelDiff(mixed.prGroups![0]!.excursionMm, four.prExcursionMm!) < 1e-9);
});

test("an immovably heavy extra PR changes nothing", () => {
  const alone = simulate(DRIVER, { kind: "passive-radiator", vb_l: 50, pr: PR_A, prCount: 2, addedMass_g: 40 }, OPTS);
  const withBrick = simulate(
    DRIVER,
    { kind: "passive-radiator", vb_l: 50, pr: PR_A, prCount: 2, addedMass_g: 40, extraPrs: [{ pr: PR_B, count: 1, addedMass_g: 1e9 }] },
    OPTS,
  );
  // Its suspension still adds a little compliance, which moves the approximate combined Fb
  // that the box-loss Qs are referred to: a few hundredths of a dB.
  assert.ok(maxAbsDiff(withBrick.spl, alone.spl) < 0.05, String(maxAbsDiff(withBrick.spl, alone.spl)));
  assert.ok(Math.max(...withBrick.prGroups![1]!.excursionMm) < 1e-3);
});

test("each group's excursion follows its own impedance (same box pressure)", () => {
  const r = simulate(DRIVER, { kind: "passive-radiator", vb_l: 45, pr: PR_A, prCount: 1, extraPrs: [{ pr: PR_B, count: 2, addedMass_g: 30 }] }, OPTS);
  const a = passiveRadiatorModel(PR_A, 0);
  const b = passiveRadiatorModel(PR_B, 30);
  // Mechanical impedance magnitude of one PR, referred to the acoustic side: |Zm| / Sd².
  const zAc = (m: typeof a, w: number) => Math.hypot(m.rmp, w * m.mmp - 1 / (w * m.cmp)) / (m.sd * m.sd);
  for (const i of [20, 100, 200, 280]) {
    const w = 2 * Math.PI * r.freq[i]!;
    // x = |U| / (Sd ω) and U = p / Zac, so xA / xB = (Zac_B · Sd_B) / (Zac_A · Sd_A).
    const expected = (zAc(b, w) * b.sd) / (zAc(a, w) * a.sd);
    const got = r.prGroups![0]!.excursionMm[i]! / r.prGroups![1]!.excursionMm[i]!;
    assert.ok(Math.abs(got / expected - 1) < 1e-9, `${r.freq[i]} Hz: ${got} vs ${expected}`);
  }
  assert.equal(r.prGroups![1]!.xmax_mm, 10);
});

test("the smaller PR's Xmax sets the limit when it moves furthest past it", () => {
  // Heavy A tunes low; light B tunes high and has only 2 mm Xmax.
  const tinyXmax = { ...PR_B, xmax_mm: 2 };
  const r = simulate(DRIVER, { kind: "passive-radiator", vb_l: 45, pr: PR_A, prCount: 1, addedMass_g: 100, extraPrs: [{ pr: tinyXmax, count: 1 }] }, OPTS);
  const i = r.limitedBy.indexOf("pr-xmax");
  assert.ok(i >= 0, "some band is PR-limited");
  const xb = r.prGroups![1]!.excursionMm[i]!;
  // At the reported max power, PR B is exactly at its Xmax.
  assert.ok(Math.abs(xb * Math.sqrt(r.maxPowerW[i]! / 100) - 2) < 1e-6);
});

test("combined tuning: identical groups match the single-PR formula; added mass solves for it", () => {
  const fb1 = prFb(50, PR_A, 3, 25);
  const fbG = prGroupsFb(50, [
    { pr: PR_A, count: 1, addedMass_g: 25 },
    { pr: PR_A, count: 2, addedMass_g: 25 },
  ]);
  assert.ok(Math.abs(fbG - fb1) < 1e-9);
  const add1 = prAddedMassForFb(50, PR_A, 22, 3);
  const addG = prGroupsAddedMassForFb(50, [{ pr: PR_A, count: 3 }], 22);
  assert.ok(Math.abs(addG - add1) < 1e-6, `${addG} vs ${add1}`);
  // Mixed: adding mass to group 0 can only go down to what group 1 allows on its own.
  const groups = [{ pr: PR_A, count: 1 }, { pr: PR_B, count: 2, addedMass_g: 20 }];
  const top = prGroupsFb(45, groups);
  const floor = prGroupsFb(45, [{ ...groups[0]!, addedMass_g: 1e9 }, groups[1]!]);
  assert.ok(floor < top);
  const target = (top + floor) / 2;
  const add = prGroupsAddedMassForFb(45, groups, target);
  assert.ok(add > 0 && Number.isFinite(add));
  assert.ok(Math.abs(prGroupsFb(45, [{ ...groups[0]!, addedMass_g: add }, groups[1]!]) - target) < 1e-6);
  assert.equal(prGroupsAddedMassForFb(45, groups, floor - 1), Infinity);
  // Already below the target with no added mass: negative, like prAddedMassForFb.
  assert.ok(prGroupsAddedMassForFb(45, [{ pr: PR_A, count: 1, addedMass_g: 0 }, { pr: PR_A, count: 1, addedMass_g: 500 }], 60) < 0);
});
