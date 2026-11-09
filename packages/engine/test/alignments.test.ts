import { test } from "node:test";
import assert from "node:assert/strict";
import { B4_QTS, keeleAlignment, qb3Alignment, sealedVolumeForAlignment } from "../src/alignments.ts";
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
    near(simulate(d, { kind: "sealed", vb_l: vb, ...LOSSLESS }).summary.qtc!, target, 1e-9);
  }
  assert.equal(sealedVolumeForAlignment({ ...d, qes: 0.9 }, 0.5), null); // Qts already above 0.5
  // Two drivers need twice the box for the same Qtc
  near(sealedVolumeForAlignment(d, 0.707, 2)!, 2 * sealedVolumeForAlignment(d, 0.707)!, 1e-9);
});

test("sealed alignment sized like WinISD's closed-box wizard (WinISD 0.7.0.950, 9 Nov 2026)", () => {
  // Fs 30 Hz, Qms 5, Vas 50 L, Re 6 Ω; WinISD's Vb as it displays it (two decimals).
  const cases: [number, number, number][] = [
    [0.2, 0.707, 4.48],
    [0.4, 0.577, 48.31],
    [0.4, 0.707, 24.32],
    [0.4, 1.0, 9.78],
    [0.6, 0.8, 66.85],
  ];
  for (const [q, qtc, vb] of cases) {
    const d = { fs: 30, qms: 5, qes: 1 / (1 / q - 1 / 5), vas_l: 50, re: 6, style: "winisd" as const };
    near(sealedVolumeForAlignment(d, qtc)!, vb, 0.006 + vb * 0.0004, `Qts ${q} Qtc ${qtc}`);
  }
  // Bigger than the textbook box (Rg and the box's absorption both lower the Q to start from).
  const d = { fs: 30, qms: 5, qes: 0.4348, vas_l: 50, re: 6 };
  assert.ok(sealedVolumeForAlignment({ ...d, style: "winisd" }, 0.707)! > sealedVolumeForAlignment(d, 0.707)! * 1.02);
});

test("sealed Qtc counts Rg and the box's absorption, as WinISD shows it with its leak off", () => {
  // WinISD 0.7: Fs 30, Qms 5, Qts 0.40, Vas 50 L, Re 6, Rg 0.1, Ql "none".
  const d = { fs: 30, qms: 5, qes: 1 / (1 / 0.4 - 1 / 5), vas_l: 50, re: 6, sd_cm2: 220 };
  const air = WINISD_AIR;
  const q = (vb: number, qa: number) => simulate(d, { kind: "sealed", vb_l: vb, ql: Infinity, qa }, { rg: 0.1, air }).summary;
  near(q(24.32, 100).qtc!, 0.705, 0.0006, "Qa 100");
  near(q(24.32, Infinity).qtc!, 0.710, 0.0006, "lossless");
  near(q(48.31, 100).qtc!, 0.576, 0.0006, "Qa 100");
  near(q(48.31, Infinity).qtc!, 0.579, 0.0006, "lossless");
  near(q(24.32, 100).fc!, 52.44, 0.006, "Fsc");
  near(q(48.31, 100).fc!, 42.8, 0.006, "Fsc");
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

test("Keele alignment for a higher-Qts driver: near flat, F3 close to Keele's estimate", () => {
  // Qts 0.45: outside QB3/B4, inside Keele's range.
  const d = { fs: 25, qms: 4, qes: 0.507, vas_l: 120 };
  const q = qts(d.qms, d.qes);
  assert.equal(qb3Alignment(d), null);
  const a = keeleAlignment(d)!;
  near(a.vb_l, 15 * 120 * q ** 2.87, 1e-9);
  const len = portLengthForFb(a.vb_l, port, a.fb);
  const r = simulate(
    { ...d, re: 3.5, sd_cm2: 500 },
    { kind: "vented", vb_l: a.vb_l, port: { ...port, length_cm: len }, ...LOSSLESS },
    { fMin: 10, fMax: 400, points: 400 },
  );
  const ref = r.summary.referenceSpl;
  // No peaking above the passband level, and F3 within 15 % of Keele's estimate.
  let peak = -Infinity;
  for (let i = 0; i < r.freq.length; i++) if (r.freq[i]! > a.fb) peak = Math.max(peak, r.spl[i]! - ref);
  assert.ok(peak < 1.5, `peak ${peak.toFixed(2)} dB`);
  const f3Keele = 0.26 * d.fs * q ** -1.4;
  assert.ok(Math.abs(r.summary.f3! / f3Keele - 1) < 0.15, `F3 ${r.summary.f3} vs ${f3Keele}`);
  // Outside its range there is no answer.
  assert.equal(keeleAlignment({ ...d, qes: 2 }), null);
});

test("QB3 with box leakage (Small): the simulated response is the lossy maximally flat one", () => {
  for (const qts of [0.2, 0.29, 0.35, 0.38]) {
    for (const ql of [5, 10, 30]) {
      const qes = (qts * 5) / (5 - qts);
      const t = { fs: 30, qms: 5, qes, vas_l: 50, re: 6, sd_cm2: 330, le_mh: 0 };
      const a = qb3Alignment({ ...t, ql })!;
      assert.ok(a, `Qts ${qts}, QL ${ql}`);
      const port = { shape: "round" as const, diameter_cm: 8, length_cm: 10 };
      port.length_cm = portLengthForFb(a.vb_l, port, a.fb);
      const r = simulate(t, { kind: "vented", vb_l: a.vb_l, port, ql, qa: Infinity, qp: Infinity }, { fMin: 5, fMax: 500, points: 60, leakage: "radiates" });
      // |G|² = ω⁸ / (ω⁸ + C·ω² + 1): the ω⁶ and ω⁴ terms are zero, as in the lossless QB3.
      // Small's model counts the leaked air as output: the app's default ("radiates").
      const h = a.fb / t.fs;
      const a1 = (ql + h * qts) / (Math.sqrt(h) * ql * qts);
      const a2 = (h + (t.vas_l / a.vb_l + 1 + h * h) * ql * qts) / (h * ql * qts);
      const a3 = (h * ql + qts) / (Math.sqrt(h) * ql * qts);
      assert.ok(Math.abs(a1 * a1 - 2 * a2) < 1e-6 && Math.abs(a2 * a2 + 2 - 2 * a1 * a3) < 1e-6, "ω⁶ and ω⁴ terms zero");
      for (let i = 0; i < r.freq.length; i++) {
        const w = r.freq[i]! / Math.sqrt(t.fs * a.fb);
        const ideal = 10 * Math.log10(w ** 8 / (w ** 8 + (a3 * a3 - 2 * a2) * w * w + 1));
        assert.ok(Math.abs(r.spl[i]! - r.summary.referenceSpl - ideal) < 0.01, `Qts ${qts} QL ${ql} at ${r.freq[i]!.toFixed(1)} Hz: ${(r.spl[i]! - r.summary.referenceSpl).toFixed(3)} vs ${ideal.toFixed(3)}`);
      }
    }
  }
});

test("QB3 with leakage: past B4 (it would peak) there's none, and Keele's alignment takes over", () => {
  const qes = (0.45 * 5) / (5 - 0.45);
  assert.equal(qb3Alignment({ fs: 30, qms: 5, qes, vas_l: 50, ql: 10 }), null);
  // No leakage given: Thiele's lossless table, as before.
  const lossless = qb3Alignment({ fs: 38.36, qms: 1.66, qes: 0.35, vas_l: 18.7 })!;
  assert.ok(Math.abs(lossless.vb_l - 5.58) < 0.01 && Math.abs(lossless.fb - 49.0) < 0.05);
});
