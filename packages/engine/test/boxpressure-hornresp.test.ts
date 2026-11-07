import { test } from "node:test";
import assert from "node:assert/strict";
import { simulate } from "../src/simulate.ts";
import { HORNRESP_AIR, HORNRESP_DRIVER, hornrespDriver, interp, readBoxCase } from "../validation/hornresp.ts";

/*
 * The pressure inside the box against Hornresp 60.60's Displacement chart window, Tools >
 * Diaphragm Pressure > Rear Chamber Side, at 2.83 V. Hornresp can't export it, so the values
 * are read off screenshots (about ±2 % of full scale): 300 Pa for the sealed box, 400 Pa for
 * the ported one.
 */
const box = (id: string, portModel?: "pipe") => {
  const c = readBoxCase(id);
  return simulate(hornrespDriver(HORNRESP_DRIVER, c.frontAir), c.input, { power: 2.83, convention: "volts", fMin: 10, fMax: 1000, points: 4000, air: HORNRESP_AIR, portModel });
};

test("box pressure: the sealed box (B1) matches Hornresp's chart", () => {
  const r = box("b1-sealed");
  for (const [f, ref] of [[10, 267], [20, 265], [40, 250], [100, 135], [200, 42], [400, 10]] as const) {
    const ours = interp(r.freq, r.boxPressurePa!, f);
    assert.ok(Math.abs(ours - ref) < 0.025 * 300, `${f} Hz: ${ours.toFixed(1)} Pa vs Hornresp ${ref}`);
  }
});

test("box pressure: the ported box (B2) peaks where and as high as Hornresp's", () => {
  const r = box("b2-ported", "pipe");
  const p = r.boxPressurePa!;
  const i = p.indexOf(Math.max(...p));
  assert.ok(Math.abs(p[i]! - 340) < 0.025 * 400, `peak ${p[i]!.toFixed(1)} Pa`);
  assert.ok(Math.abs(Math.log2(r.freq[i]! / 44)) < 0.05, `at ${r.freq[i]!.toFixed(1)} Hz`);
  for (const [f, ref] of [[10, 20], [20, 65], [100, 52], [200, 15]] as const) {
    const ours = interp(r.freq, p, f);
    assert.ok(Math.abs(ours - ref) < 0.025 * 400, `${f} Hz: ${ours.toFixed(1)} Pa vs Hornresp ${ref}`);
  }
});

test("box pressure: the sealed box's is the air spring's (ρc²·Sd·x / V) in the bass, and a bandpass box gives both chambers", () => {
  const r = box("b1-sealed");
  const k = (HORNRESP_AIR.rho * HORNRESP_AIR.c ** 2 * 0.02112) / 0.0104;
  const ours = interp(r.freq, r.boxPressurePa!, 15);
  const spring = (k * interp(r.freq, r.excursionMm, 15)) / 1000;
  assert.ok(Math.abs(ours / spring - 1) < 0.001, `${ours} vs ${spring}`);
  assert.equal(r.frontChamberPressurePa, null);
  const bp = simulate(HORNRESP_DRIVER, readBoxCase("b4-bandpass-4th").input, { power: 2.83, convention: "volts" });
  assert.ok(bp.boxPressurePa && bp.frontChamberPressurePa && Math.max(...bp.frontChamberPressurePa) > 0);
});
