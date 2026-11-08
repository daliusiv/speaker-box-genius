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

test("power compression guide: loss at the same voltage, the hump and the excursion at 120 and 180 °C", () => {
  const [cold, warm, hot] = ["coil-20", "coil-120", "coil-180"].map((n) => run(n)[0]!.result);
  const spl = (r: typeof cold, hz: number) => at(r!.freq, r!.spl, hz);
  near(spl(cold, 25), 107.4, 0.06, "cold at 25 Hz");
  const loss: Record<number, [number, number]> = { 20: [1.8, 2.7], 25: [2.3, 3.4], 30: [1.4, 2.1], 40: [0.6, 0.9], 50: [0.9, 1.4], 60: [1.4, 2.2], 80: [2.1, 3.2], 100: [2.5, 3.7], 150: [2.8, 4.1] };
  for (const [hz, [l120, l180]] of Object.entries(loss)) {
    near(spl(cold, Number(hz)) - spl(warm, Number(hz)), l120, 0.06, `loss at ${hz} Hz, 120 °C`);
    near(spl(cold, Number(hz)) - spl(hot, Number(hz)), l180, 0.06, `loss at ${hz} Hz, 180 °C`);
  }
  const hump = (r: typeof cold) => {
    const ref = spl(r, 150);
    let best = -99;
    for (let i = 0; i < r!.freq.length; i++) if (r!.freq[i]! < 300) best = Math.max(best, r!.spl[i]! - ref);
    return best;
  };
  near(hump(warm), 1.35, 0.06, "hump at 120 °C");
  near(hump(hot), 2.33, 0.06, "hump at 180 °C");
  [8.81, 8.09, 7.71].forEach((mm, i) => near(at([cold, warm, hot][i]!.freq, [cold, warm, hot][i]!.excursionMm, 35), mm, 0.02, `excursion at 35 Hz, box ${i}`));
});

test("DVC wiring guide: the same driver in series and parallel, with and without 0.15 Ω of amp + cable", () => {
  const withRg = (name: string, rg: number) => {
    const s = EXAMPLES[name]!();
    const t = { ...s, settings: { ...s.settings, rg } };
    return runDesigns(t, solveDriver(t)).map((d) => d.result);
  };
  // Rows: series sealed, series ported, parallel sealed, parallel ported.
  const w = withRg("dvc-watts", 0.15);
  const w0 = withRg("dvc-watts", 0);
  const v = withRg("dvc-volts", 0.15);
  const v0 = withRg("dvc-volts", 0);
  const F = [20, 25, 30, 40, 50, 60, 80, 100, 150];
  // Without resistance, the same power gives the same SPL either way, and the same voltage 6 dB more in parallel.
  for (const box of [0, 1]) {
    F.forEach((hz) => {
      near(at(w0[box + 2]!.freq, w0[box + 2]!.spl, hz), at(w0[box]!.freq, w0[box]!.spl, hz), 0.01, `same power, no Rg, box ${box} at ${hz} Hz`);
      near(at(v0[box + 2]!.freq, v0[box + 2]!.spl, hz) - at(v0[box]!.freq, v0[box]!.spl, hz), 6.02, 0.01, `same voltage, no Rg, box ${box} at ${hz} Hz`);
    });
  }
  // What the 0.15 Ω costs at the same rated power: the guide's 0.1–0.3 dB in series and 0.3–1.1 dB in parallel.
  const loss = (k: number) => F.map((hz) => at(w[k]!.freq, w[k]!.spl, hz) - at(w0[k]!.freq, w0[k]!.spl, hz));
  for (const k of [0, 1]) loss(k).forEach((db) => assert.ok(db <= -0.07 && db >= -0.3, `series loss ${db}`));
  for (const k of [2, 3]) loss(k).forEach((db) => assert.ok(db <= -0.3 && db >= -1.12, `parallel loss ${db}`));
  // Same gain: parallel 5.2–5.8 dB louder with the 0.15 Ω.
  for (const box of [0, 1]) F.forEach((hz) => {
    const d = at(v[box + 2]!.freq, v[box + 2]!.spl, hz) - at(v[box]!.freq, v[box]!.spl, hz);
    assert.ok(d >= 5.19 && d <= 5.8, `same voltage, box ${box} at ${hz} Hz: ${d}`);
  });
  // Impedance: a quarter in parallel; 4.25–16.4 Ω in series in the sealed box, peak at 52.7 Hz.
  near(Math.max(...w[0]!.impedanceOhm), 16.4, 0.05, "series sealed impedance peak");
  near(Math.max(...w[2]!.impedanceOhm), 4.1, 0.02, "parallel sealed impedance peak");
  near(Math.min(...w[2]!.impedanceOhm), 1.06, 0.01, "parallel sealed impedance minimum");
  // Max SPL on the Kicker: series amp-limited, parallel at the coil rating; +1.46 dB without Rg, 0.6–1.2 dB with it, 0 where the port limits.
  const max = (r: (typeof w)[number], hz: number) => at(r.freq, r.maxSpl, hz);
  const lim = (r: (typeof w)[number], hz: number) => r.limitedBy[r.freq.findIndex((f) => f >= hz)];
  assert.equal(lim(w[0]!, 50), "amp");
  assert.equal(lim(w[2]!, 50), "thermal");
  assert.equal(lim(w[1]!, 25), "port");
  assert.equal(lim(w[3]!, 25), "port");
  near(max(w0[2]!, 50) - max(w0[0]!, 50), 1.46, 0.02, "max SPL gain without Rg");
  for (const box of [0, 1]) [30, 40, 50, 60, 80, 100, 150].forEach((hz) => {
    const d = max(w[box + 2]!, hz) - max(w[box]!, hz);
    assert.ok(d >= 0.6 && d <= 1.25, `max SPL gain, box ${box} at ${hz} Hz: ${d}`);
  });
  near(max(w[3]!, 25), max(w[1]!, 25), 0.01, "port-limited at 25 Hz");
});

