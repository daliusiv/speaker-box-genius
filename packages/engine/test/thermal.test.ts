import { test } from "node:test";
import assert from "node:assert/strict";
import { simulate, type SimulationOptions } from "../src/simulate.ts";
import type { EnclosureInput } from "../src/model.ts";
import { COIL_ALPHA } from "../src/model.ts";
import { highPassResponse } from "../src/filters.ts";
import { SINE_CREST_DB } from "../src/program.ts";
import {
  coilTempForCurrent,
  compressionAt,
  compressionSweep,
  pinkWeights,
  programEquilibrium,
  reAt,
  rthOf,
  sineEquilibrium,
  type CoilParts,
} from "../src/thermal.ts";

// Voice-coil heating (plan-headroom-thermal.md §2, Appendix B): power breakdown, coil temperature, coil limit.
const DRV = { fs: 30, qms: 5.2, qes: 0.4, vas_l: 50, re: 3.4, le_mh: 1.2, sd_cm2: 330, xmax_mm: 12, pe_w: 250 };
const PR = { mms_g: 122, sd_cm2: 330, vas_l: 80, qms: 6, xmax_mm: 18 };
const port = (d: number, l: number) => ({ shape: "round" as const, diameter_cm: d, length_cm: l });
const O: SimulationOptions = { power: 50, fMin: 10, fMax: 2000, points: 160 };

const BOXES: [string, EnclosureInput][] = [
  ["sealed", { kind: "sealed", vb_l: 40 }],
  ["vented", { kind: "vented", vb_l: 60, port: port(10, 30) }],
  ["pr", { kind: "passive-radiator", vb_l: 50, pr: PR, prCount: 2, addedMass_g: 40 }],
  ["bandpass 4", { kind: "bandpass", rear: { vb_l: 30 }, front: { vb_l: 20, port: port(8, 20) } }],
  ["bandpass 6", { kind: "bandpass", rear: { vb_l: 30, port: port(8, 25) }, front: { vb_l: 20, port: port(8, 20) } }],
  ["line", { kind: "line", segments: [{ length_cm: 200, startArea_cm2: 600, endArea_cm2: 600 }], driverAt_cm: 0 }],
  ["tapped horn", { kind: "line", segments: [{ length_cm: 250, startArea_cm2: 150, endArea_cm2: 600 }], driverAt_cm: 0, tap_cm: 110 }],
  ["infinite baffle", { kind: "infinite-baffle" }],
  ["open baffle", { kind: "open-baffle", w_cm: 50, h_cm: 80 }],
];
const VARIANTS: [string, SimulationOptions][] = [
  ["plain", {}],
  ["rg", { rg: 0.3 }],
  ["2 parallel", { drivers: 2 }],
  ["2 series", { drivers: 2, wiring: "series" }],
  ["isobaric", { isobaric: { coils: "parallel" } }],
  ["hot coil", { coilTemp_C: 90 }],
  ["winisd + rg", { driveModel: "winisd", rg: 0.5 }],
  ["piston load", { coneLoad: "piston" }],
  ["high-pass", { highPass: { type: "butterworth", order: 2, freq: 18 } }],
];

const rel = (a: number, b: number) => Math.abs(a - b) / Math.max(Math.abs(b), 1e-30);

test("power breakdown: the power into the bank is what the amplifier sends it (|I|²·Re Z), every box type and wiring", () => {
  for (const [bn, box] of BOXES) {
    for (const [vn, v] of VARIANTS) {
      const r = simulate(DRV, box, { ...O, ...v, powerBreakdown: true });
      const pw = r.power!;
      const rg = v.rg ?? 0;
      let worst = 0;
      for (let i = 0; i < r.freq.length; i++) {
        // The amplifier's volts (summary.volts, through the filter) into Zin + Rg; the bank takes I²·Re(Zin).
        const ph = (r.impedancePhaseDeg[i]! * Math.PI) / 180;
        const zr = r.impedanceOhm[i]! * Math.cos(ph), zi = r.impedanceOhm[i]! * Math.sin(ph);
        const h = v.highPass ? highPassResponse(v.highPass, r.freq[i]!) : { re: 1, im: 0 };
        const g2 = h.re * h.re + h.im * h.im;
        const iAmp2 = (r.summary.volts ** 2 * g2) / ((zr + rg) ** 2 + zi ** 2);
        worst = Math.max(worst, rel(pw.inW[i]!, iAmp2 * zr));
      }
      assert.ok(worst < 1e-9, `${bn} / ${vn}: ${worst}`);
    }
  }
});

