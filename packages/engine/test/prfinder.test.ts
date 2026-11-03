import { test } from "node:test";
import assert from "node:assert/strict";
import { findPassiveRadiators, type PrCandidate } from "../src/prfinder.ts";
import { prFb } from "../src/model.ts";
import { simulate } from "../src/simulate.ts";

// A 10" subwoofer-like driver.
const DRV = { fs: 30, qms: 5.2, qes: 0.4, vas_l: 50, re: 3.4, sd_cm2: 330, xmax_mm: 12, pe_w: 250 };
const pr = (name: string, mms_g: number, sd_cm2: number, xmax_mm: number, vas_l: number): PrCandidate => ({
  id: name,
  name,
  pr: { mms_g, sd_cm2, xmax_mm, vas_l, qms: 6 },
});
const SMALL = pr("small", 15, 130, 6, 10); // a 6.5"-class PR: far too little displacement
const MATCH = pr("match", 90, 350, 15, 80); // a 10"-class PR with more travel than the driver
const BIG = pr("big", 300, 1000, 20, 300); // a 15"-class PR

test("added mass hits the target tuning, and results that pass come first", () => {
  const res = findPassiveRadiators(DRV, [SMALL, MATCH, BIG], { vb_l: 50, targetFb: 28 });
  assert.equal(res.length, 9);
  for (const r of res.filter((x) => x.ok)) {
    const c = [SMALL, MATCH, BIG].find((x) => x.id === r.id)!;
    assert.ok(Math.abs(prFb(50, c.pr, r.count, r.addedMass_g) - 28) < 1e-6, `${r.id} × ${r.count}`);
  }
  const firstBad = res.findIndex((r) => !r.ok);
  assert.ok(res.slice(firstBad).every((r) => !r.ok), "every pass ranks above every fail");
  assert.ok(res[0]!.ok);
});

test("a PR with too little displacement is rejected for running out of travel first", () => {
  const res = findPassiveRadiators(DRV, [SMALL], { vb_l: 50, targetFb: 28, counts: [1] });
  assert.equal(res[0]!.ok, false);
  assert.ok(res[0]!.prUse > 1);
  assert.match(res[0]!.reason!, /runs out of travel first/);
});

test("prUse is the PR travel used when the driver reaches Xmax, checked by simulating at that drive", () => {
  const [r] = findPassiveRadiators(DRV, [MATCH], { vb_l: 50, targetFb: 28, counts: [2] });
  // Find the power at which the driver just reaches Xmax above 15 Hz, then read the PR excursion there.
  const box = { kind: "passive-radiator" as const, vb_l: 50, pr: MATCH.pr, prCount: 2, addedMass_g: r!.addedMass_g };
  const at1 = simulate(DRV, box, { power: 1 });
  let peak = 0;
  for (let i = 0; i < at1.freq.length; i++) if (at1.freq[i]! >= 15) peak = Math.max(peak, at1.excursionMm[i]!);
  const p = (DRV.xmax_mm / peak) ** 2;
  const atXmax = simulate(DRV, box, { power: p });
  let xd = 0;
  let xp = 0;
  for (let i = 0; i < atXmax.freq.length; i++) {
    if (atXmax.freq[i]! < 15) continue;
    xd = Math.max(xd, atXmax.excursionMm[i]!);
    xp = Math.max(xp, atXmax.prExcursionMm![i]!);
  }
  assert.ok(Math.abs(xd - DRV.xmax_mm) < 1e-6);
  assert.ok(Math.abs(r!.prUse - xp / MATCH.pr.xmax_mm!) < 1e-6, `${r!.prUse} vs ${xp / MATCH.pr.xmax_mm!}`);
});

test("too heavy for the box, or needing too much added mass, is rejected with the reason", () => {
  // A heavy, soft PR in a big box tunes below 40 Hz with no mass at all.
  const [low] = findPassiveRadiators(DRV, [BIG], { vb_l: 100, targetFb: 40, counts: [1] });
  assert.equal(low!.ok, false);
  assert.match(low!.reason!, /no added mass/);
  // A light PR asked to tune very low needs many times its own mass.
  const [heavy] = findPassiveRadiators(DRV, [SMALL], { vb_l: 20, targetFb: 15, counts: [4] });
  assert.equal(heavy!.ok, false);
  assert.match(heavy!.reason!, /moving mass/);
});

test("fewer PRs rank first among those that pass", () => {
  const res = findPassiveRadiators(DRV, [MATCH, BIG], { vb_l: 50, targetFb: 28 }).filter((r) => r.ok);
  assert.ok(res.length >= 2);
  for (let i = 1; i < res.length; i++) assert.ok(res[i]!.count >= res[i - 1]!.count || res[i]!.score >= res[i - 1]!.score);
});

test("a PR too big for any face of the box is rejected; a known frame size is used when given", async () => {
  const { largestPrFor, prOutsideDiameter } = await import("../src/prfinder.ts");
  // 15"-class PR (≈ 47 cm frame) on a 16 L box (≈ 27 cm faces): no.
  const [r] = findPassiveRadiators(DRV, [BIG], { vb_l: 16, targetFb: 40, counts: [1] });
  assert.ok(prOutsideDiameter(BIG) > largestPrFor(16));
  assert.equal(r!.ok, false);
  assert.match(r!.reason!, /too big for a face of a 16 L box/);
  // The same PR declared smaller (a given frame size) fits the size check.
  const [r2] = findPassiveRadiators(DRV, [{ ...BIG, od_cm: 20 }], { vb_l: 16, targetFb: 40, counts: [1] });
  assert.doesNotMatch(r2!.reason ?? "", /too big/);
});
