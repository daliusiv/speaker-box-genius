import { test } from "node:test";
import assert from "node:assert/strict";
import { retuned } from "../src/chartEdit.ts";
import { DEFAULT_STATE, type AppState, type DesignState } from "../src/state.ts";
import { checkFromHz, DEEP_FLOOR_HZ, limitsOf, runDesigns, solveDriver } from "../src/sim.ts";

/** Peak of y from f0 up, counting the value at f0 itself (log-f interpolation) when it falls between two points, as the app grades. */
function peakFrom(freq: Float64Array, y: Float64Array, f0: number): number {
  let m = 0;
  freq.forEach((f, i) => {
    if (f >= f0) m = Math.max(m, y[i]!);
    if (i > 0 && freq[i - 1]! < f0 && f > f0) m = Math.max(m, y[i - 1]! + (Math.log(f0 / freq[i - 1]!) / Math.log(f / freq[i - 1]!)) * (y[i]! - y[i - 1]!));
  });
  return m;
}

/** The default driver in a ported box of `vb` litres tuned to `fb` (by port length) at 200 W, no filter. */
function ported(fb: number, vb = 200) {
  const v = DEFAULT_STATE.designs.find((d) => d.kind === "vented")! as Extract<DesignState, { kind: "vented" }>;
  const base: AppState = { ...DEFAULT_STATE, power: 200, highPass: { ...DEFAULT_STATE.highPass, on: false }, designs: [{ ...v, vb_l: vb }] };
  const tuned = retuned(base, base.designs[0]!, fb)!;
  const s: AppState = { ...base, designs: [tuned] };
  const d = runDesigns(s, solveDriver(s))[0]!;
  return { s, r: d.result, fb: d.result.summary.fb! };
}

test("a tuned box is never graded on excursion below 20 Hz, however low it's tuned", () => {
  for (const want of [24, 27, 29]) {
    const { s, r, fb } = ported(want);
    const l = limitsOf(r, s.xmax_mm, false);
    // The peak it's graded on comes from the floor up (or the deep-bass zone, when there is one).
    assert.ok(Math.abs(fb - want) < 0.5, `tuned to ${fb}`);
    const floor = 0.7 * fb > DEEP_FLOOR_HZ ? 0.7 * fb : Math.min(DEEP_FLOOR_HZ, r.summary.f3!);
    const above = peakFrom(r.freq, r.excursionMm, floor);
    assert.ok(Math.abs(l.x! - above) < 1e-9, `Fb ${fb.toFixed(1)}: graded ${l.x} vs ${above}`);
  }
});

test("every box without a high-pass filter is checked from 20 Hz, sealed included; with one, from 10 Hz", () => {
  assert.equal(checkFromHz(false), DEEP_FLOOR_HZ);
  assert.equal(checkFromHz(true), 10);
  // A box built to play below 20 Hz is checked down to its own F3.
  assert.equal(checkFromHz(false, 17.8), 17.8);
  assert.equal(checkFromHz(false, 43), DEEP_FLOOR_HZ);
  assert.equal(checkFromHz(true, 17.8), 10);
  const sealed = DEFAULT_STATE.designs.find((d) => d.kind === "sealed")!;
  const s: AppState = { ...DEFAULT_STATE, power: 200, highPass: { ...DEFAULT_STATE.highPass, on: false }, designs: [sealed] };
  const r = runDesigns(s, solveDriver(s))[0]!.result;
  const from20 = peakFrom(r.freq, r.excursionMm, 20);
  const from15 = peakFrom(r.freq, r.excursionMm, 15);
  assert.ok(from15 > from20, "a sealed box's excursion still rises a little below 20 Hz");
  assert.equal(limitsOf(r, s.xmax_mm, false).x, from20);
  // An Xmax between the two: over only below 20 Hz, so not over (it used to fail).
  const xmax = (from15 + from20) / 2;
  assert.deepEqual(limitsOf(r, xmax, false).over, []);
  // With a high-pass filter the filter is modelled, so everything from 10 Hz counts.
  const { s: s2, r: r2 } = ported(27);
  assert.equal(limitsOf(r2, s2.xmax_mm, true).x, peakFrom(r2.freq, r2.excursionMm, 10));
});

test("a tuned box whose F3 is below 20 Hz is graded from its F3", () => {
  const { s, r, fb } = ported(18, 400);
  const f3 = r.summary.f3!;
  assert.ok(f3 < DEEP_FLOOR_HZ && 0.7 * fb < DEEP_FLOOR_HZ, `F3 ${f3}, Fb ${fb}`);
  const peak = peakFrom(r.freq, r.excursionMm, f3);
  const from20 = peakFrom(r.freq, r.excursionMm, DEEP_FLOOR_HZ);
  assert.ok(peak > from20, "its cone moves more between its F3 and 20 Hz than above 20 Hz");
  assert.equal(limitsOf(r, s.xmax_mm, false).x, peak);
});