test("round vs slot port guide: tuning, end correction, air speed, compression, max SPL and pipe resonance", async () => {
  const { ventedFb, portLengthForFb, portPipeResonance, portEffectiveLength } = await import("../packages/engine/src/index.ts");
  const lumped = run("port-shape").map((d) => d.result);
  const pipes = run("port-shape-pipes").map((d) => d.result);
  [35.0, 35.0, 30.6].forEach((fb, i) => near(lumped[i]!.summary.fb!, fb, 0.05, `box ${i + 1} tuning`));
  // The end-correction table: the slot at 41.9 cm in 40 L, and the length for 35 Hz.
  const slot = { shape: "slot" as const, width_cm: 25.5, height_cm: 3.18, length_cm: 41.9 };
  const table: [number, number, number][] = [[0.732, 35.0, 41.9], [0.849, 34.6, 40.7], [0.888, 34.5, 40.4], [1.2, 33.4, 37.2], [1.5, 32.5, 34.1], [2.227, 30.6, 26.7]];
  for (const [k, fb, len] of table) {
    near(ventedFb(40, slot, 1, k), fb, 0.05, `slot tuning with K ${k}`);
    near(portLengthForFb(40, slot, 35, 1, k), len, 0.05, `slot length for 35 Hz with K ${k}`);
  }
  near(portEffectiveLength(slot) * 100, 49.3, 0.05, "slot effective length");
  near(portPipeResonance(slot), 347, 1.5, "slot pipe resonance");
  [[15, 765], [20, 625], [26, 513], [30, 458]].forEach(([l, f]) => near(portPipeResonance({ shape: "round", diameter_cm: 10.16, length_cm: l! }), f!, 1, `4in tube ${l} cm`));
  // Air speed, compression and max SPL at 350 W.
  const vmax = (r: (typeof lumped)[number]) => Math.max(...Array.from(r.portVelocity!).filter((_, i) => r.freq[i]! > 15));
  near(vmax(lumped[0]!), 11.2, 0.1, "flared port mouth speed");
  near(vmax(lumped[1]!), 21.9, 0.1, "slot speed");
  near(lumped[0]!.summary.portCompression!.db, 0.71, 0.05, "flared port compression");
  near(lumped[1]!.summary.portCompression!.db, 1.73, 0.05, "slot compression");
  const want = [[105.8, 109.9, 112.4], [102.3, 106.3, 109.8]];
  want.forEach((row, i) => [30, 35, 40].forEach((hz, k) => near(at(lumped[i]!.freq, lumped[i]!.maxSpl, hz), row[k]!, 0.06, `box ${i + 1} max SPL at ${hz} Hz`)));
  // Pipe resonance: a peak near 347 Hz for the round port, near 268 Hz for the longer slot.
  const peakNear = (r: (typeof pipes)[number], lo: number, hi: number) => {
    let best = -Infinity, f = 0;
    r.freq.forEach((x, i) => { if (x > lo && x < hi && r.spl[i]! > best) { best = r.spl[i]!; f = x; } });
    return f;
  };
  near(peakNear(pipes[0]!, 300, 400), 347, 6, "round port pipe peak");
  near(peakNear(pipes[2]!, 230, 300), 268, 6, "longer slot pipe peak");
});