test("power breakdown: coil + eddy + suspension + box + sound = in, all ≥ 0, efficiency = sound / in", () => {
  for (const [bn, box] of BOXES) {
    for (const [vn, v] of VARIANTS) {
      const r = simulate(DRV, box, { ...O, ...v, powerBreakdown: true });
      const p = r.power!;
      for (let i = 0; i < r.freq.length; i++) {
        const tag = `${bn} / ${vn} @ ${r.freq[i]!.toFixed(1)} Hz`;
        for (const k of ["coilW", "eddyW", "mechW", "boxW", "acousticW"] as const) assert.ok(p[k][i]! >= -1e-12 * p.inW[i]!, `${tag}: ${k} ${p[k][i]}`);
        // The sound isn't a load in the "mass" cone model, so a lossless box (an open rear) can leave less than it: then box = 0.
        if (p.boxW[i]! > 0) {
          const sum = p.coilW[i]! + p.eddyW[i]! + p.mechW[i]! + p.boxW[i]! + p.acousticW[i]!;
          assert.ok(rel(sum, p.inW[i]!) < 1e-9, `${tag}: sum ${sum} vs ${p.inW[i]}`);
        }
        assert.ok(rel(p.efficiency[i]!, p.acousticW[i]! / p.inW[i]!) < 1e-12, tag);
      }
    }
  }
});

test("power breakdown: no inductance → no eddy losses; with Le the losses grow with frequency", () => {
  const r0 = simulate({ ...DRV, le_mh: 0 }, { kind: "sealed", vb_l: 40 }, { ...O, powerBreakdown: true });
  for (let i = 0; i < r0.freq.length; i++) assert.ok(Math.abs(r0.power!.eddyW[i]!) <= 1e-12 * r0.power!.inW[i]!);
  // A lossy inductance (L2R2): Re(Zvc) − Re > 0.
  const r = simulate({ ...DRV, l2_mh: 1, r2_ohm: 3 }, { kind: "sealed", vb_l: 40 }, { ...O, powerBreakdown: true });
  const e = r.power!.eddyW;
  assert.ok(e[e.length - 1]! / r.power!.inW[e.length - 1]! > e[40]! / r.power!.inW[40]!);
});

test("efficiency → η0 = 4π²·fs³·Vas / (c³·Qes) in the passband (half space, Le 0, small piston, large box)", () => {
  const drv = { fs: 10, qms: 8, qes: 0.5, vas_l: 60, re: 6, le_mh: 0, sd_cm2: 10, xmax_mm: 5, pe_w: 100 };
  const air = { rho: 1.204, c: 343.2 };
  const r = simulate(drv, { kind: "sealed", vb_l: 1e6, qa: Infinity, ql: Infinity }, { power: 1, frequencies: [300], powerBreakdown: true, air } as SimulationOptions);
  const eta0 = (4 * Math.PI ** 2 * drv.fs ** 3 * (drv.vas_l / 1000)) / (air.c ** 3 * drv.qes);
  // At 300 Hz: 30 × fs (mass-controlled to 0.1 %), ka 0.1.
  assert.ok(rel(r.power!.efficiency[0]!, eta0) < 0.005, `η ${r.power!.efficiency[0]} vs η0 ${eta0}`);
});

