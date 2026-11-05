// Regression against Hornresp 55.30: the cases, the driver and the tolerances are in
// validation/hornresp.ts, shared with the validation report (docs/validation/results.json).
import { test } from "node:test";
import assert from "node:assert/strict";
import { HORNRESP_TOL as T, hornrespIds, runHornresp } from "../validation/hornresp.ts";

for (const id of hornrespIds()) {
  const run = runHornresp(id);
  const s = run.stats;

  test(`Hornresp ${id}: electrical impedance`, () => {
    assert.ok(s.zeMean < T.zeMean, `mean |Ze| error ${s.zeMean.toFixed(2)} %`);
    assert.ok(s.zeWorst < T.zeWorst, `worst |Ze| error ${s.zeWorst.toFixed(1)} %`);
  });

  test(`Hornresp ${id}: SPL`, () => {
    // Deep notches are compared by where they fall, not by how deep they are: a few
    // hundredths of a hertz move the bottom of a 40 dB null by many dB.
    assert.ok(s.splMean < T.splMean, `mean SPL difference ${s.splMean.toFixed(2)} dB`);
    assert.ok(s.splP95 < T.splP95, `95th percentile ${s.splP95.toFixed(2)} dB`);
  });

  if (s.zaMean !== undefined) {
    test(`Hornresp ${id}: acoustic impedance (Za, normalised)`, () => {
      assert.ok(s.zaMean! < T.zaMean, `mean |Za| difference ${s.zaMean!.toFixed(3)} dB`);
    });
  }
}
