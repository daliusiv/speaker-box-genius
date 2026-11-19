import { test } from "node:test";
import assert from "node:assert/strict";
import { simulate, type Motion } from "../src/simulate.ts";
import { driverModel, passiveRadiatorModel, type EnclosureInput, type PassiveRadiatorInput } from "../src/model.ts";
import { STANDARD_AIR } from "../src/constants.ts";

/** Cone and passive-radiator velocity, acceleration and force (M·a), from the solved excursion. */

const air = STANDARD_AIR;
const DRV = { fs: 30, qms: 5.2, qes: 0.4, vas_l: 50, re: 3.4, sd_cm2: 330, le_mh: 0, xmax_mm: 12, pe_w: 250 };
const LOSSLESS = { ql: Infinity, qa: Infinity, qp: Infinity };
const FREQS = [10, 15, 20, 30, 45, 60, 100, 200, 400];
const OPTS = { power: 100, frequencies: FREQS, rg: 0 };
const PR_A: PassiveRadiatorInput = { mms_g: 150, sd_cm2: 330, xmax_mm: 15, qms: 10, fs: 18 };
const PR_B: PassiveRadiatorInput = { mms_g: 90, sd_cm2: 220, xmax_mm: 11, qms: 8, vas_l: 60 };
const mms = driverModel(DRV, air).mms;

const rel = (a: number, b: number) => Math.abs(a - b) / Math.max(Math.abs(b), 1e-300);

/** v = ω·x, a = ω²·x, F = M·a at every frequency, against the excursion (mm). */
function assertMotion(freq: Float64Array, xMm: Float64Array, m: Motion, mass: number, what: string) {
  for (let i = 0; i < freq.length; i++) {
    const w = 2 * Math.PI * freq[i]!;
    const x = xMm[i]! / 1000;
    if (x === 0) continue;
    assert.ok(rel(m.velocity_ms[i]!, w * x) < 1e-12, `${what} velocity @ ${freq[i]} Hz`);
    assert.ok(rel(m.accel_ms2[i]!, w * w * x) < 1e-12, `${what} acceleration @ ${freq[i]} Hz`);
    assert.ok(rel(m.forceN[i]!, mass * w * w * x) < 1e-12, `${what} force @ ${freq[i]} Hz`);
  }
  assert.ok(rel(m.mass_kg, mass) < 1e-12, `${what} mass`);
}

const BOXES: [string, EnclosureInput][] = [
  ["sealed", { kind: "sealed", vb_l: 40 }],
  ["vented", { kind: "vented", vb_l: 60, port: { shape: "round", diameter_cm: 7.5, length_cm: 21.5 } }],
  ["passive radiator", { kind: "passive-radiator", vb_l: 50, pr: PR_A, prCount: 2, addedMass_g: 50 }],
  ["mixed PRs", { kind: "passive-radiator", vb_l: 50, pr: PR_A, prCount: 1, addedMass_g: 40, extraPrs: [{ pr: PR_B, count: 2, addedMass_g: 10 }] }],
  [
    "bandpass with PRs",
    { kind: "bandpass", rear: { vb_l: 20, prs: [{ pr: PR_B, count: 1 }], ...LOSSLESS }, front: { vb_l: 25, prs: [{ pr: PR_A, count: 1, addedMass_g: 30 }], ...LOSSLESS }, qicl: Infinity },
  ],
  ["infinite baffle", { kind: "infinite-baffle" }],
  ["line", { kind: "line", driverAt_cm: 40, segments: [{ length_cm: 200, startArea_cm2: 500, endArea_cm2: 500 }] }],
];

for (const [name, box] of BOXES) {
  test(`${name}: cone velocity, acceleration and force follow from the excursion (Mms)`, () => {
    const r = simulate(DRV, box, OPTS);
    assertMotion(r.freq, r.excursionMm, r.coneMotion, mms, "cone");
  });
}