test("Hofmann's Iron Law guide: efficiency, the law's constant, same-box SPL at 1 W and max SPL", async () => {
  const { alignmentDriver } = await import("../packages/web/src/sim.ts");
  const { ventedAlignmentFor } = await import("../packages/web/src/presets.ts");
  const { withDriver, ventedWith, byKind } = await import("./examples.ts");
  const { DEFAULT_STATE } = await import("../packages/web/src/state.ts");
  const c = 343.2;
  const k: number[] = [];
  for (const [id, db, vb, fb, f3] of [["bc-speakers/18sw115-8ohm", 94.8, 63.3, 39.2, 53.5], ["dayton-audio/ss18-22", 88.9, 145.6, 21.4, 25.0]] as const) {
    const s = withDriver({ ...DEFAULT_STATE, power: 1 }, id);
    const v = solveDriver(s).values;
    const eta = ((4 * Math.PI ** 2) / c ** 3) * v.fs! ** 3 * (v.vas_l! / 1000) / v.qes!;
    near(112.1 + 10 * Math.log10(eta), db, 0.06, `${id} 1 W efficiency`);
    const a = ventedAlignmentFor(alignmentDriver(solveDriver(s), s)!, 1)!;
    assert.equal(a.name, "QB3");
    near(a.vb_l, vb, 0.06, `${id} QB3 volume`);
    near(a.fb, fb, 0.06, `${id} QB3 tuning`);
    const box = { ...ventedWith(byKind(DEFAULT_STATE, "vented") as never, "QB3", Math.round(a.vb_l * 10) / 10, Math.round(a.fb * 10) / 10, { shape: "round", diameter_cm: 15 }), id: "x" };
    const r = runDesigns({ ...s, designs: [box] }, solveDriver(s))[0]!.result;
    near(r.summary.f3!, f3, 0.06, `${id} QB3 F3`);
    k.push(eta / (r.summary.f3! ** 3 * (a.vb_l / 1000)));
  }
  near(10 * Math.log10(k[1]! / k[0]!), 0.38, 0.05, "the two drivers' Iron Law constants");
  // Both drivers in both ported boxes and the sealed box, at 1 W; rows: B&C (PA, home), Dayton (PA, home).
  const P = run("iron-law").map((d) => d.result);
  const S = run("iron-law-sealed").map((d) => d.result);
  const spl = (r: (typeof P)[number], hz: number) => at(r.freq, r.spl, hz);
  const want: [typeof P[number], number[]][] = [
    [P[0]!, [81.3, 87.9, 93.1, 94.5, 95.4]], [P[2]!, [80.2, 86.7, 93.8, 90.4, 89.8]],
    [P[1]!, [84.8, 86.3, 88.3, 93.8, 95.1]], [P[3]!, [85.4, 87.1, 88.5, 89.7, 89.5]],
    [S[0]!, [79.9, 82.3, 85.8, 93.4, 94.9]], [S[1]!, [80.7, 82.9, 85.7, 89.3, 89.3]],
  ];
  want.forEach(([r, row], i) => [25, 30, 40, 100, 150].forEach((hz, j) => near(spl(r, hz), row[j]!, 0.06, `row ${i} at ${hz} Hz`)));
  near(P[3]!.summary.f3!, 26.4, 0.1, "home box F3 with the Dayton");
  near(P[0]!.summary.f3!, 35.0, 0.1, "PA box F3 with the B&C");
  // Max SPL: ported home box and sealed.
  const max = (r: (typeof P)[number], hz: number) => at(r.freq, r.maxSpl, hz);
  [[20, 0], [25, 0.6], [30, -0.4], [40, 0.4], [60, 2.8], [100, 5.3]].forEach(([hz, d]) => near(max(P[1]!, hz!) - max(P[3]!, hz!), d!, 0.06, `home box max SPL difference at ${hz} Hz`));
  [[15, -4.7], [20, -3.9], [30, -2.0]].forEach(([hz, d]) => near(max(S[0]!, hz!) - max(S[1]!, hz!), d!, 0.06, `sealed max SPL difference at ${hz} Hz`));
});
