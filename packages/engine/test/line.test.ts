import { test } from "node:test";
import assert from "node:assert/strict";
import { baffledPistonImpedance, lineNetwork, type LineInput } from "../src/line.ts";
import { simulate } from "../src/simulate.ts";
import { ventedFb } from "../src/model.ts";

const D = { fs: 40, qms: 4, qes: 0.45, vas_l: 30, re: 5.5, sd_cm2: 130, xmax_mm: 6, pe_w: 60 };
const OPT = { power: 1, fMin: 10, fMax: 1000, points: 500 };
const L = 150;
const S = 150;
const TL: LineInput = { kind: "line", segments: [{ length_cm: L, startArea_cm2: S, endArea_cm2: S }], driverAt_cm: 0 };
const A = Math.sqrt(S / 1e4 / Math.PI);
const FQ = 343.2 / (4 * (L / 100 + (8 / (3 * Math.PI)) * A)); // quarter wave with the baffled-piston end correction

/** |U mouth / U cone| at f. */
function gain(line: LineInput, f: number): number {
  const n = lineNetwork(line);
  const w = 2 * Math.PI * f;
  const u = n.mouthFlow(w, n.zLoad(w)); // unit cone flow into the line
  return Math.hypot(u.re, u.im);
}

test("baffled piston: low-frequency limits (end correction 8a/3π, resistance (ka)²/2)", () => {
  const area = 0.01;
  const a = Math.sqrt(area / Math.PI);
  const w = 2 * Math.PI * 20;
  const z = baffledPistonImpedance(area, w);
  const z0 = (1.2041 * 343.2) / area;
  const ka = (w * a) / 343.2;
  assert.ok(Math.abs(z.im / z0 / ((8 * ka) / (3 * Math.PI)) - 1) < 0.01, "reactance");
  assert.ok(Math.abs(z.re / z0 / ((ka * ka) / 2) - 1) < 0.02, "resistance");
  // High frequency: resistance → ρc/S.
  const zh = baffledPistonImpedance(area, 2 * Math.PI * 20000);
  assert.ok(Math.abs(zh.re / z0 - 1) < 0.1);
});

test("a straight line driven at its closed end tunes to its quarter wave", () => {
  const r = simulate(D, TL, OPT);
  assert.ok(Math.abs(r.summary.fb! / FQ - 1) < 0.02, `${r.summary.fb} vs ${FQ}`);
  // The mouth does most of the work at the quarter wave, almost nothing at the half wave.
  assert.ok(gain(TL, FQ) > 50);
  assert.ok(gain(TL, 2 * FQ) < 1.5);
});

test("tapered pieces converge as slices get finer, and a uniform piece needs no slicing", () => {
  const taper: LineInput = { kind: "line", segments: [{ length_cm: 160, startArea_cm2: 300, endArea_cm2: 80, taper: "linear" }], driverAt_cm: 0 };
  const a = lineNetwork(taper).zLoad(2 * Math.PI * 70);
  // Same taper split into two pieces gives the same impedance.
  const split: LineInput = {
    kind: "line",
    segments: [
      { length_cm: 80, startArea_cm2: 300, endArea_cm2: 190, taper: "linear" },
      { length_cm: 80, startArea_cm2: 190, endArea_cm2: 80, taper: "linear" },
    ],
    driverAt_cm: 0,
  };
  const b = lineNetwork(split).zLoad(2 * Math.PI * 70);
  assert.ok(Math.hypot(a.re - b.re, a.im - b.im) / Math.hypot(a.re, a.im) < 0.01);
  assert.equal(Math.round(lineNetwork(taper).volume_l), Math.round(((300 + 80) / 2) * 160 / 1000));
});

test("offset driver: at L/3 it suppresses the 3rd quarter-wave resonance, at L/5 the 5th", () => {
  assert.ok(gain({ ...TL, driverAt_cm: L / 3 }, 3 * FQ) < gain(TL, 3 * FQ) / 5);
  assert.ok(gain({ ...TL, driverAt_cm: L / 5 }, 5 * FQ) < gain(TL, 5 * FQ) / 5);
});

test("stuffing tames the ripple above the tuning", () => {
  const spread = (line: LineInput) => {
    const r = simulate(D, line, OPT);
    let lo = Infinity;
    let hi = -Infinity;
    for (let i = 0; i < r.freq.length; i++) {
      if (r.freq[i]! < 150 || r.freq[i]! > 800) continue;
      lo = Math.min(lo, r.spl[i]!);
      hi = Math.max(hi, r.spl[i]!);
    }
    return hi - lo;
  };
  const empty = spread(TL);
  const stuffed = spread({ ...TL, segments: [{ ...TL.segments[0]!, fill_kgm3: 8 }] });
  assert.ok(stuffed < empty / 3, `${stuffed} vs ${empty}`);
  assert.ok(stuffed < 12);
});

test("a short wide line with a port behaves like a ported box of the same volume (mass-loaded limit)", () => {
  const ml: LineInput = {
    kind: "line",
    segments: [{ length_cm: 30, startArea_cm2: 1000, endArea_cm2: 1000 }],
    driverAt_cm: 0,
    port: { shape: "round", diameter_cm: 7, length_cm: 15 },
  };
  const net = lineNetwork(ml);
  const r = simulate(D, ml, OPT);
  const fb = ventedFb(net.volume_l, ml.port!);
  assert.ok(Math.abs(r.summary.fb! / fb - 1) < 0.07, `${r.summary.fb} vs ${fb}`);
  assert.ok(r.portVelocity !== null);
});

