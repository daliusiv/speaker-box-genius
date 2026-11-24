import { test } from "node:test";
import assert from "node:assert/strict";
import { simulate } from "../src/simulate.ts";
import { lineNetwork } from "../src/line.ts";
import { abs } from "../src/complex.ts";
import { flatModel, openBaffleFrequencies, openBaffleGeometry } from "../src/openBaffle.ts";
import type { DriverInput, OpenBaffleInput } from "../src/model.ts";
import { STANDARD_AIR } from "../src/constants.ts";

// Open baffle (dipole): a driver with an open rear whose back wave comes round the board's edges.
// Eminence Alpha 15A-like (Fs 41, Qts 1.26: the classic passive OB woofer), no coil inductance.
const DRV: DriverInput = { fs: 41, qms: 9.0, qes: 1.47, vas_l: 260, re: 5.8, sd_cm2: 856, le_mh: 0, xmax_mm: 3.4, pe_w: 150 };
const air = STANDARD_AIR;
const TAU = 2 * Math.PI;
const freqs = [15, 20, 30, 40, 60, 80, 100, 150, 200, 300, 400, 600, 1000];

test("flat open baffle = the same driver on an infinite baffle, in full space, times the edge-diffraction factor F", () => {
  const ib = simulate(DRV, { kind: "infinite-baffle" }, { frequencies: freqs, air });
  const sd = DRV.sd_cm2 / 1e4;
  for (const b of [
    { kind: "open-baffle", w_cm: 50, h_cm: 50 },
    { kind: "open-baffle", w_cm: 45, h_cm: 110, x_cm: 18, y_cm: 40, t_cm: 2.5 },
  ] satisfies OpenBaffleInput[]) {
    const m = flatModel(b, sd, air);
    const r = simulate(DRV, b, { frequencies: freqs, air });
    freqs.forEach((f, i) => {
      const want = ib.spl[i]! - 20 * Math.log10(2) + 20 * Math.log10(abs(m.at(f)));
      assert.ok(Math.abs(r.spl[i]! - want) < 1e-9, `${b.w_cm}×${b.h_cm} at ${f} Hz: ${r.spl[i]} vs ${want}`);
    });
    // The cone doesn't know about the edges: excursion and impedance are the open IB's.
    assert.deepEqual(Array.from(r.excursionMm), Array.from(ib.excursionMm));
    assert.deepEqual(Array.from(r.impedanceOhm), Array.from(ib.impedanceOhm));
    assert.ok(Math.abs(r.summary.fc! - DRV.fs) < 1e-9);
  }
});

