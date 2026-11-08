import { test } from "node:test";
import assert from "node:assert/strict";
import { abs } from "../src/complex.ts";
import { eqStageResponse, highPassResponse, type EqStage, type HighPass } from "../src/filters.ts";
import { num, biquadCsv, biquadsDb, camillaDsp, dspBiquads, equalizerApo, maxBoostDb, miniDsp } from "../src/dsp.ts";

const dB = (x: number) => 20 * Math.log10(x);
const near = (a: number, b: number, tol: number, what = "") => assert.ok(Math.abs(a - b) <= tol, `${what} ${a} vs ${b} (tol ${tol})`);

const STAGES: EqStage[] = [
  { type: "linkwitz", f0: 55, q0: 0.9, fp: 25, qp: 0.6 },
  { type: "peak", freq: 45, gain_db: -4, q: 2 },
  { type: "peak", freq: 120, gain_db: 3, q: 0.8 },
  { type: "lowshelf", freq: 40, gain_db: 6, q: 0.707 },
  { type: "highshelf", freq: 200, gain_db: -3, q: 0.707 },
];
const HPS: HighPass[] = [
  ...[1, 2, 3, 4].map((order): HighPass => ({ type: "butterworth", order, freq: 20 })),
  ...[2, 4].map((order): HighPass => ({ type: "linkwitz-riley", order, freq: 18 })),
];

for (const fs of [44100, 48000, 96000, 192000]) {
  test(`digital EQ matches the analog EQ below fs/10 (${fs} Hz)`, () => {
    for (const st of STAGES) {
      const bq = dspBiquads(null, [st], fs);
      for (let f = 10; f <= fs / 10; f *= 1.15) near(biquadsDb(bq, f, fs), dB(abs(eqStageResponse(st, f))), 0.05, `${st.type} at ${f.toFixed(0)} Hz`);
    }
  });

  test(`digital high-pass matches the analog one below fs/10 (${fs} Hz)`, () => {
    for (const hp of HPS) {
      const bq = dspBiquads(hp, [], fs);
      assert.equal(bq.length, Math.ceil(hp.order / 2) + (hp.type === "linkwitz-riley" && hp.order === 2 ? 1 : 0));
      for (let f = 5; f <= fs / 10; f *= 1.15) near(biquadsDb(bq, f, fs), dB(abs(highPassResponse(hp, f))), 0.05, `${hp.type} ${hp.order} at ${f.toFixed(0)} Hz`);
      // Prewarping puts the corner exactly where the analog one is.
      near(biquadsDb(bq, hp.freq, fs), hp.type === "butterworth" ? -3.0103 : -6.0206, 1e-6, `${hp.type} ${hp.order} corner`);
    }
  });
}

test("a peak's biquad matches the RBJ cookbook digital peak (bilinear with prewarping at f0)", () => {
  // RBJ: A = 10^(g/40), w0 = 2πf0/fs, α = sin(w0)/(2Q) with the Q given in the analog domain as here.
  const fs = 48000, f0 = 1000, g = 6, Q = 1.5;
  const A = 10 ** (g / 40), w0 = (2 * Math.PI * f0) / fs, al = Math.sin(w0) / (2 * Q);
  const a0 = 1 + al / A;
  const want = { b0: (1 + al * A) / a0, b1: (-2 * Math.cos(w0)) / a0, b2: (1 - al * A) / a0, a1: (-2 * Math.cos(w0)) / a0, a2: (1 - al / A) / a0 };
  const [q] = dspBiquads(null, [{ type: "peak", freq: f0, gain_db: g, q: Q }], fs);
  for (const k of ["b0", "b1", "b2", "a1", "a2"] as const) near(q![k], want[k], 1e-12, k);
});

test("the sections are stable (poles inside the unit circle)", () => {
  for (const q of dspBiquads(HPS[3]!, STAGES, 48000)) {
    assert.ok(Math.abs(q.a2) < 1 && Math.abs(q.a1) < 1 + q.a2, q.label);
  }
});

test("a frequency at or above half the sample rate is refused", () => {
  assert.throws(() => dspBiquads(null, [{ type: "peak", freq: 30000, gain_db: 3, q: 1 }], 48000), /half the sample rate/);
});

test("Equalizer APO file: preamp covers the largest boost, one IIR line per section", () => {
  const bq = dspBiquads(HPS[3]!, STAGES, 48000);
  const txt = equalizerApo(bq, 48000, "Test");
  const pre = Number(/^Preamp: (-?[\d.]+) dB/m.exec(txt)![1]);
  assert.ok(pre <= -maxBoostDb(bq, 48000) && pre > -maxBoostDb(bq, 48000) - 0.11, `preamp ${pre}`);
  const lines = txt.split("\r\n").filter((l) => l.startsWith("Filter: ON IIR Order 2 Coefficients "));
  assert.equal(lines.length, bq.length);
  const c = lines[0]!.split(" ").slice(6).map(Number);
  assert.equal(c.length, 6);
  assert.deepEqual(c.map((x) => x!.toPrecision(8)), [bq[0]!.b0, bq[0]!.b1, bq[0]!.b2, 1, bq[0]!.a1, bq[0]!.a2].map((x) => x.toPrecision(8)));
  // No boost → no cut.
  assert.match(equalizerApo(dspBiquads(HPS[1]!, [], 48000), 48000, "x"), /^Preamp: 0 dB/m);
});

test("CamillaDSP fragment lists every filter in the pipeline", () => {
  const bq = dspBiquads(HPS[1]!, STAGES.slice(1, 2), 96000);
  const y = camillaDsp(bq, 96000, "Test");
  assert.match(y, /^filters:$/m);
  assert.equal((y.match(/type: Free/g) ?? []).length, 2);
  assert.match(y, /pipeline:\n {2}- type: Filter\n {4}channels: \[0, 1\]\n {4}names:\n {6}- sbg_1\n {6}- sbg_2\n$/);
  // A boosting EQ gets a gain step first.
  assert.match(camillaDsp(dspBiquads(null, STAGES.slice(0, 1), 48000), 48000, "x"), /names:\n {6}- sbg_preamp\n {6}- sbg_1\n$/);
});

test("miniDSP biquads have a1 and a2 sign-inverted and are padded with pass-through sections", () => {
  const bq = dspBiquads(HPS[1]!, [], 48000);
  const t = miniDsp(bq, 3);
  assert.equal((t.match(/^biquad\d,$/gm) ?? []).length, 3);
  assert.ok(t.includes(`a1=${num(-bq[0]!.a1)},`));
  assert.ok(t.includes(`a2=${num(-bq[0]!.a2)},`));
  assert.ok(t.trimEnd().endsWith("a2=0"));
  assert.ok(t.includes("biquad3,\nb0=1,"));
});

test("coefficients are written as plain decimals", () => {
  assert.equal(num(1), "1");
  assert.equal(num(-0), "0");
  assert.equal(num(-1.9876543210987654), "-1.98765432109877");
  assert.equal(num(3.2e-8), "0.000000032");
  assert.ok(!/e/.test(num(1.23456789e-9)));
});

test("CSV has a header and one row per section", () => {
  const csv = biquadCsv(dspBiquads(HPS[3]!, STAGES, 48000), 48000);
  assert.equal(csv.trim().split("\n").length, 2 + 2 + STAGES.length);
});
