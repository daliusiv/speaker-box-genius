import { test } from "node:test";
import assert from "node:assert/strict";
import { C, RHO } from "../src/constants.ts";
import {
  coilHeatFactor,
  portAcousticMass,
  portArea,
  portLengthForFb,
  prAddedMassForFb,
  prFb,
  ventedFb,
  type DriverInput,
  type PortInput,
} from "../src/model.ts";
import { simulate } from "../src/simulate.ts";
import { qts } from "../src/ts.ts";

/** Fictional 10" driver (same as docs/examples). Le = 0 so the textbook formulas apply exactly. */
const DRIVER: DriverInput = { fs: 30, qms: 5.2, qes: 0.4, vas_l: 50, re: 3.4, sd_cm2: 330, xmax_mm: 12 };
const LOSSLESS = { ql: Infinity, qa: Infinity, qp: Infinity };

const near = (a: number, b: number, tol: number, what = "") =>
  assert.ok(Math.abs(a - b) <= tol, `${what} ${a} vs ${b} (tol ${tol})`);

/** 20·log10|H(jω)| for a polynomial ratio in s, coefficients highest power first. */
function dbOf(num: number[], den: number[], s: number): number {
  const ev = (c: number[]) => {
    let re = 0;
    let im = 0;
    for (const k of c) {
      // (re + j·im)·(j·s) + k
      [re, im] = [-im * s + k, re * s];
    }
    return Math.hypot(re, im);
  };
  return 20 * Math.log10(ev(num) / ev(den));
}

/** Index of the first local minimum (the excursion dip at the tuning frequency). */
function firstDip(a: Float64Array) {
  for (let k = 1; k < a.length - 1; k++) if (a[k]! < a[k - 1]! && a[k]! <= a[k + 1]!) return k;
  throw new Error("no local minimum");
}

test("sealed: matches the 2nd-order high-pass H(s) = s²/(s² + s/Qtc + 1)", () => {
  const r = simulate(DRIVER, { kind: "sealed", vb_l: 40, ...LOSSLESS });
  const alpha = DRIVER.vas_l / 40;
  const fc = DRIVER.fs * Math.sqrt(1 + alpha);
  const q = qts(DRIVER.qms, DRIVER.qes) * Math.sqrt(1 + alpha);
  near(r.summary.fc!, fc, 1e-9, "fc");
  near(r.summary.qtc!, q, 1e-9, "qtc");
  for (let i = 0; i < r.freq.length; i++) {
    const expected = dbOf([1, 0, 0], [1, 1 / q, 1], r.freq[i]! / fc);
    near(r.spl[i]! - r.summary.referenceSpl, expected, 0.001, `at ${r.freq[i]!.toFixed(1)} Hz`);
  }
});

test("sealed: f3 matches the closed-form −3 dB frequency", () => {
  const r = simulate(DRIVER, { kind: "sealed", vb_l: 40, ...LOSSLESS }, { points: 2000 });
  const q = r.summary.qtc!;
  const a = 1 / (q * q) - 2;
  const f3 = r.summary.fc! * Math.sqrt((a + Math.sqrt(a * a + 4)) / 2);
  near(r.summary.f3!, f3, f3 * 0.002, "f3");
});

test("vented: matches Small's 4th-order alignment function (lossless box)", () => {
  const vb = 60;
  const port: PortInput = { shape: "round", diameter_cm: 10, length_cm: 30 };
  const r = simulate(DRIVER, { kind: "vented", vb_l: vb, port, ...LOSSLESS });
  const fb = ventedFb(vb, port);
  near(r.summary.fb!, fb, 1e-9, "fb");

  const h = fb / DRIVER.fs;
  const alpha = DRIVER.vas_l / vb;
  const Q = qts(DRIVER.qms, DRIVER.qes);
  const a1 = 1 / (Q * Math.sqrt(h));
  const a2 = (alpha + 1 + h * h) / h;
  const a3 = Math.sqrt(h) / Q;
  const f0 = Math.sqrt(DRIVER.fs * fb);
  for (let i = 0; i < r.freq.length; i++) {
    const expected = dbOf([1, 0, 0, 0, 0], [1, a1, a2, a3, 1], r.freq[i]! / f0);
    near(r.spl[i]! - r.summary.referenceSpl, expected, 0.001, `at ${r.freq[i]!.toFixed(1)} Hz`);
  }
});