test("flat board: a dipole below the peak (F → jkD, 6 dB/octave), the board's baffle step above, readouts from the curve", () => {
  const b: OpenBaffleInput = { kind: "open-baffle", w_cm: 60, h_cm: 60, t_cm: 0 };
  // A small cone (point source) as in the BEM run; a big cone shortens the path a little.
  const m = flatModel(b, 0, air);
  const fr = openBaffleFrequencies(b, air);
  // Path D: about 0.7 × the side of a centred square (thin-plate theory; BEM 42.0 cm).
  assert.ok(Math.abs(fr.d_m - 0.42) < 0.005, `D ${fr.d_m}`);
  // The default 18 mm board: its rear wave goes round the side face too (thick-board BEM 45.2 cm).
  const thick = openBaffleFrequencies({ ...b, t_cm: undefined }, air);
  assert.ok(Math.abs(thick.d_m / 0.452 - 1) < 0.02, `18 mm board: D ${thick.d_m}`);
  for (const f of [5, 10, 20]) {
    const F = m.at(f);
    const kD = ((TAU * f) / air.c) * fr.d_m;
    assert.ok(Math.abs(abs(F) / kD - 1) < 0.01 * (f / 10) ** 2 + 0.002, `|F| at ${f} Hz ${abs(F)} vs kD ${kD}`);
  }
  // The peak readout is the curve's first maximum, the null the minimum after it.
  const mag = (f: number) => abs(m.at(f));
  assert.ok(mag(fr.fPeak) >= mag(fr.fPeak * 0.98) && mag(fr.fPeak) >= mag(fr.fPeak * 1.02));
  assert.ok(mag(fr.fNull) <= mag(fr.fNull * 0.98) && mag(fr.fNull) <= mag(fr.fNull * 1.02));
  assert.ok(fr.fNull > fr.fPeak);
  // About +12 to +14 dB against a free source at the peak (BEM 403 Hz, +13.9 dB).
  assert.ok(Math.abs(fr.fPeak / 403 - 1) < 0.05, `peak ${fr.fPeak} Hz`);
  assert.ok(Math.abs(20 * Math.log10(mag(fr.fPeak)) - 13.9) < 0.5);
  assert.equal(fr.fQuarter, null);
  const ob = simulate(DRV, b, { frequencies: [10, 20], air });
  const ib = simulate(DRV, { kind: "infinite-baffle" }, { frequencies: [10, 20], air });
  const slope = ob.spl[1]! - ob.spl[0]! - (ib.spl[1]! - ib.spl[0]!);
  assert.ok(Math.abs(slope - 20 * Math.log10(2)) < 0.05, `extra slope ${slope} dB/oct`);
  const withCone = openBaffleFrequencies(b, air, DRV.sd_cm2 / 1e4);
  assert.deepEqual(ob.summary.ob, withCone);
  assert.ok(withCone.d_m < fr.d_m && withCone.d_m > 0.9 * fr.d_m, `15-inch cone: D ${withCone.d_m}`);
});

test("U-frame: the cone works into an open line of the frame's inside; the sound comes round the frame as a block", () => {
  const b: OpenBaffleInput = { kind: "open-baffle", frame: "u", w_cm: 50, h_cm: 50, t_cm: 2, depth_cm: 32 };
  const g = openBaffleGeometry(b);
  assert.equal(g.ductArea_cm2, 46 * 46);
  assert.equal(g.ductLength_cm, 30);
  const ob = simulate(DRV, b, { frequencies: freqs, air });
  const line = simulate(DRV, { kind: "line", segments: [{ length_cm: 30, startArea_cm2: 46 * 46, endArea_cm2: 46 * 46 }], driverAt_cm: 0, mouth: "open" }, { frequencies: freqs, air, space: "full" });
  // The cone's load is the line's: same excursion and impedance.
  freqs.forEach((_, i) => {
    assert.ok(Math.abs(ob.excursionMm[i]! - line.excursionMm[i]!) < 1e-12);
    assert.ok(Math.abs(ob.impedanceOhm[i]! - line.impedanceOhm[i]!) < 1e-12);
  });
  // In the bass the frame is a dipole: 6 dB/octave more slope than the line, whose mouth and cone
  // sit side by side (the frame's path D apart instead).
  const lo = simulate(DRV, b, { frequencies: [10, 20], air });
  const li = simulate(DRV, { kind: "line", segments: [{ length_cm: 30, startArea_cm2: 46 * 46, endArea_cm2: 46 * 46 }], driverAt_cm: 0, mouth: "open", mouthDistance_cm: 100 }, { frequencies: [10, 20], air, space: "full" });
  const fr = openBaffleFrequencies(b, air, DRV.sd_cm2 / 1e4);
  assert.ok(fr.d_m > 0.5 && fr.d_m < 0.8, `D ${fr.d_m}`);
  const slope = lo.spl[1]! - lo.spl[0]!;
  const lineSlope = li.spl[1]! - li.spl[0]!;
  assert.ok(Math.abs(slope - lineSlope) < 0.3, `frame ${slope.toFixed(2)} vs a line with its mouth a metre away ${lineSlope.toFixed(2)} dB/oct`);
  assert.deepEqual(ob.summary.ob, fr);
  assert.ok(fr.fPeak > 0 && fr.fNull > fr.fPeak);
  assert.equal(ob.parts, null);
  assert.equal(ob.summary.fb, undefined);
});