test("coil parts: the current at another coil temperature, scaled from one simulation, matches simulating at it", () => {
  for (const [bn, box] of BOXES) {
    for (const v of [{}, { rg: 0.4 }, { drivers: 3 }, { passive: { branches: [{ l_mH: 2 }, { c_uF: 300 }] } }, { highPass: { type: "butterworth" as const, order: 2, freq: 20 } }]) {
      const cold = simulate(DRV, box, { ...O, ...v, coilParts: true });
      const hot = simulate(DRV, box, { ...O, ...v, coilTemp_C: 130 });
      const p = cold.coilParts!;
      for (let i = 0; i < cold.freq.length; i++) {
        // At the same amplifier volts (the "re" convention takes them from the cold Re, so they are).
        const want = hot.spl[i]! - 20 * Math.log10(hot.summary.volts / cold.summary.volts);
        const got = cold.spl[i]! + compressionAt(p, i, 130);
        assert.ok(Math.abs(got - want) < 1e-9, `${bn} ${JSON.stringify(v)} @ ${cold.freq[i]} Hz: ${got} vs ${want}`);
      }
    }
  }
});

test("coil parts: a heated simulation's own parts give the same currents at its temperature", () => {
  const box: EnclosureInput = { kind: "vented", vb_l: 60, port: port(10, 30) };
  const a = simulate(DRV, box, { ...O, coilParts: true }).coilParts!;
  const b = simulate(DRV, box, { ...O, coilParts: true, coilTemp_C: 75 }).coilParts!;
  assert.equal(b.simTemp_C, 75);
  assert.deepEqual(b.thermal, { rth: rthOf(DRV.pe_w), tmax_C: 200, ambient_C: 20 });
  assert.equal(simulate({ ...DRV, pe_w: undefined }, box, { ...O, coilParts: true }).coilParts!.thermal, null);
  assert.equal(simulate({ ...DRV, pe_w: undefined }, box, { ...O, coilParts: true, thermal: { rth: 2, ambient_C: 30 } }).coilParts!.thermal!.rth, 2);
  assert.ok(rel(b.reSim, reAt(DRV.re, 75)) < 1e-12);
  for (let i = 0; i < a.iRe.length; i++) {
    const ia = Math.hypot(a.iRe[i]!, a.iIm[i]!) * 10 ** (compressionAt(a, i, 75) / 20);
    assert.ok(rel(Math.hypot(b.iRe[i]!, b.iIm[i]!), ia) < 1e-9);
  }
});

test("thermal: R_th from the power rating; at Pe the coil sits at T_max, Re × 1.71, 4.65 dB down on a pure resistance", () => {
  assert.equal(rthOf(500), 180 / 500);
  assert.equal(rthOf(500, 200, 2), 2);
  assert.equal(rthOf(null), null);
  assert.equal(rthOf(0), null);
  const re20 = 4;
  const rth = rthOf(250)!;
  // The current that puts Pe into the coil at T_max.
  const i = Math.sqrt(250 / reAt(re20, 200));
  const t = coilTempForCurrent(i, re20, rth);
  assert.ok(Math.abs(t.tempC - 200) < 1e-9 && !t.runaway);
  assert.ok(Math.abs(reAt(re20, 200) / re20 - (1 + COIL_ALPHA * 180)) < 1e-12);
  const parts: CoilParts = { re20, simTemp_C: 20, reSim: re20, iRe: Float64Array.of(1), iIm: Float64Array.of(0), zRe: Float64Array.of(0), zIm: Float64Array.of(0), drivers: 1, thermal: null };
  assert.ok(Math.abs(compressionAt(parts, 0, 200) + 20 * Math.log10(1 + COIL_ALPHA * 180)) < 1e-12);
  assert.ok(Math.abs(compressionAt(parts, 0, 200) + 4.647) < 0.001);
  // Runaway: more current than the coil can ever shed.
  assert.ok(coilTempForCurrent(1e3, re20, rth).runaway);
});