test("reference SPL equals 1 W efficiency formula (η0, half space)", () => {
  const r = simulate(DRIVER, { kind: "sealed", vb_l: 40 });
  const eta0 = (4 * Math.PI ** 2 * DRIVER.fs ** 3 * (DRIVER.vas_l / 1000)) / (C ** 3 * DRIVER.qes);
  // Intensity of 1 W·η0 over a hemisphere at 1 m, as SPL: I = p²/(ρc)
  const p2 = (eta0 * RHO * C) / (2 * Math.PI);
  near(r.summary.referenceSpl, 10 * Math.log10(p2 / 4e-10), 0.001, "reference SPL");
});

test("impedance peak in a huge box is Re·(1 + Qms/Qes) at fs", () => {
  const r = simulate(DRIVER, { kind: "sealed", vb_l: 1e9, ...LOSSLESS }, { fMin: 25, fMax: 35, points: 4001 });
  let i = 0;
  for (let k = 1; k < r.impedanceOhm.length; k++) if (r.impedanceOhm[k]! > r.impedanceOhm[i]!) i = k;
  near(r.freq[i]!, DRIVER.fs, 0.01, "peak frequency");
  near(r.impedanceOhm[i]!, DRIVER.re * (1 + DRIVER.qms / DRIVER.qes), 0.01, "peak |Z|");
});

test("vented: driver excursion is smallest at Fb", () => {
  const port: PortInput = { shape: "round", diameter_cm: 10, length_cm: 30 };
  const r = simulate(DRIVER, { kind: "vented", vb_l: 60, port }, { fMin: 10, fMax: 100, points: 2000 });
  const i = firstDip(r.excursionMm);
  near(r.freq[i]!, r.summary.fb!, r.summary.fb! * 0.03, "excursion null");
});

test("vented: far below Fb the port moves the same air as the cone", () => {
  const port: PortInput = { shape: "round", diameter_cm: 10, length_cm: 30 };
  const r = simulate(DRIVER, { kind: "vented", vb_l: 60, port, ...LOSSLESS }, { fMin: 1, fMax: 2, points: 2 });
  const w = 2 * Math.PI * r.freq[0]!;
  const coneFlow = (r.excursionMm[0]! / 1000) * w * (DRIVER.sd_cm2 / 1e4);
  const portFlow = r.portVelocity![0]! * portArea(port);
  near(portFlow / coneFlow, 1, 0.01, "flow ratio");
});

test("passive radiator with a very soft suspension behaves like a port of the same mass", () => {
  const port: PortInput = { shape: "round", diameter_cm: 10, length_cm: 30 };
  const sp = portArea(port);
  const mms_g = portAcousticMass(port) * sp * sp * 1000;
  const pr = { mms_g, sd_cm2: sp * 1e4, cms_mm_per_n: 1e9, qms: Infinity };
  const a = simulate(DRIVER, { kind: "vented", vb_l: 60, port, ...LOSSLESS });
  const b = simulate(DRIVER, { kind: "passive-radiator", vb_l: 60, pr, ...LOSSLESS });
  near(b.summary.fb!, a.summary.fb!, 1e-3, "fb");
  for (let i = 0; i < a.freq.length; i++) near(b.spl[i]!, a.spl[i]!, 0.001, `at ${a.freq[i]!.toFixed(1)} Hz`);
});

test("passive radiator: driver excursion is smallest at the PR tuning", () => {
  const pr = { mms_g: 122, sd_cm2: 330, vas_l: 80, qms: 6, xmax_mm: 18 };
  const box = { kind: "passive-radiator" as const, vb_l: 50, pr, prCount: 2, addedMass_g: 100 };
  const r = simulate(DRIVER, box, { fMin: 5, fMax: 100, points: 3000 });
  near(r.summary.fb!, prFb(50, pr, 2, 100), 1e-9);
  const i = firstDip(r.excursionMm);
  near(r.freq[i]!, r.summary.fb!, r.summary.fb! * 0.03, "excursion null");
  assert.ok(r.prExcursionMm && r.prExcursionMm.every((x) => x > 0));
});

test("tuning helpers invert each other", () => {
  const port: PortInput = { shape: "slot", width_cm: 20, height_cm: 5, length_cm: 0 };
  const len = portLengthForFb(60, port, 28, 1);
  near(ventedFb(60, { ...port, length_cm: len }), 28, 1e-9, "port length → fb");

  const pr = { mms_g: 122, sd_cm2: 330, vas_l: 80 };
  const add = prAddedMassForFb(50, pr, 22, 2);
  near(prFb(50, pr, 2, add), 22, 1e-9, "added mass → fb");
});

test("max power: at the xmax-limited power, excursion equals Xmax", () => {
  const box = { kind: "sealed" as const, vb_l: 40 };
  const r = simulate(DRIVER, box, { fMin: 20, fMax: 20, points: 1 });
  assert.equal(r.limitedBy[0], "xmax");
  const again = simulate(DRIVER, box, { fMin: 20, fMax: 20, points: 1, power: r.maxPowerW[0]! });
  near(again.excursionMm[0]!, DRIVER.xmax_mm!, 1e-9, "excursion at max power");
  near(again.spl[0]!, r.maxSpl[0]!, 1e-9, "max SPL");
});

