import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { simulate } from "../src/simulate.ts";
import { lineNetwork, pathHd2, type LineInput, type ProfilePoint } from "../src/line.ts";
import { AIR_BETA, AIR_GAMMA, STANDARD_AIR } from "../src/constants.ts";
import { cx } from "../src/complex.ts";
import type { DriverInput } from "../src/model.ts";

// Air distortion along a line or horn (weak-shock 2nd harmonic): closed forms, the engine, and
// Thuras, Jenkins & O'Neil (1935), the classic measurements in a long tube and an exponential horn.

const air = STANDARD_AIR;
const dB = (v: number) => 20 * Math.log10(v);
const K = (f: number) => (AIR_BETA * 2 * Math.PI * f) / (2 * air.rho * air.c ** 3);

/** A profile of n slices from 0 to L with pressure magnitude g(x) per unit flow. */
function profile(L: number, g: (x: number) => number, n = 400): ProfilePoint[] {
  return Array.from({ length: n + 1 }, (_, i) => {
    const x = (L * i) / n;
    return { x, area: 1, p: cx(g(x)), u: cx(0), port: false };
  });
}

test("path HD2: uniform, exponential and conical closed forms", () => {
  const prms = 632.456; // 150 dB
  const w = 2 * Math.PI * 100;
  const uni = pathHd2(profile(1, () => 1), 0, prms, w, air);
  assert.ok(Math.abs(uni * 100 - 0.6928) < 0.001, `uniform ${uni * 100}`);
  // Exponential horn, area ×4 over 1 m: p ∝ e^(−mx/2); Thuras eq. 20.
  const m = Math.log(4);
  const exp = pathHd2(profile(1, (x) => Math.exp((-m * x) / 2)), 0, prms, w, air);
  assert.ok(Math.abs(exp * 100 - 0.4997) < 0.001, `exponential ${exp * 100}`);
  // Conical, apex x0 = 0.2 m behind the throat: p ∝ x0/(x + x0).
  const x0 = 0.2;
  const con = pathHd2(profile(1, (x) => x0 / (x + x0), 2000), 0, prms, w, air);
  const conExact = K(100) * Math.SQRT2 * prms * x0 * Math.log((1 + x0) / x0);
  assert.ok(Math.abs(con / conExact - 1) < 1e-4, `conical ${con} vs ${conExact}`);
  // Finer slices barely move it.
  const coarse = pathHd2(profile(1, (x) => x0 / (x + x0), 200), 0, prms, w, air);
  assert.ok(Math.abs(coarse / con - 1) < 1e-3);
  // Points before xFrom (an offset driver's stub) are left out.
  const half = pathHd2(profile(1, () => 1), 0.5, prms, w, air);
  assert.ok(Math.abs(half / uni - 0.5) < 1e-9);
});

// Kirchhoff's wall loss in a narrow tube (Thuras' theory includes it): the fundamental decays
// as e^(−αx), its 2nd harmonic as e^(−√2·αx). Folded into the profile so pathHd2 integrates it.
function tubeHd2(f: number, prms: number, x: number, radius: number): number {
  const w = 2 * Math.PI * f;
  const nu = 1.51e-5;
  const pr = 0.71;
  const alpha = ((1 + (AIR_GAMMA - 1) / Math.sqrt(pr)) * Math.sqrt((w * nu) / 2)) / (radius * air.c);
  const a2 = Math.SQRT2 * alpha;
  const g = (s: number) => Math.exp(-2 * alpha * s - a2 * (x - s) + alpha * x);
  return pathHd2(profile(x, g, 2000), 0, prms, w, air);
}

const thuras = JSON.parse(readFileSync(new URL("./fixtures/thuras1935.json", import.meta.url), "utf8"));

test("Thuras 1935, tube: matches the paper's theory curves (Figs. 3–5)", () => {
  const r = thuras.tube.diameter_m / 2;
  for (const c of thuras.tube.theory) {
    const ours = dB(tubeHd2(c.f, c.p_pa, c.x_m, r));
    assert.ok(Math.abs(ours - c.db) <= 0.7, `Fig. ${c.fig} ${c.f} Hz ${c.p_pa} Pa ${c.x_m} m: ${ours.toFixed(2)} vs ${c.db}`);
  }
});

test("Thuras 1935, tube: measurements sit about 3 dB under, as the paper says", () => {
  const r = thuras.tube.diameter_m / 2;
  const d: number[] = thuras.tube.measured.map((c: { f: number; p_pa: number; x_m: number; db: number }) => c.db - dB(tubeHd2(c.f, c.p_pa, c.x_m, r)));
  const mean = d.reduce((a, b) => a + b, 0) / d.length;
  assert.ok(mean >= -4 && mean <= -2.5, `mean ${mean}`);
  for (const v of d) assert.ok(Math.abs(v + 3) <= 2.5, `point ${v}`);
});

