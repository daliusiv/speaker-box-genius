import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_STATE, type AppState, type DesignState } from "../src/state.ts";
import { checkFromHz, DEEP_FLOOR_HZ, limitsOf, runDesigns, solveDriver } from "../src/sim.ts";

/** The default driver in a ported box tuned to `fb` at 200 W, no filter. */
function ported(fb: number) {
  const v = DEFAULT_STATE.designs.find((d) => d.kind === "vented")! as Extract<DesignState, { kind: "vented" }>;
  const s: AppState = { ...DEFAULT_STATE, power: 200, highPass: { ...DEFAULT_STATE.highPass, on: false }, designs: [{ ...v, targetFb: fb, length_cm: 0 }] };
  const d = runDesigns(s, solveDriver(s))[0]!;
  return { s, r: d.result, fb: d.result.summary.fb! };
}

test("a tuned box is never graded on excursion below 20 Hz, however low it's tuned", () => {
  for (const want of [24, 27, 29]) {
    const { s, r, fb } = ported(want);
    const l = limitsOf(r, s.xmax_mm, false);
    // The peak it's graded on comes from the floor up (or the deep-bass zone, when there is one).
    let above = 0;
    r.freq.forEach((f, i) => { if (f >= Math.max(DEEP_FLOOR_HZ, 0.7 * fb)) above = Math.max(above, r.excursionMm[i]!); });
    assert.ok(Math.abs(l.x! - above) < 1e-9, `Fb ${fb.toFixed(1)}: graded ${l.x} vs ${above}`);
  }
});

test("every box without a high-pass filter is checked from 20 Hz, sealed included; with one, from 10 Hz", () => {
  assert.equal(checkFromHz(false), DEEP_FLOOR_HZ);
  assert.equal(checkFromHz(true), 10);
  const sealed = DEFAULT_STATE.designs.find((d) => d.kind === "sealed")!;
  const s: AppState = { ...DEFAULT_STATE, power: 200, highPass: { ...DEFAULT_STATE.highPass, on: false }, designs: [sealed] };
  const r = runDesigns(s, solveDriver(s))[0]!.result;
  const peakFrom = (y: Float64Array, f0: number) => r.freq.reduce((m, f, i) => (f >= f0 ? Math.max(m, y[i]!) : m), 0);
  const from20 = peakFrom(r.excursionMm, 20);
  const from15 = peakFrom(r.excursionMm, 15);
  assert.ok(from15 > from20, "a sealed box's excursion still rises a little below 20 Hz");
  assert.equal(limitsOf(r, s.xmax_mm, false).x, from20);
  // An Xmax between the two: over only below 20 Hz, so not over (it used to fail).
  const xmax = (from15 + from20) / 2;
  assert.deepEqual(limitsOf(r, xmax, false).over, []);
  // With a high-pass filter the filter is modelled, so everything from 10 Hz counts.
  const { s: s2, r: r2 } = ported(27);
  let all = 0;
  r2.freq.forEach((f, i) => { if (f >= 10) all = Math.max(all, r2.excursionMm[i]!); });
  assert.equal(limitsOf(r2, s2.xmax_mm, true).x, all);
});
