import { test } from "node:test";
import assert from "node:assert/strict";
import { simulate } from "../src/simulate.ts";
import type { DriverInput } from "../src/model.ts";
import { STANDARD_AIR } from "../src/constants.ts";

// Infinite baffle (IB): the driver in a wall with its back to a space that isn't the room.
// An open rear is a driver on an infinite baffle (closed form below); a finite rear space is a
// sealed box whose leak is never heard.

// Dayton UMII18-22 (Fs 22, Qts 0.53), no coil inductance so the closed form is exact.
const DRV: DriverInput = { fs: 22, qms: 4.31, qes: 0.6, vas_l: 248, re: 4.2, sd_cm2: 1159, le_mh: 0, xmax_mm: 28, pe_w: 600 };
const air = STANDARD_AIR;
const TAU = 2 * Math.PI;
const freqs = [5, 10, 15, 20, 22, 25, 30, 40, 60, 80, 120, 200, 400];

/** A driver on an infinite baffle at 1 W into Re, 1 m, half space: Small's equivalent circuit solved by hand. */
function closedForm(f: number) {
  const sd = DRV.sd_cm2 / 1e4;
  const cms = DRV.vas_l / 1000 / (air.rho * air.c * air.c * sd * sd);
  const ws = TAU * DRV.fs;
  const mms = 1 / (ws * ws * cms);
  const bl = Math.sqrt((ws * mms * DRV.re) / DRV.qes);
  const rms = (ws * mms) / DRV.qms;
  const w = TAU * f;
  const xm = w * mms - 1 / (w * cms); // mechanical reactance
  const rTot = rms + (bl * bl) / DRV.re;
  const force = (bl * Math.sqrt(DRV.re)) / DRV.re; // Bl·V/Re, V = √(1 W · Re)
  const u = force / Math.hypot(rTot, xm); // cone velocity (rms)
  const p = (w * air.rho * sd * u) / (2 * Math.PI * 1);
  // |Z| = Re + Bl²/Zm
  const zmRe = rms / (rms * rms + xm * xm);
  const zmIm = -xm / (rms * rms + xm * xm);
  const z = Math.hypot(DRV.re + bl * bl * zmRe, bl * bl * zmIm);
  return { spl: 20 * Math.log10(p / 2e-5), x_mm: ((Math.SQRT2 * u) / w) * 1000, z };
}

test("infinite baffle, open rear: matches a driver on an infinite baffle (closed form)", () => {
  const r = simulate(DRV, { kind: "infinite-baffle" }, { frequencies: freqs, air });
  freqs.forEach((f, i) => {
    const c = closedForm(f);
    assert.ok(Math.abs(r.spl[i]! - c.spl) < 1e-6, `SPL at ${f} Hz: ${r.spl[i]} vs ${c.spl}`);
    assert.ok(Math.abs(r.excursionMm[i]! - c.x_mm) < 1e-6 * Math.max(1, c.x_mm), `excursion at ${f} Hz: ${r.excursionMm[i]} vs ${c.x_mm}`);
    assert.ok(Math.abs(r.impedanceOhm[i]! - c.z) < 1e-6, `|Z| at ${f} Hz: ${r.impedanceOhm[i]} vs ${c.z}`);
  });
  assert.equal(r.summary.fc, DRV.fs);
  assert.ok(Math.abs(r.summary.qtc! - (DRV.qms * DRV.qes) / (DRV.qms + DRV.qes)) < 1e-9);
  assert.ok(r.boxPressurePa!.every((p) => p === 0), "no box behind the cone");
});

test("sealed box of infinite volume = open infinite baffle (no NaN), and a huge lossless box tends to it", () => {
  const ib = simulate(DRV, { kind: "infinite-baffle" }, { air });
  const inf = simulate(DRV, { kind: "sealed", vb_l: Infinity }, { air });
  assert.deepEqual(Array.from(inf.spl), Array.from(ib.spl));
  assert.deepEqual(Array.from(inf.excursionMm), Array.from(ib.excursionMm));
  assert.ok(ib.spl.every(Number.isFinite));
  const huge = simulate(DRV, { kind: "sealed", vb_l: 1e7, ql: Infinity, qa: Infinity }, { air });
  ib.spl.forEach((s, i) => assert.ok(Math.abs(huge.spl[i]! - s) <= 0.01, `1e7 L at ${ib.freq[i]} Hz: ${huge.spl[i]} vs ${s}`));
});

test("infinite baffle, rear space: a sealed box of that volume whose leak isn't heard", () => {
  for (const rear of [{ rear_l: 500 }, { rear_l: 2000, ql: 3, qa: 20 }]) {
    const ib = simulate(DRV, { kind: "infinite-baffle", ...rear }, { air });
    const sealed = simulate(DRV, { kind: "sealed", vb_l: rear.rear_l, ql: rear.ql, qa: rear.qa }, { air, leakage: "absorbed" });
    ib.spl.forEach((s, i) => assert.ok(Math.abs(s - sealed.spl[i]!) < 1e-9, `${rear.rear_l} L at ${ib.freq[i]} Hz`));
    assert.deepEqual(ib.summary.fc, sealed.summary.fc);
    // Whatever the session's leakage setting, the rear space's leak stays out of the room.
    const loud = simulate(DRV, { kind: "infinite-baffle", ...rear }, { air, leakage: "radiates" });
    assert.deepEqual(Array.from(loud.spl), Array.from(ib.spl));
  }
});

test("infinite baffle: a big leaky rear space doesn't cancel the bass (a huge sealed box with Ql 10 does)", () => {
  const open = simulate(DRV, { kind: "infinite-baffle" }, { air, frequencies: [15, 20, 30] });
  const attic = simulate(DRV, { kind: "infinite-baffle", rear_l: 1e6 }, { air, frequencies: [15, 20, 30] });
  const sealed = simulate(DRV, { kind: "sealed", vb_l: 1e6 }, { air, frequencies: [15, 20, 30] });
  open.spl.forEach((s, i) => {
    assert.ok(Math.abs(attic.spl[i]! - s) < 0.1, `attic at ${open.freq[i]} Hz: ${attic.spl[i]} vs ${s}`);
    assert.ok(sealed.spl[i]! < s - 1, `sealed 1e6 L with WinISD's Ql 10 keeps its leak in the room (${sealed.spl[i]} vs ${s})`);
  });
});

test("infinite baffle, open rear: piston load keeps Fc = Fs and the bass; no air-spring distortion", () => {
  const mass = simulate(DRV, { kind: "infinite-baffle" }, { air, frequencies: [10, 15, 20, 25] });
  const piston = simulate(DRV, { kind: "infinite-baffle" }, { air, frequencies: [10, 15, 20, 25], coneLoad: "piston" });
  assert.ok(Math.abs(piston.summary.fc! - DRV.fs) < 1e-9);
  // Only the rear face's radiation resistance (a real loss into the rear space) differs: 0.03 dB at 25 Hz for an 18".
  mass.spl.forEach((s, i) => assert.ok(Math.abs(piston.spl[i]! - s) < 0.05, `${mass.freq[i]} Hz: ${piston.spl[i]} vs ${s}`));
  const air2 = simulate(DRV, { kind: "infinite-baffle" }, { air, airDistortion: { threshold: 1, limit: false } });
  assert.ok(air2.airHd2!.every((h) => h === 0));
});
