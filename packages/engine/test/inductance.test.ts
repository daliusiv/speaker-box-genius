import { test } from "node:test";
import assert from "node:assert/strict";
import { driverImpedance, fitImpedance, impedanceFitError, type ImpedanceData } from "../src/impedance.ts";
import { driverModel, voiceCoilImpedance, type DriverInput } from "../src/model.ts";
import { simulate } from "../src/simulate.ts";
import { abs } from "../src/complex.ts";

/** L2R2 voice-coil model: Le + (L2 ∥ R2). */

const DRIVER: DriverInput = { fs: 30, qms: 5.2, qes: 0.4, vas_l: 50, re: 3.4, sd_cm2: 330, le_mh: 0.8, xmax_mm: 12 };
const BOX = { kind: "sealed" as const, vb_l: 40 };
const OPTS = { power: 1, fMax: 2000, points: 200 };
const maxDiff = (a: Float64Array, b: Float64Array) => a.reduce((m, v, i) => Math.max(m, Math.abs(v - b[i]!)), 0);

test("without L2/R2 nothing changes; the limits of R2 reduce to plain inductors", () => {
  const plain = simulate(DRIVER, BOX, OPTS);
  assert.equal(maxDiff(simulate({ ...DRIVER, l2_mh: 0, r2_ohm: 5 }, BOX, OPTS).spl, plain.spl), 0);
  assert.equal(maxDiff(simulate({ ...DRIVER, l2_mh: 1, r2_ohm: undefined }, BOX, OPTS).spl, plain.spl), 0);
  // R2 → ∞: L2 is simply in series, so Le + L2 as a plain inductor.
  const bigR2 = simulate({ ...DRIVER, l2_mh: 0.5, r2_ohm: 1e12 }, BOX, OPTS);
  const sumLe = simulate({ ...DRIVER, le_mh: 1.3 }, BOX, OPTS);
  assert.ok(maxDiff(bigR2.spl, sumLe.spl) < 1e-6);
  assert.ok(maxDiff(bigR2.impedanceOhm, sumLe.impedanceOhm) < 1e-6);
  // R2 → 0: L2 is shorted out.
  const smallR2 = simulate({ ...DRIVER, l2_mh: 0.5, r2_ohm: 1e-12 }, BOX, OPTS);
  assert.ok(maxDiff(smallR2.spl, plain.spl) < 1e-6);
});

test("the L2R2 branch is lossy: the coil's resistance rises with frequency and its inductance falls", () => {
  const m = driverModel({ ...DRIVER, le_mh: 0.3, l2_mh: 1.2, r2_ohm: 4 });
  const at = (f: number) => voiceCoilImpedance(m, 2 * Math.PI * f);
  const lEff = (f: number) => at(f).im / (2 * Math.PI * f);
  assert.ok(at(5000).re > at(500).re && at(500).re > m.re);
  assert.ok(lEff(100) > lEff(1000) && lEff(1000) > lEff(10000));
  // Far below the L2/R2 corner (R2 / 2πL2 ≈ 530 Hz) it looks like Le + L2; far above, like Le with R2 added.
  assert.ok(Math.abs(lEff(5) - 1.5e-3) / 1.5e-3 < 1e-3);
  assert.ok(Math.abs(at(1e6).re - (m.re + 4)) < 1e-3);
});

test("SPL above the passband: L2R2 tracks a lossy coil differently from a plain Le of the same 1 kHz inductance", () => {
  const lr2 = { ...DRIVER, le_mh: 0.3, l2_mh: 1.2, r2_ohm: 4 };
  const m = driverModel(lr2);
  const leAt1k = voiceCoilImpedance(m, 2 * Math.PI * 1000).im / (2 * Math.PI * 1000) * 1000; // mH
  const a = simulate(lr2, BOX, OPTS);
  const b = simulate({ ...DRIVER, le_mh: leAt1k }, BOX, OPTS);
  // Same in the bass, different up high (where the coil's losses show).
  assert.ok(Math.abs(a.spl[0]! - b.spl[0]!) < 0.05);
  assert.ok(Math.abs(a.spl[a.spl.length - 1]! - b.spl[b.spl.length - 1]!) > 0.3);
});

test("isobaric pairs scale L2 and R2 with the coils", () => {
  const d = { ...DRIVER, l2_mh: 1, r2_ohm: 4 };
  const series = simulate(d, BOX, { ...OPTS, isobaric: { coils: "series" } });
  const parallel = simulate(d, BOX, { ...OPTS, isobaric: { coils: "parallel" } });
  // Series doubles every voice-coil element; parallel halves them: impedances differ by 4× at any frequency.
  for (const i of [0, 100, 199]) assert.ok(Math.abs(series.impedanceOhm[i]! / parallel.impedanceOhm[i]! - 4) < 1e-9);
});

function sweep(p: Parameters<typeof driverImpedance>[0], withPhase: boolean): ImpedanceData {
  const freq: number[] = [];
  for (let f = 10; f <= 20000; f *= 1.02) freq.push(f);
  const z = freq.map((f) => driverImpedance(p, f));
  return { freq, mag: z.map(abs), phase: withPhase ? z.map((v) => (Math.atan2(v.im, v.re) * 180) / Math.PI) : null };
}

test("fitting an L2R2 sweep recovers its values, with or without phase", () => {
  const truth = { re: 3.3, fs: 28, qms: 4, qes: 0.45, le_mh: 0.25, l2_mh: 1.1, r2_ohm: 3.5 };
  for (const withPhase of [true, false]) {
    const fit = fitImpedance(sweep(truth, withPhase), undefined, { inductance: "lr2" });
    for (const k of Object.keys(truth) as (keyof typeof truth)[]) {
      assert.ok(Math.abs(fit[k]! / truth[k] - 1) < 0.02, `${withPhase ? "phase" : "magnitude"}: ${k} ${fit[k]} vs ${truth[k]}`);
    }
    assert.ok(fit.rmsError < 1e-3);
    assert.ok(fit.range[1] > 19000, "fits up to the top of the sweep");
  }
});

test("on a lossy coil, L2R2 fits the whole sweep far better than plain Le", () => {
  const truth = { re: 3.3, fs: 28, qms: 4, qes: 0.45, le_mh: 0.25, l2_mh: 1.1, r2_ohm: 3.5 };
  const data = sweep(truth, true);
  const plain = fitImpedance(data);
  const lr2 = fitImpedance(data, undefined, { inductance: "lr2" });
  const ePlain = impedanceFitError(data, plain, 10, 20000);
  const eLr2 = impedanceFitError(data, lr2, 10, 20000);
  assert.ok(ePlain > 0.1, `plain Le misses badly up high: ${ePlain}`);
  assert.ok(eLr2 < 0.002, String(eLr2));
  // The default (plain) fit is unchanged: still fitted around the resonance only.
  assert.ok(plain.range[1] < 1000);
  assert.equal(plain.l2_mh, undefined);
});