test("thermal: the sine equilibrium balances heat in and out, and the closed form agrees at that current", () => {
  const r = simulate(DRV, { kind: "sealed", vb_l: 40 }, { ...O, coilParts: true });
  const p = r.coilParts!;
  const th = { rth: 0.72, tmax_C: 200, ambient_C: 25 };
  const eq = sineEquilibrium(p, th, 3);
  for (let i = 0; i < r.freq.length; i++) {
    if (eq.runaway[i]) continue;
    assert.ok(Math.abs(th.ambient_C + th.rth * eq.coilW[i]! - eq.tempC[i]!) < 1e-5, `${r.freq[i]} Hz`);
    const iAt = Math.sqrt(eq.coilW[i]! / reAt(p.re20, eq.tempC[i]!));
    assert.ok(Math.abs(coilTempForCurrent(iAt, p.re20, th.rth, th.ambient_C).tempC - eq.tempC[i]!) < 1e-5);
  }
  // Hottest at the impedance minimum above resonance, coolest at resonance (high Z).
  const at = (f: number) => eq.tempC[r.freq.findIndex((x) => x >= f)]!;
  assert.ok(at(35) < at(100));
});

test("thermal: pink weights are equal energy per octave and sum to 1", () => {
  const f = Array.from({ length: 81 }, (_, i) => 10 * 2 ** (i / 10));
  const w = pinkWeights(f, [20, 200])!;
  assert.ok(Math.abs(w.reduce((a, b) => a + b, 0) - 1) < 1e-12);
  // Interior points of a log grid: all the same.
  const inner = [...w].filter((x, i) => x > 0 && f[i - 1]! >= 20 && f[i + 1]! <= 200);
  assert.ok(Math.max(...inner) - Math.min(...inner) < 1e-12);
  assert.equal(pinkWeights(f, [3000, 4000]), null);
});

test("thermal: program equilibrium; heating the simulation to that temperature loses exactly its compression", () => {
  const box: EnclosureInput = { kind: "vented", vb_l: 60, port: port(10, 30) };
  const cold = simulate(DRV, box, { ...O, power: 120, coilParts: true });
  const th = { rth: rthOf(DRV.pe_w)!, tmax_C: 200, ambient_C: 20 };
  const eq = programEquilibrium(cold.coilParts!, cold.freq, th)!;
  assert.ok(eq.tempC > 40 && eq.tempC < 200, `${eq.tempC}`);
  assert.ok(Math.abs(20 + th.rth * eq.coilW - eq.tempC) < 1e-5);
  const hot = simulate(DRV, box, { ...O, power: 120, coilTemp_C: eq.tempC });
  for (let i = 0; i < cold.freq.length; i++) assert.ok(Math.abs(cold.spl[i]! + eq.compressionDb[i]! - hot.spl[i]!) < 1e-9);
  // More drive, hotter coil, more compression.
  const sweep = compressionSweep(cold.coilParts!, cold.freq, th, [0.1, 0.5, 1, 1.5]);
  for (let k = 1; k < sweep.length; k++) {
    assert.ok(sweep[k]!.tempC > sweep[k - 1]!.tempC);
    assert.ok(sweep[k]!.compressionDb < sweep[k - 1]!.compressionDb);
  }
  assert.ok(Math.abs(sweep[2]!.tempC - eq.tempC) < 1e-9);
});

test("coil limit: maxSpl = min(ceilings), the winner is limitedBy, programSpl = maxSpl for a sine", () => {
  for (const [bn, box] of BOXES) {
    for (const v of [{}, { amp: { volts: 40, amps: 12, watts: 300 } }, { drivers: 2, rg: 0.3 }, { thermal: { ambient_C: 45 } }]) {
      const r = simulate(DRV, box, { ...O, ...v, thermalLimit: "coil" });
      for (let i = 0; i < r.freq.length; i++) {
        const tag = `${bn} ${JSON.stringify(v)} @ ${r.freq[i]!.toFixed(1)} Hz`;
        const a = r.ceilings.avgSpl[i]!, pk = r.ceilings.peakSpl[i]!;
        assert.ok(Math.abs(Math.min(a, pk) - r.maxSpl[i]!) < 1e-9, tag);
        assert.equal(r.limitedBy[i], a <= pk ? r.ceilings.avgKind[i] : r.ceilings.peakKind[i], tag);
        assert.ok(Math.abs(r.programSpl![i]! - r.maxSpl[i]!) < 1e-12, tag);
        // Where the coil holds it, the coil is at T_max.
        if (r.limitedBy[i] === "thermal") assert.ok(Math.abs(r.coilAtMax!.tempC[i]! - 200) < 1e-3, `${tag}: ${r.coilAtMax!.tempC[i]}`);
        else assert.ok(r.coilAtMax!.tempC[i]! <= 200 + 1e-3, tag);
      }
    }
  }
});

