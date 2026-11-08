import { test } from "node:test";
import assert from "node:assert/strict";
import { EXAMPLES } from "./examples.ts";
import { runDesigns, solveDriver } from "../packages/web/src/sim.ts";

/**
 * The sealed Qtc, MLTL and group delay guides quote the app's simulation of their examples: these are the
 * headline numbers, so a change to the engine or the database that moves them fails here and
 * the guide gets updated with it.
 */
const run = (name: string) => {
  const s = EXAMPLES[name]!();
  return runDesigns(s, solveDriver(s));
};
const at = (f: Float64Array, y: ArrayLike<number>, x: number) => {
  const i = f.findIndex((v) => v >= x);
  const t = (x - f[i - 1]!) / (f[i]! - f[i - 1]!);
  return y[i - 1]! + t * (y[i]! - y[i - 1]!);
};
const near = (a: number, b: number, tol: number, what: string) => assert.ok(Math.abs(a - b) <= tol, `${what}: ${a} (guide says ${b})`);

test("sealed Qtc guide: box sizes, F3, level at 25 Hz and max SPL at 30 Hz", () => {
  const rows = run("qtc-example");
  const want = [
    { vb: 30.1, f3: 60.3, l25: -10.8, max30: 100.2 },
    { vb: 18.0, f3: 57.9, l25: -12.0, max30: 100.2 },
    { vb: 9.9, f3: 56.9, l25: -14.3, max30: 100.2 },
    { vb: 5.4, f3: 60.5, l25: -17.9, max30: 96.8 },
    { vb: 3.4, f3: 67.4, l25: -21.3, max30: 93.6 },
  ];
  rows.forEach((d, i) => {
    const r = d.result;
    const w = want[i]!;
    assert.equal(d.design.vb_l, w.vb, d.design.name);
    near(r.summary.f3!, w.f3, 0.06, `${d.design.name} F3`);
    near(at(r.freq, r.spl, 25) - r.summary.referenceSpl, w.l25, 0.06, `${d.design.name} at 25 Hz`);
    near(at(r.freq, r.maxSpl, 30), w.max30, 0.06, `${d.design.name} max SPL at 30 Hz`);
  });
});

test("MLTL guide: port lengths, tuning and F3 of the ported box, the empty line and the MLTL", () => {
  const [ported, empty, mltl] = run("mltl-example");
  assert.equal(ported!.design.kind === "vented" && ported!.design.length_cm, 27.1);
  assert.equal(mltl!.design.kind === "line" && mltl!.design.portLength_cm, 21.6);
  near(ported!.result.summary.f3!, 43.3, 0.06, "ported F3");
  near(empty!.result.summary.fb!, 41.6, 0.06, "empty line tuning");
  near(mltl!.result.summary.fb!, 40.0, 0.06, "MLTL tuning");
  near(mltl!.result.summary.f3!, 40.2, 0.06, "MLTL F3");
});

test("group delay guide: sizes, F3, response peak and group delay of the three boxes, with and without the subsonic filter", () => {
  const want = [
    { vb: 36.3, f3: 46.4, gd: { 25: 6.0, 30: 6.0, 40: 5.5, 50: 4.7, 60: 3.8, 80: 2.4 } },
    { vb: 50, f3: 35.2, gd: { 25: 9.4, 30: 10.0, 40: 15.4, 50: 15.1, 60: 7.5, 80: 2.9 }, peak: { db: 5.4, hz: 51 }, gdPeak: { ms: 17.6, hz: 45 } },
    { vb: 83.5, f3: 23.3, gd: { 25: 25.2, 30: 15.5, 40: 7.1, 50: 4.5, 60: 3.2, 80: 2.0 }, gdPeak: { ms: 29.0, hz: 21.6 } },
  ];
  run("group-delay").forEach((d, i) => {
    const r = d.result;
    const w = want[i]!;
    assert.equal(d.design.vb_l, w.vb, d.design.name);
    near(r.summary.f3!, w.f3, 0.1, `${d.design.name} F3`);
    for (const [hz, ms] of Object.entries(w.gd)) near(at(r.freq, r.groupDelayMs, Number(hz)), ms, 0.2, `${d.design.name} group delay at ${hz} Hz`);
    let gi = 0;
    let si = 0;
    for (let k = 0; k < r.freq.length; k++) {
      if (r.freq[k]! >= 10 && r.groupDelayMs[k]! > r.groupDelayMs[gi]!) gi = k;
      if (r.freq[k]! < 200 && r.spl[k]! > r.spl[si]!) si = k;
    }
    if (w.gdPeak) {
      near(r.groupDelayMs[gi]!, w.gdPeak.ms, 0.2, `${d.design.name} peak group delay`);
      near(r.freq[gi]!, w.gdPeak.hz, 1, `${d.design.name} peak group delay frequency`);
    }
    if (w.peak) {
      near(r.spl[si]! - r.summary.referenceSpl, w.peak.db, 0.1, `${d.design.name} response peak`);
      near(r.freq[si]!, w.peak.hz, 1.5, `${d.design.name} response peak frequency`);
    }
  });
  const filtered = run("group-delay-subsonic").map((d) => at(d.result.freq, d.result.groupDelayMs, 40));
  [10.7, 20.5, 12.3].forEach((ms, i) => near(filtered[i]!, ms, 0.2, `subsonic filter: box ${i + 1} at 40 Hz`));
});

test("one 15 vs two 10s guide: maximum SPL and the limit reached, in both boxes on the same amplifier", () => {
  const F = [20, 25, 30, 35, 40, 45, 50, 60, 80];
  const want: Record<string, number[][]> = {
    "subs-one-15": [
      [101.8, 105.7, 108.9, 110.9, 112.1, 112.9, 113.4, 113.9, 114.2],
      [106.5, 112.3, 114.6, 115.1, 115.2, 115.1, 115.1, 114.9, 114.6],
    ],
    "subs-two-10s": [
      [99.3, 103.2, 106.4, 109.1, 111.4, 113.4, 114.1, 115.0, 115.8],
      [106.5, 112.3, 113.0, 113.5, 114.6, 115.8, 115.9, 116.1, 116.3],
    ],
  };
  for (const [name, rows] of Object.entries(want)) {
    run(name).forEach((d, i) => {
      F.forEach((hz, k) => near(at(d.result.freq, d.result.maxSpl, hz), rows[i]![k]!, 0.06, `${d.design.name} max SPL at ${hz} Hz`));
    });
  }
  const limit = (name: string, box: number, hz: number) => {
    const r = run(name)[box]!.result;
    return r.limitedBy[r.freq.findIndex((f) => f >= hz)];
  };
  assert.equal(limit("subs-one-15", 0, 30), "xmax");
  assert.equal(limit("subs-one-15", 0, 50), "amp");
  assert.equal(limit("subs-two-10s", 0, 40), "xmax");
  assert.equal(limit("subs-two-10s", 0, 50), "thermal");
  assert.equal(limit("subs-two-10s", 1, 25), "port");
});
