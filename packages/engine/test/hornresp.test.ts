// Regression against Hornresp: the cases, the drivers and the tolerances are in
// validation/hornresp.ts, shared with the validation report (docs/validation/results.json).
import { test } from "node:test";
import assert from "node:assert/strict";
import { HORNRESP_TOL as T, IMPULSE_TOL as I, MAXSPL_TOL as M, hornrespBoxIds, hornrespIds, runHornresp, runHornrespBox, type ImpulseRun, type MaxSplRun } from "../validation/hornresp.ts";

for (const id of hornrespIds()) {
  const run = runHornresp(id);
  const s = run.stats;

  test(`Hornresp ${id}: electrical impedance`, () => {
    assert.ok(s.zeMean < T.zeMean, `mean |Ze| error ${s.zeMean.toFixed(2)} %`);
    assert.ok(s.zeWorst < T.zeWorst, `worst |Ze| error ${s.zeWorst.toFixed(1)} %`);
    assert.ok(s.zePhaseMean < T.zePhaseMean, `mean Ze phase error ${s.zePhaseMean.toFixed(2)}°`);
  });

  test(`Hornresp ${id}: SPL`, () => {
    // Deep notches are compared by where they fall, not by how deep they are: a few
    // hundredths of a hertz move the bottom of a 40 dB null by many dB.
    assert.ok(s.splMean < T.splMean, `mean SPL difference ${s.splMean.toFixed(2)} dB`);
    assert.ok(s.splP95 < T.splP95, `95th percentile ${s.splP95.toFixed(2)} dB`);
  });

  test(`Hornresp ${id}: cone excursion`, () => {
    assert.ok(s.xdMean < T.xdMean, `mean excursion difference ${s.xdMean.toFixed(2)} %`);
    assert.ok(s.xdP95 < T.xdP95, `95th percentile ${s.xdP95.toFixed(2)} %`);
  });

  test(`Hornresp ${id}: group delay`, () => {
    assert.ok(s.gdP95 < T.gdP95, `95th percentile ${s.gdP95.toFixed(2)} ms`);
  });

  test(`Hornresp ${id}: amplifier current, input power, efficiency and SPL phase`, () => {
    assert.ok(s.iinMean < T.zeMean, `mean current difference ${s.iinMean.toFixed(2)} %`);
    assert.ok(s.pinMean < T.pinMean, `mean input power difference ${s.pinMean.toFixed(2)} %`);
    assert.ok(s.effMean < T.effMean, `mean efficiency difference ${s.effMean.toFixed(2)} %`);
    assert.ok(s.phaseMedian < T.phaseMedian, `median phase difference ${s.phaseMedian.toFixed(2)}°`);
  });

  if (s.mouthMean !== undefined) {
    test(`Hornresp ${id}: the mouth's (port's) output alone`, () => {
      assert.ok(s.mouthMean! < T.splMean, `mean difference ${s.mouthMean!.toFixed(2)} dB`);
      assert.ok(s.mouthP95! < T.splP95, `95th percentile ${s.mouthP95!.toFixed(2)} dB`);
    });
  }

  if (s.zaMean !== undefined) {
    test(`Hornresp ${id}: acoustic impedance (Za, normalised)`, () => {
      assert.ok(s.zaMean! < T.zaMean, `mean |Za| difference ${s.zaMean!.toFixed(3)} dB`);
    });
  }
}

// Ordinary boxes: sealed, ported, PR, bandpass, two drivers (tolerances in HORNRESP_BOX_TOL,
// widened per case where case.json says so).
for (const id of hornrespBoxIds()) {
  const run = runHornrespBox(id);
  const s = run.stats;
  const t = run.tol;

  test(`Hornresp box ${id}: electrical impedance`, () => {
    assert.ok(s.zeMean < t.zeMean, `mean |Ze| error ${s.zeMean.toFixed(2)} %`);
    assert.ok(s.zeP95 < t.zeP95, `95th percentile ${s.zeP95.toFixed(2)} %`);
    assert.ok(s.zePhaseMean < t.zePhaseMean, `mean Ze phase error ${s.zePhaseMean.toFixed(2)}°`);
  });

  test(`Hornresp box ${id}: cone excursion`, () => {
    assert.ok(s.xdMean < t.xdMean, `mean excursion difference ${s.xdMean.toFixed(2)} %`);
    assert.ok(s.xdP95 < t.xdP95, `95th percentile ${s.xdP95.toFixed(2)} %`);
  });

  const db = (what: string, m: number | undefined, p: number | undefined) => {
    if (m === undefined) return;
    test(`Hornresp box ${id}: ${what}`, () => {
      assert.ok(m < t.splMean, `mean difference ${m.toFixed(2)} dB`);
      assert.ok(p! < t.splP95, `95th percentile ${p!.toFixed(2)} dB`);
    });
  };
  db("SPL", s.splMean, s.splP95);
  db("the cone's output alone", s.coneMean, s.coneP95);
  db("the port's or passive radiator's output alone", s.ventMean, s.ventP95);
  db("the coil model's effect on SPL, up to 20 kHz", s.coilMean, s.coilP95);
  if (s.gdP95 !== undefined)
    test(`Hornresp box ${id}: group delay`, () => assert.ok(s.gdP95! < t.gdP95, `95th percentile ${s.gdP95!.toFixed(2)} ms`));
}

// Maximum SPL (Hornresp's Tools > Maximum SPL), where it was exported.
function maxSplTests(id: string, runs: MaxSplRun[]) {
  for (const m of runs) {
    test(`Hornresp ${id}: maximum SPL${m.ampVolts ? ` with the amplifier at ${m.ampVolts} V` : ""}`, () => {
      assert.ok(m.stats.splMean < M.splMean, `mean difference ${m.stats.splMean.toFixed(3)} dB`);
      assert.ok(m.stats.splP95 < M.splP95, `95th percentile ${m.stats.splP95.toFixed(3)} dB`);
      assert.ok(m.stats.einMean < M.einMean, `mean voltage difference ${m.stats.einMean.toFixed(2)} %`);
      assert.ok(m.stats.pinMean < M.pinMean, `mean input power difference ${m.stats.pinMean.toFixed(2)} %`);
    });
  }
}
// Impulse response (Hornresp's WAV export) and the step response from it.
function impulseTests(id: string, ir: ImpulseRun | undefined) {
  if (!ir) return;
  test(`Hornresp ${id}: impulse and step response`, () => {
    assert.ok(ir.stats.impulseRms < I.impulseRms, `impulse RMS difference ${ir.stats.impulseRms.toFixed(4)}`);
    assert.ok(ir.stats.impulseMax < I.impulseMax, `impulse largest difference ${ir.stats.impulseMax.toFixed(3)}`);
    assert.ok(ir.stats.stepRms < I.stepRms, `step RMS difference ${ir.stats.stepRms.toFixed(4)}`);
  });
}
for (const id of hornrespIds()) {
  const r = runHornresp(id);
  maxSplTests(id, r.maxSpl);
  impulseTests(id, r.impulse);
}
for (const id of hornrespBoxIds()) {
  const r = runHornrespBox(id);
  maxSplTests(`box ${id}`, r.maxSpl);
  impulseTests(`box ${id}`, r.impulse);
}
