import { test } from "node:test";
import assert from "node:assert/strict";
import { B4_QTS, qb3Alignment, sealedVolumeForAlignment } from "../src/alignments.ts";
import { WINISD_AIR } from "../src/constants.ts";
import { portLengthForFb } from "../src/model.ts";
import { simulate } from "../src/simulate.ts";
import { qts } from "../src/ts.ts";

const near = (a: number, b: number, tol: number, what = "") =>
  assert.ok(Math.abs(a - b) <= tol, `${what} ${a} vs ${b} (tol ${tol})`);
const LOSSLESS = { ql: Infinity, qa: Infinity, qp: Infinity };
const port = { shape: "round" as const, diameter_cm: 10, length_cm: 0 };

test("sealed alignment hits the requested Qtc", () => {
  const d = { fs: 30, qms: 5.2, qes: 0.4, vas_l: 50, re: 3.4, sd_cm2: 330 };
  for (const target of [0.5, 0.577, 0.707]) {
    const vb = sealedVolumeForAlignment(d, target)!;
    near(simulate(d, { kind: "sealed", vb_l: vb }).summary.qtc!, target, 1e-9);
  }
  assert.equal(sealedVolumeForAlignment({ ...d, qes: 0.9 }, 0.5), null); // Qts already above 0.5
  // Two drivers need twice the box for the same Qtc
  near(sealedVolumeForAlignment(d, 0.707, 2)!, 2 * sealedVolumeForAlignment(d, 0.707)!, 1e-9);
});

test("B4: at Qts = 0.383, QB3 is the 4th-order Butterworth (h = 1, α = √2, −3 dB at fs)", () => {
  // Choose Qms, Qes so Qts = B4_QTS exactly
  const qms = 8;
  const qes = (B4_QTS * qms) / (qms - B4_QTS);
  const d = { fs: 30, qms, qes, vas_l: 50, re: 4, sd_cm2: 330 };
  near(qts(qms, qes), 0.3827, 0.0001);
  const a = qb3Alignment(d)!;
  assert.equal(a.name, "B4");
  near(a.fb, 30, 1e-6, "fb");
  near(50 / a.vb_l, Math.SQRT2, 1e-6, "alpha");
});

test("QB3: simulated lossless response has |G|² = ω⁸/(ω⁸ + B·ω² + 1)", () => {
  const d = { fs: 28, qms: 6, qes: 0.33, vas_l: 80, re: 3.5, sd_cm2: 500 };
  const q = qts(d.qms, d.qes);
  const a = qb3Alignment(d)!;
  assert.equal(a.name, "QB3");
  // Port length that gives exactly a.fb, via the simulator's own helper
  const length_cm = portLengthForFb(a.vb_l, port, a.fb);
  const r = simulate(d, { kind: "vented", vb_l: a.vb_l, port: { ...port, length_cm }, ...LOSSLESS });
  near(r.summary.fb!, a.fb, 1e-6, "fb");
  const h = a.fb / d.fs;
  const alpha = d.vas_l / a.vb_l;
  const a2 = (alpha + 1 + h * h) / h;
  const a3 = Math.sqrt(h) / q;
  const B = a3 * a3 - 2 * a2;
  const f0 = Math.sqrt(d.fs * a.fb);
  for (let i = 0; i < r.freq.length; i += 10) {
    const w = r.freq[i]! / f0;
    const expected = 10 * Math.log10(w ** 8 / (w ** 8 + B * w ** 2 + 1));
    near(r.spl[i]! - r.summary.referenceSpl, expected, 0.001, `at ${r.freq[i]!.toFixed(1)} Hz`);
  }
});

test("QB3 is refused for high-Qts drivers", () => {
  assert.equal(qb3Alignment({ fs: 30, qms: 4, qes: 0.6, vas_l: 50 }), null);
});

test("WinISD air constants change results only slightly", () => {
  const d = { fs: 30, qms: 5.2, qes: 0.4, vas_l: 50, re: 3.4, sd_cm2: 330 };
  const box = { kind: "vented" as const, vb_l: 60, port: { shape: "round" as const, diameter_cm: 10, length_cm: 30 } };
  const a = simulate(d, box);
  const b = simulate(d, box, { air: WINISD_AIR });
  assert.notEqual(a.summary.fb, b.summary.fb);
  near(b.summary.fb! / a.summary.fb!, 1, 0.005, "fb within 0.5%");
});
