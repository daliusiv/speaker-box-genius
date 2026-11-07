import { test } from "node:test";
import assert from "node:assert/strict";
import { simulate } from "../src/simulate.ts";
import { passiveInputImpedance, type PassiveNetwork } from "../src/passive.ts";
import { cx, abs } from "../src/complex.ts";

const drv = { fs: 35, qms: 1.87, qes: 0.4, vas_l: 37.4, re: 5.9, sd_cm2: 211.2, le_mh: 0, xmax_mm: 5.5, pe_w: 80 };
const box = { kind: "sealed" as const, vb_l: 10.4, ql: Infinity, qa: Infinity };
const o = { power: 2.83, convention: "volts" as const, fMin: 10, fMax: 5000, points: 300 };
const maxDiff = (a: Float64Array, b: Float64Array) => a.reduce((m, v, i) => Math.max(m, Math.abs(v - b[i]!)), 0);
const maxRel = (a: Float64Array, b: Float64Array) => a.reduce((m, v, i) => Math.max(m, Math.abs(v / b[i]! - 1)), 0);
const net = (...branches: PassiveNetwork["branches"]): PassiveNetwork => ({ branches });

test("passive: no parts fitted changes nothing", () => {
  const a = simulate(drv, box, o);
  const b = simulate(drv, box, { ...o, passive: net({}, { r: 0 }, {}, {}) });
  assert.deepEqual(b.spl, a.spl);
  assert.deepEqual(b.impedanceOhm, a.impedanceOhm);
});

test("passive: a series resistor acts like the amplifier's resistance (and shows in the impedance)", () => {
  const rg = simulate(drv, box, { ...o, rg: 1 });
  const r = simulate(drv, box, { ...o, passive: net({ r: 1 }) });
  assert.ok(maxDiff(r.spl, rg.spl) < 1e-9 && maxRel(r.excursionMm, rg.excursionMm) < 1e-9);
  assert.ok(Math.abs(r.summary.referenceSpl - rg.summary.referenceSpl) < 1e-9, "reference level");
  r.impedanceOhm.forEach((z, i) => assert.ok(Math.abs(z - Math.hypot(rg.impedanceOhm[i]! * Math.cos((rg.impedancePhaseDeg[i]! * Math.PI) / 180) + 1, rg.impedanceOhm[i]! * Math.sin((rg.impedancePhaseDeg[i]! * Math.PI) / 180))) < 1e-9));
});

test("passive: a series coil is the same as adding its inductance to the driver's Le", () => {
  const coil = simulate(drv, box, { ...o, passive: net({ l_mH: 1.5 }) });
  const le = simulate({ ...drv, le_mh: 1.5 }, box, o);
  assert.ok(maxDiff(coil.spl, le.spl) < 1e-9, `SPL ${maxDiff(coil.spl, le.spl)}`);
  assert.ok(maxRel(coil.impedanceOhm, le.impedanceOhm) < 1e-9 && maxRel(coil.excursionMm, le.excursionMm) < 1e-9);
});

test("passive: a capacitor across after the coil makes a 2nd-order low-pass (12 dB/octave instead of 6)", () => {
  const base = simulate(drv, box, o);
  const first = simulate(drv, box, { ...o, passive: net({ l_mH: 2 }) });
  const second = simulate(drv, box, { ...o, passive: net({ l_mH: 2 }, { c_uF: 200 }) });
  const at = (r: typeof base, f: number) => r.spl[r.freq.findIndex((x) => x >= f)]!;
  const slope = (r: typeof base) => at(r, 4000) - at(base, 4000) - (at(r, 2000) - at(base, 2000));
  assert.ok(Math.abs(slope(first) + 6) < 1, `1st order ${slope(first)} dB/octave`);
  assert.ok(Math.abs(slope(second) + 12) < 1, `2nd order ${slope(second)} dB/octave`);
});

test("passive: a Zobel (R = Re, C = Le / Re²) flattens the impedance the amplifier sees up high", () => {
  const d = { ...drv, le_mh: 1 };
  const zobel = net({}, {}, {}, { r: 5.9, c_uF: (0.001 / 5.9 ** 2) * 1e6 });
  const plain = simulate(d, box, o);
  const z = simulate(d, box, { ...o, passive: zobel });
  const at = (r: typeof plain, f: number) => r.impedanceOhm[r.freq.findIndex((x) => x >= f)]!;
  assert.ok(at(plain, 4000) > 15, "the coil's inductance raises it");
  assert.ok(Math.abs(at(z, 4000) / 5.9 - 1) < 0.03, `${at(z, 4000)} Ω`);
  // Across the speaker: the drive the driver gets is unchanged (no source resistance).
  assert.ok(maxDiff(z.spl, plain.spl) < 1e-9);
});

test("passive: in parallel, a coil and resistor in line short the resistor at DC (a bass-shelving network)", () => {
  // R ∥ L in line: full level in the bass, R in series higher up.
  const r = simulate(drv, box, { ...o, passive: net({ r: 6, l_mH: 5, join: "parallel" }) });
  const plain = simulate(drv, box, o);
  const at = (x: typeof plain, f: number) => x.spl[x.freq.findIndex((v) => v >= f)]!;
  assert.ok(Math.abs(at(r, 12) - at(plain, 12)) < 0.5, "nearly unchanged in the deep bass (the coil is 0.4 Ω at 12 Hz)");
  assert.ok(at(plain, 3000) - at(r, 3000) > 4, "about 6 dB down up high");
  assert.ok(Math.abs(r.summary.referenceSpl - plain.summary.referenceSpl) < 1e-9, "the coil shorts the resistor for the reference");
  assert.ok(abs(passiveInputImpedance(net({ r: 6, l_mH: 5, join: "parallel" }), 2 * Math.PI * 1e5, cx(5.9))) > 11.8);
});

test("passive: two drivers in parallel share the network (each sees twice its source impedance)", () => {
  const one = simulate(drv, { ...box, vb_l: 20.8 }, { ...o, drivers: 2, rg: 0.5 });
  const two = simulate(drv, { ...box, vb_l: 20.8 }, { ...o, drivers: 2, passive: net({ r: 0.5 }) });
  assert.ok(maxDiff(one.spl, two.spl) < 1e-9 && maxRel(one.excursionMm, two.excursionMm) < 1e-9);
});
