import { test } from "node:test";
import assert from "node:assert/strict";
import { simulate, type SimulationOptions } from "../src/simulate.ts";
import { combineAtDistance } from "../src/combine.ts";
import { abs, arg, cx } from "../src/complex.ts";
import { STANDARD_AIR } from "../src/constants.ts";
import type { EnclosureInput } from "../src/model.ts";

const D = { fs: 30, qms: 5, qes: 0.45, vas_l: 50, re: 6, sd_cm2: 500, le_mh: 0, xmax_mm: 10, pe_w: 200 };
const OPT: SimulationOptions = { power: 2.83, convention: "volts", fMin: 5, fMax: 1000, points: 600 };
const VENTED = { kind: "vented", vb_l: 50, port: { shape: "round", diameter_cm: 7, length_cm: 19.6 }, ql: 10, qa: 100, qp: 100 } as const;
const PR = { kind: "passive-radiator", vb_l: 40, pr: { mms_g: 120, sd_cm2: 500, xmax_mm: 15, qms: 5, vas_l: 60 }, prCount: 1, ql: 10, qa: 100 } as const;
const BP = (order: "4" | "6p" | "6s"): EnclosureInput => ({
  kind: "bandpass",
  rear: order === "4" ? { vb_l: 40 } : { vb_l: 40, port: { shape: "round", diameter_cm: 7, length_cm: 20 } },
  front: { vb_l: 20, port: { shape: "round", diameter_cm: 7, length_cm: 15 } },
  rearPortTo: order === "6s" ? "front" : "outside",
});

const boxes: [string, EnclosureInput][] = [
  ["vented", VENTED],
  ["pr", PR],
  ["6p", BP("6p")],
];

test("port position 0 (or absent) is today's result, bit for bit, in both modes", () => {
  for (const [name, box] of boxes)
    for (const splFrom of ["on-axis", "power"] as const) {
      const a = simulate(D, box, { ...OPT, splFrom });
      const b = simulate(D, { ...box, ventDistance_cm: 0 } as EnclosureInput, { ...OPT, splFrom });
      assert.deepEqual(b.spl, a.spl, `${name} ${splFrom}`);
      assert.deepEqual(b.phaseDeg, a.phaseDeg, `${name} ${splFrom}`);
      assert.equal(a.splSideBySide, null);
    }
});

test("combineAtDistance: power sum of two in-phase equal sources at kd = π is +3.01 dB over one", () => {
  const c = 344;
  const d = 0.5;
  const w = (Math.PI * c) / d;
  const one = cx(1, 0);
  const u = combineAtDistance(one, one, d, w, c, "power");
  assert.ok(Math.abs(20 * Math.log10(abs(u)) - 10 * Math.log10(2)) < 1e-9);
  // Phase stays the side-by-side sum's.
  assert.ok(Math.abs(arg(u)) < 1e-12);
  // On axis, far away: the second one delayed by d/c, same level.
  const on = combineAtDistance(one, one, d, w, c, "on-axis");
  assert.ok(abs(on) < 1e-12); // kd = π: half a wavelength late, cancels
});

test("a port some way off changes SPL, phase and group delay only; Ze, excursion, port speed stay", () => {
  for (const [name, box] of boxes)
    for (const splFrom of ["on-axis", "power"] as const) {
      const a = simulate(D, box, { ...OPT, splFrom });
      const b = simulate(D, { ...box, ventDistance_cm: 40 } as EnclosureInput, { ...OPT, splFrom });
      assert.deepEqual(b.impedanceOhm, a.impedanceOhm, name);
      assert.deepEqual(b.excursionMm, a.excursionMm, name);
      if (a.portVelocity) assert.deepEqual(b.portVelocity, a.portVelocity, name);
      // The side-by-side curve is the same box without the distance.
      b.splSideBySide!.forEach((v, i) => assert.ok(Math.abs(v - a.spl[i]!) < 1e-9, `${name} ${splFrom} side by side at ${a.freq[i]}`));
      // From radiated power little changes in the passband below c / (4d) (sinc(kd) → 1); deep below the tuning,
      // where cone and port nearly cancel, even a small change in the sum shows (and on axis the delay does more).
      const at = (r: typeof a, f: number) => r.spl[r.freq.findIndex((x) => x >= f)]!;
      if (splFrom === "power" && name !== "6p") assert.ok(Math.abs(at(b, 80) - at(a, 80)) < 0.2, `${name} ${splFrom} low`);
      const diff = Math.max(...Array.from(b.spl, (v, i) => Math.abs(v - a.spl[i]!)));
      assert.ok(diff > 0.1, `${name} ${splFrom} changes`);
      // Power: level only, the phase stays the side-by-side one (Hornresp's Path).
      if (splFrom === "power") b.phaseDeg.forEach((v, i) => assert.ok(Math.abs(v - a.phaseDeg[i]!) < 1e-9, `${name} phase`));
    }
});

test("4th-order and series 6th-order bandpass: one outside opening, the distance does nothing", () => {
  for (const order of ["4", "6s"] as const) {
    const a = simulate(D, BP(order), OPT);
    const b = simulate(D, { ...BP(order), ventDistance_cm: 40 } as EnclosureInput, OPT);
    assert.deepEqual(b.spl, a.spl, order);
  }
});

test("pathMode overrides splFrom: radiated-power levels with an on-axis delay", () => {
  const box = { ...VENTED, ventDistance_cm: 40 } as EnclosureInput;
  const power = simulate(D, box, { ...OPT, splFrom: "power" });
  const mixed = simulate(D, box, { ...OPT, splFrom: "power", pathMode: "on-axis" });
  assert.notDeepEqual(mixed.phaseDeg, power.phaseDeg);
  assert.deepEqual(mixed.splSideBySide, power.splSideBySide);
});

test("VituixCAD's vented group delay: its vent sits 0.6 ms behind the cone (laptop run 12 Nov 2026)", () => {
  // VituixCAD 3 Enclosure tool, driver SBG Q45, vented 50.1 L (its effective Vb), Fb 30, Ø7 × 19.6 cm, k 0.85, all Q 1000.
  const box = { kind: "vented", vb_l: 50.1, port: { shape: "round", diameter_cm: 7, length_cm: 19.6 }, endCorrection: 0.85, ql: 1000, qa: 1000, qp: 1000, ventDistance_cm: 0.0006 * STANDARD_AIR.c * 100 } as EnclosureInput;
  const r = simulate(D, box, { ...OPT, fMax: 200, points: 2000 });
  const gd = (f: number) => {
    const i = r.freq.findIndex((x) => x >= f);
    const t = Math.log(f / r.freq[i - 1]!) / Math.log(r.freq[i]! / r.freq[i - 1]!);
    return r.groupDelayMs[i - 1]! + t * (r.groupDelayMs[i]! - r.groupDelayMs[i - 1]!);
  };
  // Digitised from VituixCAD's GD chart.
  const vcad: [number, number][] = [[5.3, -1.0], [6, 1.5], [8, 5.7], [12, 9.9], [14.2, 11.3], [19.8, 15.3], [30.6, 24.7], [49.6, 5.7]];
  for (const [f, ms] of vcad) assert.ok(Math.abs(gd(f) - ms) < 0.45, `${f} Hz: ${gd(f).toFixed(2)} vs ${ms}`);
  // Its GDmax readout: 25.6 ms @ 28.7 Hz (side by side: 26.2).
  const max = Math.max(...r.groupDelayMs);
  assert.ok(Math.abs(max - 25.6) < 0.1, `GDmax ${max.toFixed(2)}`);
});
