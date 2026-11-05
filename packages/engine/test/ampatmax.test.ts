import { test } from "node:test";
import assert from "node:assert/strict";
import { simulate } from "../src/simulate.ts";

// A 10" subwoofer-like driver in a sealed box.
const DRV = { fs: 30, qms: 5.2, qes: 0.4, vas_l: 50, re: 3.4, sd_cm2: 330, xmax_mm: 12, pe_w: 250 };
const BOX = { kind: "sealed" as const, vb_l: 40 };
const at = (f: Float64Array, hz: number) => {
  let i = 0;
  while (f[i]! < hz) i++;
  return i;
};

test("amp at max: with no filter, the volts are the drive volts scaled to the limit, and I = V / |Z|", () => {
  const r = simulate(DRV, BOX, { power: 100 });
  for (const hz of [20, 40, 100]) {
    const i = at(r.freq, hz);
    const v = r.summary.volts * Math.sqrt(r.maxPowerW[i]! / 100);
    assert.ok(Math.abs(r.ampAtMax.volts[i]! - v) < 1e-9 * v, `${hz} Hz volts`);
    assert.ok(Math.abs(r.ampAtMax.amps[i]! - v / r.impedanceOhm[i]!) < 1e-6, `${hz} Hz amps`);
    // Real power can't exceed volt-amps.
    assert.ok(r.ampAtMax.watts[i]! <= r.ampAtMax.volts[i]! * r.ampAtMax.amps[i]! + 1e-9);
  }
  // Below the box resonance the cone's excursion limits; there V² / Re is the drive power.
  const i = at(r.freq, 20);
  assert.equal(r.limitedBy[i], "xmax");
  assert.ok(Math.abs(r.ampAtMax.volts[i]! ** 2 / DRV.re - r.maxPowerW[i]!) < 1e-6 * r.maxPowerW[i]!);
});

test("amp at max: EQ boost raises the voltage the amplifier must deliver, not the maximum SPL", () => {
  const plain = simulate(DRV, BOX, { power: 100 });
  const eq = simulate(DRV, BOX, { power: 100, eq: [{ type: "peak", freq: 25, gain_db: 6, q: 1 }] });
  const i = at(plain.freq, 25);
  // Same maximum SPL (the cone's Xmax limits either way) and the same amplifier voltage to reach
  // it, but the EQ gets there with a quarter of the drive setting (+6 dB in the signal).
  assert.ok(Math.abs(eq.maxSpl[i]! - plain.maxSpl[i]!) < 0.01);
  assert.ok(Math.abs(eq.ampAtMax.volts[i]! - plain.ampAtMax.volts[i]!) < 0.01 * plain.ampAtMax.volts[i]!);
  assert.ok(Math.abs(eq.maxPowerW[i]! * 10 ** 0.6 - plain.maxPowerW[i]!) < 0.02 * plain.maxPowerW[i]!);
});

test("amp at max: the thermal limit means Pe in the coil, so a high-pass filter's cut doesn't change the amp volts there", () => {
  const plain = simulate(DRV, BOX, { power: 100 });
  const hp = simulate(DRV, BOX, { power: 100, highPass: { type: "butterworth", order: 2, freq: 30 } });
  const i = at(plain.freq, 150);
  assert.equal(plain.limitedBy[i], "thermal");
  assert.ok(Math.abs(hp.ampAtMax.volts[i]! - plain.ampAtMax.volts[i]!) < 0.01 * plain.ampAtMax.volts[i]!);
  // √(Pe · Re) at the thermal limit, as the drive convention counts it.
  assert.ok(Math.abs(plain.ampAtMax.volts[i]! - Math.sqrt(DRV.pe_w * DRV.re)) < 0.01);
});

test("amp at max: drivers in parallel halve the impedance and double the current for the same volts", () => {
  const one = simulate(DRV, BOX, { power: 100 });
  const two = simulate(DRV, { ...BOX, vb_l: 80 }, { power: 200, drivers: 2, wiring: "parallel" });
  const i = at(one.freq, 25);
  assert.ok(Math.abs(two.ampAtMax.volts[i]! - one.ampAtMax.volts[i]!) < 0.01 * one.ampAtMax.volts[i]!);
  assert.ok(Math.abs(two.ampAtMax.amps[i]! - 2 * one.ampAtMax.amps[i]!) < 0.01 * one.ampAtMax.amps[i]!);
});