test("frames: the duct's own resonance sits at the quarter-wave readout", () => {
  for (const frame of ["u", "h"] as const) {
    const b: OpenBaffleInput = { kind: "open-baffle", frame, w_cm: 40, h_cm: 90, depth_cm: 45 };
    const g = openBaffleGeometry(b);
    const net = lineNetwork(g.rearLine!, air);
    const fq = openBaffleFrequencies(b, air).fQuarter!;
    // The mouth's flow per cone flow peaks where the duct resonates.
    let best = 0;
    let fBest = 0;
    for (let f = fq / 2; f < fq * 2; f *= 1.001) {
      const m = abs(net.exitPerCone(TAU * f));
      if (m > best) [best, fBest] = [m, f];
    }
    assert.ok(Math.abs(fBest / fq - 1) < 0.002, `${frame}: duct peak ${fBest.toFixed(1)} Hz vs readout ${fq.toFixed(1)} Hz`);
  }
});

test("H-frame: front and rear ducts load the cone (Fs falls, as builders measure) and both mouths radiate", () => {
  const flat = simulate(DRV, { kind: "open-baffle", w_cm: 46, h_cm: 46 }, { air });
  const h = simulate(DRV, { kind: "open-baffle", frame: "h", w_cm: 46, h_cm: 46, depth_cm: 50 }, { air });
  const peak = (r: typeof flat) => {
    let k = 0;
    for (let i = 0; i < r.freq.length && r.freq[i]! < 150; i++) if (r.impedanceOhm[i]! > r.impedanceOhm[k]!) k = i;
    return r.freq[k]!;
  };
  assert.ok(peak(h) < peak(flat), `H-frame impedance peak ${peak(h)} Hz below the plain board's ${peak(flat)} Hz`);
  assert.ok(h.spl.every(Number.isFinite));
  // Deeper frame, longer path: more bass than the flat board of the same face.
  const i30 = h.freq.findIndex((f) => f >= 30);
  assert.ok(h.spl[i30]! > flat.spl[i30]! + 3, `H-frame at 30 Hz ${h.spl[i30]} vs flat ${flat.spl[i30]}`);
});

test("open baffle: excursion-limited output is the dipole's, at the IB's cone travel", () => {
  const fs = [20, 40];
  const ob = simulate(DRV, { kind: "open-baffle", w_cm: 50, h_cm: 100, y_cm: 35 }, { frequencies: fs, air, power: 100 });
  const ib = simulate(DRV, { kind: "infinite-baffle" }, { frequencies: fs, air, power: 100 });
  fs.forEach((_, i) => {
    assert.equal(ob.limitedBy[i], ib.limitedBy[i]);
    assert.ok(Math.abs(ob.maxPowerW[i]! - ib.maxPowerW[i]!) < 1e-9 * ib.maxPowerW[i]!);
    assert.ok(Math.abs(ob.maxSpl[i]! - ob.spl[i]! - (ib.maxSpl[i]! - ib.spl[i]!)) < 1e-9);
  });
});

test("open baffle: bad geometry is refused", () => {
  assert.throws(() => simulate(DRV, { kind: "open-baffle", w_cm: 40, h_cm: 0 }), /width and a height/);
  assert.throws(() => simulate(DRV, { kind: "open-baffle", w_cm: 40, h_cm: 80, x_cm: 45 }), /on the baffle/);
  assert.throws(() => simulate(DRV, { kind: "open-baffle", frame: "u", w_cm: 40, h_cm: 80, depth_cm: 1 }), /deeper than the board/);
  assert.throws(() => simulate(DRV, { kind: "open-baffle", frame: "h", w_cm: 3, h_cm: 80, depth_cm: 30 }), /walls fill it/);
});