test("coil limit: the amplifier never exceeds its ratings at the hot coil's impedance", () => {
  const amp = { volts: 30, amps: 9, watts: 200 };
  const r = simulate(DRV, { kind: "vented", vb_l: 60, port: port(10, 30) }, { ...O, rg: 0.2, amp, thermalLimit: "coil" });
  const seen = new Set<string>();
  for (let i = 0; i < r.freq.length; i++) {
    assert.ok(r.ampAtMax.volts[i]! <= amp.volts * (1 + 1e-6) && r.ampAtMax.amps[i]! <= amp.amps * (1 + 1e-6) && r.ampAtMax.watts[i]! <= amp.watts * (1 + 1e-6), `${r.freq[i]} Hz`);
    if (r.ampLimitBy[i]) seen.add(r.ampLimitBy[i]!);
  }
  assert.ok(seen.size > 0);
});

test("coil limit: without Pe or R_th it matches the plain Max SPL; coil mode adds nothing else", () => {
  const drv = { ...DRV, pe_w: undefined };
  for (const [bn, box] of BOXES) {
    const o = { ...O, rg: 0.2, amp: { volts: 35, amps: 10, watts: 250 } };
    const plain = simulate(drv, box, o);
    const coil = simulate(drv, box, { ...o, thermalLimit: "coil" });
    for (let i = 0; i < plain.freq.length; i++) {
      assert.ok(Math.abs(coil.maxSpl[i]! - plain.maxSpl[i]!) < 1e-9, `${bn} @ ${plain.freq[i]} Hz`);
      assert.equal(coil.limitedBy[i], plain.limitedBy[i]);
      assert.ok(rel(coil.ampAtMax.watts[i]!, plain.ampAtMax.watts[i]!) < 1e-9);
    }
  }
});

test("coil limit: a hotter room, a lower T_max or a larger R_th lowers the thermal ceiling", () => {
  const box: EnclosureInput = { kind: "sealed", vb_l: 40 };
  const base = simulate(DRV, box, { ...O, thermalLimit: "coil" });
  const i = base.freq.findIndex((f) => f >= 150);
  assert.equal(base.limitedBy[i], "thermal");
  // R_th from Pe takes T_max with it (same watts at T_max), so a lower T_max is tested at a set R_th.
  for (const thermal of [{ ambient_C: 45 }, { rth: rthOf(DRV.pe_w)!, tmax_C: 150 }, { rth: 1.2 }]) {
    const r = simulate(DRV, box, { ...O, thermalLimit: "coil", thermal });
    assert.ok(r.maxSpl[i]! < base.maxSpl[i]! - 0.2, JSON.stringify(thermal));
  }
  // Coil current at the limit: P = (T_max − T_amb)/R_th into Re(T_max).
  const rth = rthOf(DRV.pe_w)!;
  const pCoil = (200 - 20) / rth;
  assert.ok(Math.abs(pCoil - DRV.pe_w) < 1e-9);
  // Against the Pe limit on V²/Re: the hot coil draws less, but compresses: within a few dB of each other.
  const nominal = simulate(DRV, box, O);
  assert.ok(Math.abs(base.maxSpl[i]! - nominal.maxSpl[i]!) < 6);
  // And it loses ~4.6 dB against a cold coil at the same volts there.
  assert.ok(base.coilAtMax!.compressionDb[i]! < -4 && base.coilAtMax!.compressionDb[i]! > -5);
});

