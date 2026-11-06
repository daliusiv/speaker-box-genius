import { test } from "node:test";
import assert from "node:assert/strict";
import type { DriverInput } from "../src/model.ts";
import { simulate } from "../src/simulate.ts";
import { fft, transientResponse } from "../src/transient.ts";

const DRIVER: DriverInput = { fs: 30, qms: 5.2, qes: 0.4, vas_l: 50, re: 3.4, sd_cm2: 330, le_mh: 0.8, xmax_mm: 12 };

test("fft: forward then inverse gives the input back", () => {
  const n = 64;
  const re = Float64Array.from({ length: n }, (_, i) => Math.sin(i * 0.7) + (i % 5));
  const im = new Float64Array(n);
  const orig = re.slice();
  fft(re, im, -1);
  fft(re, im, 1);
  for (let i = 0; i < n; i++) assert.ok(Math.abs(re[i]! / n - orig[i]!) < 1e-12 && Math.abs(im[i]! / n) < 1e-12);
});

test("impulse and step: a sealed box pushes out first, then settles; the step returns to zero", () => {
  const r = transientResponse(DRIVER, { kind: "sealed", vb_l: 40 }, { splFrom: "power" });
  const zero = r.t_ms.findIndex((t) => t >= 0);
  // Peak at (or a few samples after) t = 0, positive: + to + pushes the cone out.
  let peak = 0;
  for (let i = 0; i < r.impulse.length; i++) if (Math.abs(r.impulse[i]!) > Math.abs(r.impulse[peak]!)) peak = i;
  assert.ok(peak - zero >= 0 && peak - zero <= 6, `peak at ${r.t_ms[peak]} ms`);
  assert.equal(Math.sign(r.impulse[peak]!), 1);
  // Nothing before the drive (beyond the 20 kHz cut-off's ripple).
  for (let i = 0; i < zero - 48; i++) assert.ok(Math.abs(r.impulse[i]!) < 0.02, `${r.t_ms[i]} ms`);
  // A box can't hold a pressure: the step response decays back to nothing.
  assert.ok(Math.abs(r.step[r.step.length - 1]!) < 0.02);
  assert.ok(Math.max(...r.step) > 0.9);
});

test("impulse: its spectrum is the simulated response (up to the cut-off)", () => {
  const fs = 8000;
  const n = 4096;
  const r = transientResponse(DRIVER, { kind: "vented", vb_l: 50, port: { shape: "round", diameter_cm: 7, length_cm: 20 } }, {}, { sampleRate: fs, length: n, fMax: 3000, pre_ms: 0 });
  const re = r.impulse.slice();
  const im = new Float64Array(n);
  fft(re, im, -1);
  const f = [50, 200, 1000].map((x) => Math.round((x * n) / fs));
  const s = simulate(DRIVER, { kind: "vented", vb_l: 50, port: { shape: "round", diameter_cm: 7, length_cm: 20 } }, { frequencies: f.map((k) => (k * fs) / n) });
  const db = f.map((k) => 20 * Math.log10(Math.hypot(re[k]!, im[k]!)));
  // Same shape (the impulse is scaled, so compare differences).
  for (let i = 1; i < f.length; i++) assert.ok(Math.abs(db[i]! - db[0]! - (s.spl[i]! - s.spl[0]!)) < 1e-6);
});
