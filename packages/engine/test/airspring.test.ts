import { test } from "node:test";
import assert from "node:assert/strict";
import { simulate } from "../src/simulate.ts";
import { driverModel, passiveRadiatorModel, type DriverInput, type PassiveRadiatorInput } from "../src/model.ts";
import { AIR_GAMMA, STANDARD_AIR } from "../src/constants.ts";
import type { LineInput } from "../src/line.ts";

// Air distortion of a box's air spring: the engine's 2nd-order perturbation against a direct
// time-domain solution of the nonlinear equations (polytropic air, P·Vⁿ = const).

// A 10" driver, no coil inductance and a lossless box, so the ODE below is the engine's own model.
const DRV: DriverInput = { fs: 30, qms: 5.2, qes: 0.4, vas_l: 50, re: 3.4, sd_cm2: 330, le_mh: 0, xmax_mm: 12, pe_w: 300 };
const PR: PassiveRadiatorInput = { mms_g: 180, sd_cm2: 500, vas_l: 60, qms: 6, xmax_mm: 25 };
const LOSSLESS = { ql: Infinity, qa: Infinity };
const air = STANDARD_AIR;
const rhoC2 = air.rho * air.c * air.c;
const P0 = rhoC2 / AIR_GAMMA;

/** Radiated HD2 (fraction) and peak ΔV/Vb from integrating the nonlinear system to steady state (RK4). */
function odeHd2(f: number, volts: number, vb_l: number, pr: PassiveRadiatorInput | null): { hd2: number; c: number } {
  const d = driverModel(DRV, air);
  const p = pr ? passiveRadiatorModel(pr, 0, air) : null;
  const vb = vb_l / 1000;
  const w = 2 * Math.PI * f;
  const steps = 256; // per cycle
  const cycles = 80;
  const keep = 20;
  const h = 1 / f / steps;
  // State: cone x (in = +), v; PR xp (out = +), vp.
  const deriv = (t: number, y: number[]) => {
    const [x, v, xp, vp] = y as [number, number, number, number];
    const dV = d.sd * x - (p ? p.sd * xp : 0);
    const pb = P0 * ((1 - dV / vb) ** -AIR_GAMMA - 1);
    const i = (Math.SQRT2 * volts * Math.sin(w * t) - d.bl * v) / d.re; // volts are RMS
    const a = (d.bl * i - d.rms * v - x / d.cms - d.sd * pb) / d.mms;
    const ap = p ? (p.sd * pb - p.rmp * vp - xp / p.cmp) / p.mmp : 0;
    return [v, a, vp, ap];
  };
  let y = [0, 0, 0, 0];
  const n = keep * steps;
  const q = new Float64Array(n); // radiated volume acceleration (out = +)
  let cMax = 0;
  for (let k = 0; k < cycles * steps; k++) {
    const t = k * h;
    const k1 = deriv(t, y);
    const k2 = deriv(t + h / 2, y.map((v, j) => v + (h / 2) * k1[j]!));
    const k3 = deriv(t + h / 2, y.map((v, j) => v + (h / 2) * k2[j]!));
    const k4 = deriv(t + h, y.map((v, j) => v + h * k3[j]!));
    y = y.map((v, j) => v + (h / 6) * (k1[j]! + 2 * k2[j]! + 2 * k3[j]! + k4[j]!));
    const m = k - (cycles - keep) * steps;
    if (m >= 0) {
      const a = deriv(t + h, y);
      q[m] = -d.sd * a[1]! + (p ? p.sd * a[3]! : 0);
      cMax = Math.max(cMax, Math.abs(d.sd * y[0]! - (p ? p.sd * y[2]! : 0)) / vb);
    }
  }
  const bin = (k: number) => {
    let re = 0;
    let im = 0;
    for (let m = 0; m < n; m++) {
      re += q[m]! * Math.cos((2 * Math.PI * k * m) / n);
      im -= q[m]! * Math.sin((2 * Math.PI * k * m) / n);
    }
    return Math.hypot(re, im);
  };
  return { hd2: bin(2 * keep) / bin(keep), c: cMax };
}

const AIR_ON = { airDistortion: { threshold: 0.1, limit: false } };
const near = (f: Float64Array, hz: number) => f.findIndex((v) => v >= hz);

test("air distortion: off by default, and on without the limit changes nothing else", () => {
  const box = { kind: "vented" as const, vb_l: 30, port: { shape: "round" as const, diameter_cm: 7, length_cm: 20 } };
  const off = simulate(DRV, box, { power: 100 });
  const on = simulate(DRV, box, { power: 100, ...AIR_ON });
  assert.equal(off.airHd2, null);
  assert.equal(off.airHd2AtMax, null);
  assert.equal(off.airCompression, null);
  assert.deepEqual(on.spl, off.spl);
  assert.deepEqual(on.maxSpl, off.maxSpl);
  assert.deepEqual(on.excursionMm, off.excursionMm);
  assert.deepEqual(on.limitedBy, off.limitedBy);
  assert.ok(on.airHd2!.every((v) => Number.isFinite(v) && v >= 0));
  assert.equal(on.airModel, "spring");
  // Lines use the along-the-path model instead (airpath.test.ts): no box air to squeeze.
  const tl: LineInput = { kind: "line", segments: [{ length_cm: 200, startArea_cm2: 400, endArea_cm2: 400 }], driverAt_cm: 0 };
  const line = simulate(DRV, tl, { ...AIR_ON });
  assert.equal(line.airModel, "path");
  assert.ok(line.airCompression!.every((v) => Number.isNaN(v)));
});