test("every PR group gets its own motion, with its own Mmp (added mass included)", () => {
  const mixed = simulate(DRV, BOXES[3]![1], OPTS);
  const groups = mixed.prGroups!;
  assert.equal(groups.length, 2);
  assertMotion(mixed.freq, groups[0]!.excursionMm, groups[0]!.motion, passiveRadiatorModel(PR_A, 40, air).mmp, "PR A");
  assertMotion(mixed.freq, groups[1]!.excursionMm, groups[1]!.motion, passiveRadiatorModel(PR_B, 10, air).mmp, "PR B");

  const bp = simulate(DRV, BOXES[4]![1], OPTS);
  const front = bp.prGroups!.find((g) => g.chamber === "front")!;
  const rear = bp.prGroups!.find((g) => g.chamber === "rear")!;
  assertMotion(bp.freq, front.excursionMm, front.motion, passiveRadiatorModel(PR_A, 30, air).mmp, "bandpass front PR");
  assertMotion(bp.freq, rear.excursionMm, rear.motion, passiveRadiatorModel(PR_B, 0, air).mmp, "bandpass rear PR");
});

test("isobaric: the force is the pair's (both cones move together)", () => {
  const r = simulate(DRV, { kind: "sealed", vb_l: 40 }, { ...OPTS, isobaric: { coils: "parallel" } });
  assertMotion(r.freq, r.excursionMm, r.coneMotion, 2 * mms, "isobaric pair");
});

test("sealed box: excursion, velocity, acceleration and force equal the closed-form mechanical circuit", () => {
  // No box losses, no Le, no source resistance: F = Bl·V/Re drives Rms + Bl²/Re, Mms and Cms in series with the box spring.
  const vb = 40;
  const r = simulate(DRV, { kind: "sealed", vb_l: vb, ...LOSSLESS }, OPTS);
  const d = driverModel(DRV, air);
  const sd = DRV.sd_cm2 / 1e4;
  const cab = vb / 1000 / (air.rho * air.c * air.c * sd * sd);
  const fPeak = (d.bl * Math.sqrt(OPTS.power * DRV.re) * Math.SQRT2) / DRV.re;
  for (let i = 0; i < FREQS.length; i++) {
    const w = 2 * Math.PI * FREQS[i]!;
    const z = Math.hypot(d.rms + (d.bl * d.bl) / DRV.re, w * d.mms - (1 / d.cms + 1 / cab) / w);
    const x = fPeak / (w * z);
    assert.ok(rel(r.excursionMm[i]! / 1000, x) < 1e-12, `x @ ${FREQS[i]} Hz`);
    assert.ok(rel(r.coneMotion.velocity_ms[i]!, w * x) < 1e-12, `v @ ${FREQS[i]} Hz`);
    assert.ok(rel(r.coneMotion.accel_ms2[i]!, w * w * x) < 1e-12, `a @ ${FREQS[i]} Hz`);
    assert.ok(rel(r.coneMotion.forceN[i]!, d.mms * w * w * x) < 1e-12, `F @ ${FREQS[i]} Hz`);
  }
  // Mass-controlled band: the moving mass takes the whole motor force, Bl·V/Re.
  assert.ok(rel(r.coneMotion.forceN[FREQS.length - 1]!, fPeak) < 0.01);
});

test("passive radiator: its motion balances the box pressure on it (Sdp·P = |Zmp|·v)", () => {
  const r = simulate(DRV, { kind: "passive-radiator", vb_l: 50, pr: PR_A, prCount: 2, addedMass_g: 50, ...LOSSLESS }, OPTS);
  const m = passiveRadiatorModel(PR_A, 50, air);
  const g = r.prGroups![0]!;
  for (let i = 0; i < FREQS.length; i++) {
    const w = 2 * Math.PI * FREQS[i]!;
    const zmp = Math.hypot(m.rmp, w * m.mmp - 1 / (w * m.cmp));
    assert.ok(rel(zmp * g.motion.velocity_ms[i]!, m.sd * r.boxPressurePa![i]!) < 1e-9, `@ ${FREQS[i]} Hz`);
  }
});