test("bad lines are refused", () => {
  assert.throws(() => lineNetwork({ kind: "line", segments: [], driverAt_cm: 0 }));
  assert.throws(() => lineNetwork({ ...TL, driverAt_cm: 200 }));
  assert.throws(() => lineNetwork({ kind: "line", segments: [{ length_cm: 100, startArea_cm2: 0, endArea_cm2: 100 }], driverAt_cm: 0 }));
});

test("tapped horn: front and rear cancel at very low frequencies, the horn works at its resonance", () => {
  const th: LineInput = { kind: "line", segments: [{ length_cm: 250, startArea_cm2: 150, endArea_cm2: 600 }], driverAt_cm: 0, tap_cm: 110 };
  const n = lineNetwork(th);
  assert.equal(n.tapped, true);
  const g = (f: number) => {
    const u = n.exitPerCone(2 * Math.PI * f);
    return Math.hypot(u.re, u.im);
  };
  assert.ok(g(3) < 0.2, `low ${g(3)}`);
  let best = 0;
  for (let f = 20; f < 120; f += 0.5) best = Math.max(best, g(f));
  assert.ok(best > 2, `peak ${best}`);
  const r = simulate(D, th, OPT);
  assert.ok(r.spl.every((v) => Number.isFinite(v)));
  // The front of the cone is inside the horn: nothing radiates at DC-ish frequencies.
  assert.ok(r.spl[0]! < r.summary.referenceSpl - 20);
  assert.throws(() => lineNetwork({ ...th, tap_cm: 260 }));
  assert.throws(() => lineNetwork({ ...th, driverAt_cm: 120 }));
});

test("mouth distance: same bass, different where the extra path is half a wavelength", () => {
  const near = simulate(D, TL, OPT);
  const far = simulate(D, { ...TL, mouthDistance_cm: 40 }, OPT);
  const at = (r: typeof near, f: number) => {
    let i = 0;
    while (r.freq[i]! < f) i++;
    return r.spl[i]!;
  };
  assert.ok(Math.abs(at(near, 20) - at(far, 20)) < 0.5);
  let diff = 0;
  for (let i = 0; i < near.freq.length; i++) if (near.freq[i]! > 300 && near.freq[i]! < 600) diff = Math.max(diff, Math.abs(near.spl[i]! - far.spl[i]!));
  assert.ok(diff > 2, `${diff}`);
});

test("MLTL port: a flare lowers the air speed at its mouth; compression costs output at high power", () => {
  const ml: LineInput = {
    kind: "line",
    segments: [{ length_cm: 80, startArea_cm2: 170, endArea_cm2: 170 }],
    driverAt_cm: 20,
    port: { shape: "round", diameter_cm: 5, length_cm: 20 },
  };
  const peak = (r: ReturnType<typeof simulate>) => Math.max(...r.portVelocity!);
  const straight = simulate(D, ml, { ...OPT, power: 50 });
  const flared = simulate(D, { ...ml, port: { shape: "round", diameter_cm: 5, length_cm: 20, flare_cm: 1.5 } }, { ...OPT, power: 50 });
  assert.ok(peak(flared) < peak(straight));
  const c = simulate(D, ml, { ...OPT, power: 50, portCompression: true });
  assert.ok(c.summary.portCompression!.db > 0.3, `${c.summary.portCompression!.db}`);
  assert.equal(simulate(D, ml, { ...OPT, power: 50 }).summary.portCompression, undefined);
});

test("a stuffed line whose lower impedance peak is damped away still has a tuning (the shoulder)", () => {
  // Same driver and line as the classic TL in the app, stuffed for two thirds.
  const d = { fs: 30, qms: 5.2, qes: 0.4, vas_l: 50, re: 3.4, sd_cm2: 330, xmax_mm: 12, pe_w: 250 };
  const Lq = (343 / (4 * d.fs)) * 100;
  const line: LineInput = {
    kind: "line",
    segments: [
      { length_cm: (Lq * 2) / 3, startArea_cm2: 412, endArea_cm2: 313, fill_kgm3: 8 },
      { length_cm: Lq / 3, startArea_cm2: 313, endArea_cm2: 264 },
    ],
    driverAt_cm: 0,
  };
  const r = simulate(d, line, { power: 1, fMin: 8, fMax: 400, points: 260 });
  assert.ok(r.summary.fb !== undefined && r.summary.fb > 10 && r.summary.fb < 30, `fb ${r.summary.fb}`);
});

test("a line's cone and mouth parts add up to its response; the mouth carries the tuning", () => {
  const r = simulate(D, TL, OPT);
  assert.ok(r.parts);
  const at = (f: number) => {
    let i = 0;
    while (r.freq[i]! < f) i++;
    return i;
  };
  const fb = at(r.summary.fb!);
  assert.ok(r.parts.mouth[fb]! > r.parts.cone[fb]! + 6, "mouth dominates at Fb");
  // Stuffed, the mouth fades above the tuning and the cone takes over.
  const st = simulate(D, { ...TL, segments: [{ ...TL.segments[0]!, fill_kgm3: 8 }] }, OPT);
  let k = 0;
  while (st.freq[k]! < 500) k++;
  assert.ok(st.parts!.cone[k]! > st.parts!.mouth[k]! + 6, "cone dominates high up");
  // The sum lies between the difference and the sum of the parts' magnitudes.
  for (let i = 0; i < r.freq.length; i++) {
    const a: number = 10 ** (r.parts.cone[i]! / 20);
    const b: number = 10 ** (r.parts.mouth[i]! / 20);
    const s = 10 ** (r.spl[i]! / 20);
    assert.ok(s <= (a + b) * 1.0001 && s >= Math.abs(a - b) * 0.9999, `triangle at ${r.freq[i]}`);
  }
  const th = simulate(D, { ...TL, tap_cm: 60 }, OPT);
  assert.equal(th.parts, null);
});