test("air distortion, sealed: matches the nonlinear ODE and the closed form", () => {
  const vb_l = 10;
  const freqs = [15, 20, 30, 45, 70, 100];
  const r = simulate(DRV, { kind: "sealed", vb_l, ...LOSSLESS }, { power: 50, frequencies: freqs, ...AIR_ON });
  const d = driverModel(DRV, air);
  const vb = vb_l / 1000;
  const kt = 1 / d.cms + (rhoC2 * d.sd * d.sd) / vb;
  const kb = (rhoC2 * d.sd * d.sd) / vb;
  const R = d.rms + (d.bl * d.bl) / d.re;
  freqs.forEach((f, i) => {
    const ode = odeHd2(f, r.summary.volts, vb_l, null);
    const eng = r.airHd2![i]! / 100;
    assert.ok(Math.abs(eng / ode.hd2 - 1) < 0.01, `${f} Hz: engine ${eng} vs ODE ${ode.hd2}`);
    assert.ok(Math.abs(r.airCompression![i]! / ode.c - 1) < 0.02, `${f} Hz compression ${r.airCompression![i]} vs ${ode.c}`);
    // Closed form: HD2 = (γ+1)·(Sd·X₁/Vb)·kb/|kt − (2ω)²M + j2ωR|.
    const w2 = 4 * Math.PI * f;
    const x1 = r.excursionMm[i]! / 1000;
    const closed = ((AIR_GAMMA + 1) * ((d.sd * x1) / vb) * kb) / Math.hypot(kt - w2 * w2 * d.mms, w2 * R);
    assert.ok(Math.abs(eng / closed - 1) < 0.005, `${f} Hz: engine ${eng} vs closed form ${closed}`);
  });
});

test("air distortion, passive radiator: matches the nonlinear ODE across the tuning", () => {
  const vb_l = 15;
  const freqs = [12, 18, 25, 32, 40, 55, 80];
  const r = simulate(DRV, { kind: "passive-radiator", vb_l, pr: PR, ...LOSSLESS }, { power: 30, frequencies: freqs, ...AIR_ON });
  freqs.forEach((f, i) => {
    const ode = odeHd2(f, r.summary.volts, vb_l, PR);
    const eng = r.airHd2![i]! / 100;
    // The perturbation reads slightly high as compression grows (0.7 % at ΔV/Vb = 0.1).
    const tol = ode.c < 0.05 ? 0.01 : 0.03;
    assert.ok(Math.abs(eng / ode.hd2 - 1) < tol, `${f} Hz (ΔV/Vb ${ode.c.toFixed(3)}): engine ${eng} vs ODE ${ode.hd2}`);
  });
});

test("air distortion grows with √power, scales with n(n+1), and sets max SPL at its threshold", () => {
  const box = { kind: "sealed" as const, vb_l: 12 };
  const opts = { fMin: 15, fMax: 200, points: 60 };
  const a = simulate(DRV, box, { power: 10, ...opts, ...AIR_ON });
  const b = simulate(DRV, box, { power: 40, ...opts, ...AIR_ON });
  const c = simulate(DRV, box, { power: 10, ...opts, airDistortion: { threshold: 0.1, limit: false, n: 1 } });
  for (let i = 0; i < a.freq.length; i++) {
    assert.ok(Math.abs(b.airHd2![i]! / a.airHd2![i]! - 2) < 1e-9);
    assert.ok(Math.abs(c.airHd2![i]! / a.airHd2![i]! - 2 / (1.4 * 2.4)) < 1e-9);
    // At max SPL: the same HD2 scaled to that drive.
    assert.ok(Math.abs(a.airHd2AtMax![i]! - a.airHd2![i]! * Math.sqrt(a.maxPowerW[i]! / 10)) < 1e-9 * a.airHd2AtMax![i]!);
  }
  // A tight threshold takes over the max-SPL limit somewhere, and there HD2 at max equals it.
  const lim = simulate(DRV, box, { power: 10, ...opts, airDistortion: { threshold: 0.02, limit: true } });
  const i = lim.limitedBy.indexOf("air");
  assert.ok(i >= 0, "air limit never reached");
  assert.ok(Math.abs(lim.airHd2AtMax![i]! - 2) < 1e-9);
  assert.ok(lim.maxSpl[i]! < a.maxSpl[i]!);
});

test("air distortion, bandpass with a transparent front chamber = the sealed box", () => {
  const port = { shape: "round" as const, diameter_cm: 2000, length_cm: 0 };
  const open = { vb_l: 0.01, port, ql: Infinity, qa: Infinity, qp: Infinity };
  const opts = { power: 50, fMin: 15, fMax: 150, points: 40, ...AIR_ON };
  const bp = simulate(DRV, { kind: "bandpass", rear: { vb_l: 15, ...LOSSLESS }, front: open, qicl: Infinity }, opts);
  const sealed = simulate(DRV, { kind: "sealed", vb_l: 15, ...LOSSLESS }, opts);
  const i20 = near(bp.freq, 20);
  for (let i = 0; i < bp.freq.length; i++) {
    assert.ok(Math.abs(bp.airHd2![i]! / sealed.airHd2![i]! - 1) < 0.01, `${bp.freq[i]} Hz: ${bp.airHd2![i]} vs ${sealed.airHd2![i]}`);
  }
  assert.ok(bp.airHd2![i20]! > 0.1);
});