test("two drivers in twice the box at the same voltage: same shape, +6 dB", () => {
  const one = simulate(DRIVER, { kind: "sealed", vb_l: 40 }, { convention: "volts", power: 2.83 });
  const two = simulate(DRIVER, { kind: "sealed", vb_l: 80 }, { convention: "volts", power: 2.83, drivers: 2 });
  for (let i = 0; i < one.freq.length; i++) near(two.spl[i]! - one.spl[i]!, 20 * Math.log10(2), 1e-6);
  for (let i = 0; i < one.freq.length; i++) near(two.excursionMm[i]!, one.excursionMm[i]!, 1e-9);
});

test("power scaling: 4× power is +6 dB and 2× excursion", () => {
  const box = { kind: "sealed" as const, vb_l: 40 };
  const a = simulate(DRIVER, box, { power: 25 });
  const b = simulate(DRIVER, box, { power: 100 });
  near(b.spl[50]! - a.spl[50]!, 10 * Math.log10(4), 1e-9);
  near(b.excursionMm[50]! / a.excursionMm[50]!, 2, 1e-9);
});

test("driving by voltage gives the same limits and maximum SPL as the equivalent power", () => {
  const box = { kind: "vented" as const, vb_l: 50, port: { shape: "round" as const, diameter_cm: 7, length_cm: 25 } };
  const drv = { ...DRIVER, xmax_mm: 8, pe_w: 150 };
  for (const [drivers, wiring] of [[1, "parallel"], [2, "parallel"], [2, "series"]] as const) {
    const watts = 40;
    const re = wiring === "parallel" ? drv.re / drivers : drv.re * drivers;
    const a = simulate(drv, box, { power: watts, drivers, wiring });
    const b = simulate(drv, box, { convention: "volts", power: Math.sqrt(watts * re), drivers, wiring });
    for (let i = 0; i < a.freq.length; i++) {
      assert.ok(Math.abs(a.spl[i]! - b.spl[i]!) < 1e-9);
      assert.ok(Math.abs(a.maxSpl[i]! - b.maxSpl[i]!) < 1e-9, `maxSpl at ${a.freq[i]} Hz`);
      assert.ok(Math.abs(a.maxPowerW[i]! / b.maxPowerW[i]! - 1) < 1e-9);
      assert.equal(a.limitedBy[i], b.limitedBy[i]);
    }
  }
});

// ---------------------------------------------------------------------------
// Hot voice coil
// ---------------------------------------------------------------------------

test("hot voice coil: Re up 0.393 %/°C, output down towards the Re ratio above the bass, Q up, impedance up", () => {
  const D = { fs: 30, qms: 4, qes: 0.4, vas_l: 50, re: 6, sd_cm2: 330, xmax_mm: 8, pe_w: 300 };
  const box = { kind: "sealed" as const, vb_l: 30 };
  const o = { power: 100, fMin: 10, fMax: 400, points: 300 };
  const k = coilHeatFactor(100);
  assert.ok(Math.abs(k - 1.3144) < 1e-4);
  assert.equal(coilHeatFactor(20), 1);
  assert.equal(coilHeatFactor(undefined), 1);
  const c = simulate(D, box, o);
  const h = simulate(D, box, { ...o, coilTemp_C: 100 });
  const at = (r: typeof c, f: number) => r.freq.findIndex((x) => x >= f);
  const i = at(c, 300);
  const drop = c.spl[i]! - h.spl[i]!;
  // Approaches 20·log(Re ratio) as the motor's damping fades (still 0.13 dB short at 10 × fs with Qes 0.4).
  assert.ok(drop > 20 * Math.log10(k) - 0.15 && drop <= 20 * Math.log10(k) + 1e-6, `drop ${drop.toFixed(3)} dB`);
  // In the bass the drop is smaller: the higher Q props the response up near resonance.
  const j = at(c, 45);
  assert.ok(c.spl[j]! - h.spl[j]! < drop - 0.3, "less loss near resonance");
  assert.ok(Math.abs(Math.min(...h.impedanceOhm) / Math.min(...c.impedanceOhm) - k) < 0.02, "impedance minimum rises with Re");
  // Same watts on the dial, less taken by the hot coil: the thermal limit allows more drive.
  const mi = at(c, 300);
  assert.ok(h.maxSpl[mi]! >= c.maxSpl[mi]! - 20 * Math.log10(k) - 0.01);
});