test("coil limit + program: thermal-limited points stay put, peak-limited ones drop by exactly C − 3.01 dB", () => {
  const box: EnclosureInput = { kind: "vented", vb_l: 60, port: port(10, 30) };
  const C = 12;
  const sine = simulate(DRV, box, { ...O, thermalLimit: "coil", portVelocityLimit: Infinity });
  const prog = simulate(DRV, box, { ...O, thermalLimit: "coil", portVelocityLimit: Infinity, crest_dB: C });
  let th = 0, pk = 0;
  for (let i = 0; i < sine.freq.length; i++) {
    const avg = sine.ceilings.avgSpl[i]!, peak = sine.ceilings.peakSpl[i]!;
    if (avg < peak - (C - SINE_CREST_DB)) {
      // Thermal-limited even on the program: the same.
      assert.ok(Math.abs(prog.programSpl![i]! - sine.maxSpl[i]!) < 1e-6, `${sine.freq[i]} Hz`);
      th++;
    } else if (peak < avg) {
      // Peak-limited on the sine: down by C − 3.01 (a cooler coil doesn't move excursion limits).
      assert.ok(Math.abs(prog.programSpl![i]! - (sine.maxSpl[i]! - (C - SINE_CREST_DB))) < 1e-6, `${sine.freq[i]} Hz`);
      pk++;
    }
    assert.ok(prog.programSpl![i]! <= sine.maxSpl[i]! + 1e-9);
    // maxSpl itself doesn't depend on the crest factor.
    assert.ok(Math.abs(prog.maxSpl[i]! - sine.maxSpl[i]!) < 1e-12);
  }
  assert.ok(th > 0 && pk > 0, `${th} thermal, ${pk} peak`);
});

test("coil limit: nominal and real modes are untouched by the new options", () => {
  const box: EnclosureInput = { kind: "passive-radiator", vb_l: 50, pr: PR, prCount: 2 };
  for (const thermalLimit of [undefined, "real"] as const) {
    const a = simulate(DRV, box, { ...O, thermalLimit, amp: { volts: 40 } });
    const b = simulate(DRV, box, { ...O, thermalLimit, amp: { volts: 40 }, powerBreakdown: true, coilParts: true, crest_dB: 9, thermal: { rth: 3 } });
    assert.deepEqual(b.maxSpl, a.maxSpl);
    assert.deepEqual(b.spl, a.spl);
    assert.deepEqual(b.ceilings, a.ceilings);
    assert.equal(b.programSpl, undefined);
    assert.equal(a.power, undefined);
    assert.equal(a.coilParts, undefined);
  }
});

test("thermal bench: 4 designs heated (two passes) + power breakdown + compression sweep", () => {
  const boxes = BOXES.slice(0, 4).map((b) => b[1]);
  const th = { rth: rthOf(DRV.pe_w)!, tmax_C: 200, ambient_C: 20 };
  const levels = Array.from({ length: 24 }, (_, k) => Math.sqrt((0.1 * (500 / 0.1) ** (k / 23)) / 50));
  const run = () => {
    for (const box of boxes) {
      const cold = simulate(DRV, box, { power: 50, powerBreakdown: true });
      const eq = programEquilibrium(cold.coilParts!, cold.freq, th)!;
      simulate(DRV, box, { power: 50, coilTemp_C: eq.tempC });
      compressionSweep(cold.coilParts!, cold.freq, th, levels);
    }
  };
  for (let k = 0; k < 5; k++) run();
  const t0 = performance.now();
  const reps = 20;
  for (let k = 0; k < reps; k++) run();
  const ms = (performance.now() - t0) / reps;
  console.log(`# thermal bench: ${ms.toFixed(2)} ms for 4 designs (heated + breakdown + 24-level sweep)`);
  // Plan target 15 ms on a laptop (node); CI runners share cores, so only a loose ceiling here.
  assert.ok(ms < 60, `${ms} ms`);
});
