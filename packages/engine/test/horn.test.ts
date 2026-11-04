import { test } from "node:test";
import assert from "node:assert/strict";
import { lineNetwork, type LineInput } from "../src/line.ts";
import { simulate } from "../src/simulate.ts";
import { STANDARD_AIR } from "../src/constants.ts";

// Textbook results the 1D duct model must reproduce (Olson, Kinsler & Frey, Beranek).
const { rho, c } = STANDARD_AIR;
const w = (f: number) => 2 * Math.PI * f;

test("exponential horn: throat resistance follows the infinite-horn result above cutoff, ~0 below", () => {
  const S1 = 100; // cm²
  const fc = 100;
  const m = (4 * Math.PI * fc) / c; // flare constant: S = S1·e^{mx}
  const L = 200; // cm
  const S2 = S1 * Math.exp((m * L) / 100);
  const horn: LineInput = { kind: "line", segments: [{ length_cm: L, startArea_cm2: S1, endArea_cm2: S2, taper: "exponential" }], driverAt_cm: 0 };
  const n = lineNetwork(horn);
  const z0 = (rho * c) / (S1 / 1e4);
  // A finite horn ripples (the mouth reflects some of the wave): average over one ripple
  // period, c / 2L, to compare with the infinite horn.
  const period = c / (2 * (L / 100));
  for (const f of [200, 300, 500]) {
    let sum = 0;
    let want = 0;
    const K = 40;
    for (let k = 0; k < K; k++) {
      const fk = f + period * (k / K - 0.5);
      sum += n.zLoad(w(fk)).re / z0;
      want += Math.sqrt(1 - (fc / fk) ** 2);
    }
    const got = sum / K;
    want /= K;
    assert.ok(Math.abs(got / want - 1) < 0.1, `${f} Hz: ${got.toFixed(3)} vs ${want.toFixed(3)}`);
  }
  const below = n.zLoad(w(50));
  assert.ok(below.re / z0 < 0.15, `below cutoff: ${(below.re / z0).toFixed(3)}`);
  assert.ok(below.im > 0, "below cutoff the throat looks like a mass");
});

test("conical horn: throat impedance follows the infinite-cone result jkx₀/(1 + jkx₀)", () => {
  const S1 = 100;
  const x0 = 0.5; // m from the apex to the throat
  const x2 = 3;
  const S2 = S1 * (x2 / x0) ** 2;
  const horn: LineInput = { kind: "line", segments: [{ length_cm: (x2 - x0) * 100, startArea_cm2: S1, endArea_cm2: S2, taper: "conical" }], driverAt_cm: 0 };
  const n = lineNetwork(horn);
  const z0 = (rho * c) / (S1 / 1e4);
  for (const f of [300, 500, 800]) {
    let re = 0;
    let im = 0;
    for (let k = -4; k <= 4; k++) {
      const z = n.zLoad(w(f * (1 + k / 40)));
      re += z.re / z0 / 9;
      im += z.im / z0 / 9;
    }
    const kx = (w(f) / c) * x0;
    const wantRe = (kx * kx) / (1 + kx * kx);
    const wantIm = kx / (1 + kx * kx);
    assert.ok(Math.abs(re - wantRe) < 0.06, `${f} Hz re ${re.toFixed(3)} vs ${wantRe.toFixed(3)}`);
    assert.ok(Math.abs(im - wantIm) < 0.06, `${f} Hz im ${im.toFixed(3)} vs ${wantIm.toFixed(3)}`);
  }
});

test("TQWT (cone closed at its narrow end): fundamental at tan kL = −k·x₁", () => {
  const S1 = 30;
  const x1 = 0.4; // m, apex to the closed end
  const L = 1.6; // m
  const S2 = S1 * ((x1 + L) / x1) ** 2;
  const line: LineInput = { kind: "line", segments: [{ length_cm: L * 100, startArea_cm2: S1, endArea_cm2: S2, taper: "conical" }], driverAt_cm: 0 };
  const n = lineNetwork(line);
  // Resonance: the peak of mouth flow per unit cone flow.
  let fPeak = 0;
  let best = 0;
  for (let f = 20; f <= 200; f += 0.05) {
    const u = n.exitPerCone(w(f));
    const g = Math.hypot(u.re, u.im);
    if (g > best) {
      best = g;
      fPeak = f;
    }
  }
  // Analytic, with the baffled-piston end correction 8a/3π added to the length.
  const a = Math.sqrt(S2 / 1e4 / Math.PI);
  const Le = L + (8 * a) / (3 * Math.PI);
  let lo = 1;
  let hi = 2 * Math.PI;
  const g = (k: number) => k * Le - (Math.PI - Math.atan(k * x1));
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (g(mid) > 0) hi = mid;
    else lo = mid;
  }
  const fWant = ((lo + hi) / 2) * (c / (2 * Math.PI));
  assert.ok(Math.abs(fPeak / fWant - 1) < 0.03, `${fPeak.toFixed(1)} vs ${fWant.toFixed(1)} Hz`);
});

const D = { fs: 35, qms: 5, qes: 0.35, vas_l: 60, re: 6, sd_cm2: 500, xmax_mm: 8, pe_w: 300 };
const OPT = { power: 1, fMin: 20, fMax: 1000, points: 400 };
const at = (r: { freq: Float64Array }, f: number) => {
  let i = 0;
  while (r.freq[i]! < f) i++;
  return i;
};

test("front-loaded horn: horn gain in band, less excursion, throat chamber rolls off the top", () => {
  const S1 = 250;
  const fc = 60;
  const m = (4 * Math.PI * fc) / c;
  const L = 300;
  const S2 = S1 * Math.exp((m * L) / 100);
  const seg = { length_cm: L, startArea_cm2: S1, endArea_cm2: S2, taper: "exponential" as const };
  const flh: LineInput = { kind: "line", segments: [seg], driverAt_cm: 0, frontLoaded: { rear_l: 60, throat_l: 0 } };
  const r = simulate(D, flh, OPT);
  assert.equal(r.parts, null);
  const sealed = simulate(D, { kind: "sealed", vb_l: 60 }, OPT);
  const i = at(r, 200);
  assert.ok(r.spl[i]! > sealed.spl[i]! + 6, `horn gain at 200 Hz: ${(r.spl[i]! - sealed.spl[i]!).toFixed(1)} dB`);
  assert.ok(r.excursionMm[i]! < sealed.excursionMm[i]!, "the horn loads the cone");
  // A throat chamber is a low-pass with the throat resistance: f ≈ S1·c / (2π·Vtc).
  const vtc = 2; // L
  const fHi = ((S1 / 1e4) * c) / (2 * Math.PI * (vtc / 1000));
  const withTc = simulate(D, { ...flh, frontLoaded: { rear_l: 60, throat_l: vtc } }, OPT);
  const j = at(r, Math.min(900, 3 * fHi));
  assert.ok(withTc.spl[j]! < r.spl[j]! - 4, `throat chamber cut at ${r.freq[j]!.toFixed(0)} Hz: ${(r.spl[j]! - withTc.spl[j]!).toFixed(1)} dB`);
  const k = at(r, fHi / 3);
  assert.ok(Math.abs(withTc.spl[k]! - r.spl[k]!) < 1.5, "little change well below it");
});