/** Thuras' horn as a line: 13 cm tube, then the exponential horn; driven at the given acoustic power. */
function hornHd2(f: number, watts: number): number {
  const h = thuras.horn;
  const s0 = Math.PI * (h.throatDiameter_m / 2) ** 2 * 1e4; // cm²
  const line: LineInput = {
    kind: "line",
    driverAt_cm: 0,
    segments: [
      { length_cm: h.tube_m * 100, startArea_cm2: s0, endArea_cm2: s0 },
      { length_cm: h.length_m * 100, startArea_cm2: s0, endArea_cm2: s0 * Math.exp(h.m_per_m * h.length_m), taper: "exponential" },
    ],
  };
  const net = lineNetwork(line, air);
  const w = 2 * Math.PI * f;
  const pts = net.profile(w);
  const z = pts.find((p) => p.x === 0)!.p; // throat impedance for unit flow
  const u = Math.sqrt(watts / z.re); // rms flow that puts this power in
  return pathHd2(pts, net.sourceX, u, w, air);
}

test("Thuras 1935, horn: matches the measurements (Fig. 7)", () => {
  const d: number[] = thuras.horn.fig7.map((c: { f: number; w: number; db: number }) => c.db - dB(hornHd2(c.f, c.w)));
  const mean = d.reduce((a, b) => a + Math.abs(b), 0) / d.length;
  assert.ok(mean <= 0.6, `mean |Δ| ${mean}`);
  for (const v of d) assert.ok(Math.abs(v) <= 1.5, `point ${v}`);
});

// A tapped horn and an offset-driver line through the whole engine.
const DRV: DriverInput = { fs: 30, qms: 5.2, qes: 0.4, vas_l: 50, re: 3.4, sd_cm2: 330, le_mh: 0.5, xmax_mm: 12, pe_w: 600 };
const TH: LineInput = {
  kind: "line",
  driverAt_cm: 20,
  tap_cm: 120,
  segments: [
    { length_cm: 100, startArea_cm2: 300, endArea_cm2: 600 },
    { length_cm: 150, startArea_cm2: 600, endArea_cm2: 1800 },
  ],
};

test("path HD2 in the engine: scales with drive, sets the limit, at-max equals the limit", () => {
  const opts = { power: 1, points: 120, airDistortion: { threshold: 0.02, limit: true } };
  const a = simulate(DRV, TH, opts);
  const b = simulate(DRV, TH, { ...opts, power: 4 });
  assert.equal(a.airModel, "path");
  let hits = 0;
  for (let i = 0; i < a.freq.length; i++) {
    assert.ok(Number.isFinite(a.airHd2![i]!) && a.airHd2![i]! > 0);
    assert.ok(Math.abs(b.airHd2![i]! / a.airHd2![i]! - 2) < 1e-6); // HD2 ∝ voltage
    if (a.limitedBy[i] === "air") hits++, assert.ok(Math.abs(a.airHd2AtMax![i]! - 2) < 1e-6);
  }
  assert.ok(hits > 0, "the limit should bind somewhere at this drive");
  // Off: nothing changes and nothing is filled.
  const off = simulate(DRV, TH, { points: 120 });
  const on = simulate(DRV, TH, { points: 120, airDistortion: { threshold: 0.1, limit: false } });
  assert.equal(off.airHd2, null);
  assert.equal(off.airModel, null);
  assert.deepEqual(on.spl, off.spl);
  assert.deepEqual(on.maxSpl, off.maxSpl);
  assert.deepEqual(on.limitedBy, off.limitedBy);
});

test("path HD2 in the engine: an offset driver's stub behind is not on the path", () => {
  const tl: LineInput = { kind: "line", driverAt_cm: 60, segments: [{ length_cm: 240, startArea_cm2: 500, endArea_cm2: 500 }] };
  const f = 80;
  const r = simulate(DRV, tl, { power: 50, fMin: f, fMax: f * 1.0001, points: 2, airDistortion: { threshold: 0.1, limit: false } });
  const net = lineNetwork(tl, air);
  assert.equal(net.sourceX, 0.6);
  const w = 2 * Math.PI * f;
  // Rebuild the cone flow from the excursion (peak, one-way) and integrate from the driver on.
  const u = (2 * Math.PI * f * (r.excursionMm[0]! / 1000) * DRV.sd_cm2) / 1e4 / Math.SQRT2;
  const pts = net.profile(w);
  const fromDriver = pathHd2(pts, 0.6, u, w, air) * 100;
  const whole = pathHd2(pts, 0, u, w, air) * 100;
  assert.ok(Math.abs(r.airHd2![0]! / fromDriver - 1) < 1e-3, `${r.airHd2![0]} vs ${fromDriver}`);
  assert.ok(whole > fromDriver);
});
