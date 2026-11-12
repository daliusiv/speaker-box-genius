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
    { vb: 32.9, f3: 58.9, l25: -10.5, max30: 100.2 },
    { vb: 19.3, f3: 56.5, l25: -11.6, max30: 100.2 },
    { vb: 10.6, f3: 55.5, l25: -13.9, max30: 100.2 },
    { vb: 5.7, f3: 59.1, l25: -17.5, max30: 97.0 },
    { vb: 3.6, f3: 65.7, l25: -20.8, max30: 93.8 },
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
  near(ported!.result.summary.f3!, 43.2, 0.06, "ported F3");
  near(empty!.result.summary.fb!, 41.6, 0.06, "empty line tuning");
  near(mltl!.result.summary.fb!, 40.0, 0.06, "MLTL tuning");
  near(mltl!.result.summary.f3!, 40.2, 0.06, "MLTL F3");
});

test("group delay guide: sizes, F3, response peak and group delay of the three boxes, with and without the subsonic filter", () => {
  const want = [
    { vb: 38.9, f3: 45.2, gd: { 25: 6.2, 30: 6.1, 40: 5.6, 50: 4.7, 60: 3.7, 80: 2.4 } },
    { vb: 50, f3: 35.1, gd: { 25: 9.5, 30: 10.0, 40: 15.1, 50: 15.2, 60: 7.7, 80: 2.9 }, peak: { db: 5.5, hz: 51 }, gdPeak: { ms: 17.4, hz: 45 } },
    { vb: 83.5, f3: 23.3, gd: { 25: 24.7, 30: 15.5, 40: 7.3, 50: 4.6, 60: 3.2, 80: 2.0 }, gdPeak: { ms: 28.6, hz: 21.6 } },
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
  [10.8, 20.3, 12.5].forEach((ms, i) => near(filtered[i]!, ms, 0.2, `subsonic filter: box ${i + 1} at 40 Hz`));
});

test("one 15 vs two 10s guide: one project (the pair as the comparison driver), max SPL and limits on the same amplifier, at 28.3 V, and the pair in series", () => {
  const F = [20, 25, 30, 35, 40, 45, 50, 60, 80];
  const rows = run("subs-example");
  assert.deepEqual(rows.map((d) => d.label), ["100 L sealed · RSS390HF-4", "150 L ported, 22 Hz · RSS390HF-4", "100 L sealed · 2 × RSS265HF-4", "150 L ported, 22 Hz · 2 × RSS265HF-4"]);
  const want = [
    [101.8, 105.7, 108.9, 110.9, 112.0, 112.8, 113.2, 113.7, 114.0],
    [106.5, 112.3, 114.5, 115.1, 115.1, 115.0, 114.9, 114.7, 114.4],
    [99.3, 103.2, 106.4, 109.1, 111.4, 113.3, 114.0, 114.8, 115.4],
    [106.5, 112.3, 113.0, 113.5, 114.6, 115.7, 115.8, 115.9, 115.9],
  ];
  rows.forEach((d, i) => F.forEach((hz, k) => near(at(d.result.freq, d.result.maxSpl, hz), want[i]![k]!, 0.06, `${d.label} max SPL at ${hz} Hz`)));
  const limit = (r: (typeof rows)[number]["result"], hz: number) => r.limitedBy[r.freq.findIndex((f) => f >= hz)];
  assert.equal(limit(rows[0]!.result, 30), "xmax");
  assert.equal(limit(rows[0]!.result, 50), "amp");
  assert.equal(limit(rows[2]!.result, 40), "xmax");
  assert.equal(limit(rows[2]!.result, 50), "thermal");
  assert.equal(limit(rows[3]!.result, 25), "port");
  const peak = (r: (typeof rows)[number]["result"], y: ArrayLike<number>) => { let m = -Infinity; r.freq.forEach((f, i) => { if (f >= 10 && f <= 200) m = Math.max(m, y[i]!); }); return m; };
  // At 28.3 V: F3, Qtc, level, excursion, port speed.
  const at28 = [
    { f3: 33.6, qtc: 0.77, l80: 111.6, x: 11.4 },
    { f3: 22.4, l80: 112.0, x: 9.8, v: 14.5 },
    { f3: 40.0, qtc: 0.68, l80: 113.6, x: 14.6 },
    { f3: 21.9, l80: 114.1, x: 14.0, v: 21.1 },
  ];
  rows.forEach((d, i) => {
    const r = d.result;
    const w = at28[i]!;
    near(r.summary.f3!, w.f3, 0.06, `${d.label} F3`);
    if (w.qtc) near(r.summary.qtc!, w.qtc, 0.006, `${d.label} Qtc`);
    near(at(r.freq, r.spl, 80), w.l80, 0.06, `${d.label} at 80 Hz, 28.3 V`);
    near(peak(r, r.excursionMm), w.x, 0.06, `${d.label} excursion`);
    if (w.v) near(peak(r, r.portVelocity!), w.v, 0.06, `${d.label} port speed`);
  });
  // The amplifier at 80 Hz: the 15 at 37.4 V and about 367 W; the pair at about 15 A and 471 W.
  near(at(rows[0]!.result.freq, rows[0]!.result.ampAtMax.watts, 80), 367, 1, "15 watts at 80 Hz");
  near(at(rows[2]!.result.freq, rows[2]!.result.ampAtMax.amps, 80), 15.2, 0.06, "pair amps at 80 Hz");
  near(at(rows[2]!.result.freq, rows[2]!.result.ampAtMax.watts, 80), 471, 1, "pair watts at 80 Hz");
  // Per watt into Re they're within 0.2 dB: 86.7 and 86.9 dB (with the 0.1 Ω of amp and cable).
  near(rows[0]!.result.summary.referenceSpl - 10 * Math.log10(28.3 ** 2 / 3), 86.7, 0.06, "15 per watt");
  near(rows[2]!.result.summary.referenceSpl - 10 * Math.log10(28.3 ** 2 / 1.75), 86.9, 0.06, "pair per watt");
  // In series (8 Ω) the pair is amplifier-limited: 110.2 dB at 80 Hz sealed, 3.7 below the 15.
  const ser = run("subs-series");
  assert.equal(ser[2]!.label, "100 L sealed · 2 × RSS265HF-4 in series");
  near(at(ser[2]!.result.freq, ser[2]!.result.maxSpl, 80), 110.2, 0.06, "series pair at 80 Hz");
  assert.equal(limit(ser[2]!.result, 60), "amp");
  // Where the lines cross.
  const f = rows[0]!.result.freq;
  const cross = f.find((hz, i) => hz > 30 && rows[0]!.result.maxSpl[i]! < rows[2]!.result.maxSpl[i]!)!;
  near(cross, 42.7, 0.5, "crossover");
});

test("one 15 vs two 10s guide: the sealed box each wants for Qtc 0.707", async () => {
  const { sizeAllForDriver } = await import("../packages/web/src/presets.ts");
  const { withDriver } = await import("./examples.ts");
  const { DEFAULT_STATE } = await import("../packages/web/src/state.ts");
  const sealed = (id: string, drivers: number) => sizeAllForDriver({ ...withDriver(DEFAULT_STATE, id), drivers }).state.designs.find((d) => d.kind === "sealed")!.vb_l;
  assert.equal(sealed("dayton-audio/rss390hf-4", 1), 133.3);
  assert.equal(sealed("dayton-audio/rss265hf-4", 2), 79.6);
});

test("power compression guide: loss at the same voltage, the hump and the excursion at 120 and 180 °C", () => {
  const [cold, warm, hot] = ["coil-20", "coil-120", "coil-180"].map((n) => run(n)[0]!.result);
  const spl = (r: typeof cold, hz: number) => at(r!.freq, r!.spl, hz);
  near(spl(cold, 25), 107.1, 0.06, "cold at 25 Hz");
  const loss: Record<number, [number, number]> = { 20: [1.7, 2.7], 25: [2.2, 3.4], 30: [1.4, 2.1], 40: [0.6, 0.9], 50: [0.9, 1.4], 60: [1.4, 2.2], 80: [2.0, 3.1], 100: [2.4, 3.6], 150: [2.7, 4.0] };
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
  near(hump(warm), 1.49, 0.06, "hump at 120 °C");
  near(hump(hot), 2.45, 0.06, "hump at 180 °C");
  [8.75, 8.04, 7.66].forEach((mm, i) => near(at([cold, warm, hot][i]!.freq, [cold, warm, hot][i]!.excursionMm, 35), mm, 0.02, `excursion at 35 Hz, box ${i}`));
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
  // Impedance: a quarter in parallel; 4.25–16.3 Ω in series in the sealed box, peak at 52.7 Hz.
  near(Math.max(...w[0]!.impedanceOhm), 16.3, 0.05, "series sealed impedance peak");
  near(Math.max(...w[2]!.impedanceOhm), 4.07, 0.02, "parallel sealed impedance peak");
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
  near(vmax(lumped[0]!), 11.0, 0.1, "flared port mouth speed");
  near(vmax(lumped[1]!), 21.6, 0.1, "slot speed");
  near(lumped[0]!.summary.portCompression!.db, 0.68, 0.05, "flared port compression");
  near(lumped[1]!.summary.portCompression!.db, 1.68, 0.05, "slot compression");
  const want = [[105.7, 109.7, 112.3], [102.3, 106.3, 109.8]];
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
  for (const [id, db, vb, fb, f3] of [["bc-speakers/18sw115-8ohm", 94.8, 70.4, 41.1, 49.0], ["dayton-audio/ss18-22", 88.9, 167.9, 22.1, 22.9]] as const) {
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
  near(10 * Math.log10(k[1]! / k[0]!), 0.3, 0.05, "the two drivers' Iron Law constants");
  near(k[0]! * 1e6, 2.26, 0.01, "PA kη"); near(k[1]! * 1e6, 2.40, 0.01, "home kη");
  // Both drivers in both ported boxes and the sealed box, at 1 W; rows: B&C (PA, home), Dayton (PA, home).
  const P = run("iron-law").map((d) => d.result);
  const S = run("iron-law-sealed").map((d) => d.result);
  const spl = (r: (typeof P)[number], hz: number) => at(r.freq, r.spl, hz);
  const want: [typeof P[number], number[]][] = [
    [P[0]!, [81.2, 87.8, 93.0, 94.5, 95.3]], [P[2]!, [80.1, 86.6, 93.7, 90.3, 89.6]],
    [P[1]!, [84.7, 86.2, 88.3, 93.7, 94.9]], [P[3]!, [85.3, 87.0, 88.4, 89.5, 89.3]],
    [S[0]!, [79.8, 82.3, 85.7, 93.3, 94.8]], [S[1]!, [80.6, 82.9, 85.7, 89.1, 89.1]],
  ];
  want.forEach(([r, row], i) => [25, 30, 40, 100, 150].forEach((hz, j) => near(spl(r, hz), row[j]!, 0.06, `row ${i} at ${hz} Hz`)));
  near(P[3]!.summary.f3!, 26.2, 0.1, "home box F3 with the Dayton");
  near(P[0]!.summary.f3!, 34.9, 0.1, "PA box F3 with the B&C");
  // Max SPL: ported home box and sealed.
  const max = (r: (typeof P)[number], hz: number) => at(r.freq, r.maxSpl, hz);
  [[20, 0], [25, 0.6], [30, -0.3], [40, 0.4], [60, 2.9], [100, 5.4]].forEach(([hz, d]) => near(max(P[1]!, hz!) - max(P[3]!, hz!), d!, 0.06, `home box max SPL difference at ${hz} Hz`));
  [[15, -4.6], [20, -3.8], [30, -1.9]].forEach(([hz, d]) => near(max(S[0]!, hz!) - max(S[1]!, hz!), d!, 0.06, `sealed max SPL difference at ${hz} Hz`));
});

test("baffle step guide: loss, step frequency, compensation, excursion and max SPL", async () => {
  const { baffleStepFrequency } = await import("../packages/engine/src/index.ts");
  const { baffleOf } = await import("../packages/web/src/sim.ts");
  const r = (name: string) => run(name)[0]!.result;
  const ib = r("baffle-ib"), free = r("baffle-free"), eq3 = r("baffle-eq3"), pas = r("baffle-passive");
  const spl = (x: typeof ib, hz: number) => at(x.freq, x.spl, hz);
  [[40, 87.4], [100, 87.8], [200, 87.9], [500, 87.9]].forEach(([hz, v]) => near(spl(ib, hz!), v!, 0.06, `infinite baffle at ${hz} Hz`));
  [[40, 81.4], [100, 82.4], [200, 83.8], [300, 85.3], [500, 87.6], [1000, 89.5]].forEach(([hz, v]) => near(spl(free, hz!), v!, 0.06, `free-standing at ${hz} Hz`));
  [[40, -5.9], [100, -5.4], [200, -4.1], [300, -2.6]].forEach(([hz, v]) => near(spl(free, hz!) - spl(ib, hz!), v!, 0.06, `loss at ${hz} Hz`));
  const s = EXAMPLES["baffle-free"]!();
  const b = baffleOf(s, solveDriver(s).values.sd_cm2)!;
  near(baffleStepFrequency(b), 272, 1, "step frequency");
  near(free.summary.f3!, 31.1, 0.06, "F3 unchanged");
  // +3 dB shelf: level, F3 and excursion at 2.83 V.
  near(spl(eq3, 40), 84.4, 0.06, "+3 dB shelf at 40 Hz");
  near(spl(eq3, 100), 85.0, 0.06, "+3 dB shelf at 100 Hz");
  near(eq3.summary.f3!, 27.8, 0.06, "+3 dB shelf F3");
  near(at(free.freq, free.excursionMm, 40), 1.54, 0.02, "excursion at 40 Hz");
  near(at(eq3.freq, eq3.excursionMm, 40), 2.16, 0.02, "excursion at 40 Hz with +3 dB");
  // Passive 2.4 mH ∥ 5.6 Ω: 81–84 dB from 40 Hz to 1 kHz.
  near(spl(pas, 40), 81.1, 0.06, "passive at 40 Hz");
  [60, 100, 200, 300, 500, 1000].forEach((hz) => { const v = spl(pas, hz); assert.ok(v >= 81.9 && v <= 84.2, `passive at ${hz} Hz: ${v}`); });
  // Max SPL: infinite baffle vs free-standing.
  [[30, 95.9, 90.0], [50, 97.6, 91.8], [100, 103.3, 97.9]].forEach(([hz, a, f]) => {
    near(at(ib.freq, ib.maxSpl, hz!), a!, 0.06, `max SPL infinite baffle at ${hz} Hz`);
    near(at(free.freq, free.maxSpl, hz!), f!, 0.06, `max SPL free-standing at ${hz} Hz`);
  });
  // The step for other baffles.
  const shape = (width: number, height: number, x: number, y: number) => baffleStepFrequency({ ...b, width: width / 100, height: height / 100, x: x / 100, y: y / 100 });
  near(shape(20, 20, 10, 10), 340, 3, "20 cm square");
  near(shape(30, 30, 15, 15), 218, 3, "30 cm square");
  near(shape(20, 100, 10, 25), 183, 3, "20 × 100 tower");
});

test("shaped cabinets guide: four shapes sized to the same net volume, their sizes, modes and the shortcuts' errors", async () => {
  const { grossVolume, insideLongest_cm, lowestMode_hz } = await import("../packages/engine/src/index.ts");
  const { shapeOf, volumeFor, linkedDesign } = await import("../packages/web/src/sim.ts");
  const want = {
    "shape-box": { dims: [49.3, 79.7, 30.4], gross: 93.2, net: 83.4, outer: 119, foot: 0.15, long: 76.1, mode: 226 },
    "shape-tube": { dims: [36.8, 98.5], gross: 90.48, net: 83.5, outer: 97, foot: 0.11, long: 90.9, mode: 189 },
    "shape-sphere": { dims: [58.7], gross: 90.48, net: 83.5, outer: 106, foot: 0.27, long: 55.7, mode: 409 },
    "shape-wedge": { dims: [53.2, 53.2, 31.9, 31.9, 63.9], gross: 93.28, net: 83.5, outer: 118, foot: 0.28, long: 60.3, mode: 285 },
  } as const;
  for (const [name, w] of Object.entries(want)) {
    const s = EXAMPLES[name]!();
    const v = s.volume;
    const dims = v.shape === "box" ? [v.width_cm, v.height_cm, v.depth_cm] : v.shape === "cylinder" ? [v.diameter_cm, v.height_cm] : v.shape === "sphere" ? [v.diameter_cm] : [v.width_cm, v.depth_cm, v.topWidth_cm, v.topDepth_cm, v.height_cm];
    assert.deepEqual(dims, w.dims, `${name} size`);
    const r = volumeFor(s, linkedDesign(s));
    const sh = shapeOf(v);
    near(r.gross_l, w.gross, 0.006, `${name} gross`);
    near(r.net_l, w.net, 0.06, `${name} net`);
    near(grossVolume(sh, 0), w.outer, 0.5, `${name} outside volume`);
    const foot = v.shape === "box" || v.shape === "frustum" ? v.width_cm * v.depth_cm : Math.PI * (v.diameter_cm / 2) ** 2;
    near(foot / 10000, w.foot, 0.005, `${name} floor space (m²)`);
    near(insideLongest_cm(sh, v.wall_mm), w.long, 0.05, `${name} longest run`);
    near(lowestMode_hz(sh, v.wall_mm, 343.6), w.mode, 0.5, `${name} lowest mode`);
    const d = run(name)[0]!.result.summary;
    near(d.fb!, 23.8, 0.05, `${name} tuning`);
    near(d.f3!, 24.4, 0.05, `${name} F3`);
    assert.equal(run(name)[0]!.design.kind, "vented");
  }
  // Deductions: driver 3.01 L, port 4.02 L, bracing 2.80 L.
  const box = volumeFor(EXAMPLES["shape-box"]!(), linkedDesign(EXAMPLES["shape-box"]!()));
  assert.deepEqual(box.deductions.map((x) => Math.round(x.litres * 100) / 100), [3.01, 4.02, 2.8]);
  // The tube entered wrongly.
  const tube = EXAMPLES["shape-tube"]!();
  const as = (patch: Partial<typeof tube.volume>) => { const t = { ...tube, volume: { ...tube.volume, ...patch } }; return { net: volumeFor(t, linkedDesign(t)).net_l, fb: runDesigns(t, solveDriver(t))[0]!.result.summary.fb! }; };
  near(as({ capWall_mm: null }).net, 89.8, 0.05, "caps = wall");
  near(as({ capWall_mm: null }).fb, 22.9, 0.05, "caps = wall tuning");
  near(as({ diameter_cm: 35.6 }).net, 77.5, 0.05, "ID as OD");
  near(as({ diameter_cm: 35.6 }).fb, 24.7, 0.05, "ID as OD tuning");
  // Standing waves across a tube, the pipe resonance.
  near((1.8412 * 343.6) / (Math.PI * 0.356), 565, 1, "tube across");
  // The shortcuts: the frustum formula on a wedge, and upright walls on a pyramid.
  const wedge = (q: number) => grossVolume({ kind: "frustum", bottomWidth_cm: 60, bottomDepth_cm: 60, topWidth_cm: 60, topDepth_cm: 60 * q, height_cm: 50 });
  const naive = (q: number) => (50 / 3) * (3600 + 3600 * q + Math.sqrt(3600 * 3600 * q)) / 1000;
  near(wedge(0), 90, 1e-9, "wedge to an edge");
  near(naive(0), 60, 1e-9, "frustum formula on it");
  near((naive(0.5) / wedge(0.5) - 1) * 100, -1.9, 0.05, "half-deep top");
  near(grossVolume({ kind: "frustum", bottomWidth_cm: 50, bottomDepth_cm: 50, topWidth_cm: 0, topDepth_cm: 0, height_cm: 40 }, 18), 22.0, 0.05, "pyramid inside");
  // A sloping board is t / cos θ wide across: 45°, and the example's tapered box.
  near(18 / Math.cos(Math.PI / 4), 25.5, 0.05, "18 mm at 45°");
  const wv = EXAMPLES["shape-wedge"]!().volume;
  const slope = Math.atan((wv.width_cm - wv.topWidth_cm) / 2 / wv.height_cm);
  near((slope * 180) / Math.PI, 9.5, 0.05, "example slope");
  near(18 / Math.cos(slope), 18.25, 0.005, "18 mm at the example slope");
  // The car wedge: exact against the shortcut and against the tapered shape.
  const car = { kind: "wedge", width_cm: 80, height_cm: 38, topDepth_cm: 25, bottomDepth_cm: 40 } as const;
  near(grossVolume(car, 18), 75.6, 0.005, "car wedge");
  near((76.4 * 34.4 * (32.5 - 3.6)) / 1000, 75.95, 0.005, "car wedge shortcut");
  near(((76.4 * 34.4 * (32.5 - 3.6)) / 1000 / grossVolume(car, 18) - 1) * 100, 0.47, 0.005, "shortcut error");
  const tapered = grossVolume({ kind: "frustum", bottomWidth_cm: 80, bottomDepth_cm: 40, topWidth_cm: 80, topDepth_cm: 25, height_cm: 38 }, 18);
  near((tapered / grossVolume(car, 18) - 1) * 100, 0.2, 0.05, "tapered shape on a car wedge");
  near(90 - Math.atan2(380, 150) * 180 / Math.PI, 21.5, 0.05, "bevel");
});

test("amplifier matching guide: the amp's limits, the sub's impedance, watts at the rated voltage, and four wirings", async () => {
  const { ampLimitsFromRatings, ampPowerInto } = await import("../packages/web/src/ampRating.ts");
  // The Crown XLS 1002 as a voltage and a current limit, per channel and bridged.
  const ch = ampLimitsFromRatings([{ watts: 350, ohms: 4 }, { watts: 550, ohms: 2 }])!;
  assert.deepEqual(ch, { volts: 37.4, amps: 16.6 });
  assert.deepEqual(ampLimitsFromRatings([{ watts: 700, ohms: 8 }, { watts: 1100, ohms: 4 }]), { volts: 74.8, amps: 16.6 });
  near(ampPowerInto(ch, 8), 175, 0.5, "model into 8 Ω (rated 215 W)");
  near(Math.sqrt(215 * 8), 41.5, 0.05, "8 Ω rating's voltage");
  near(ampLimitsFromRatings([{ watts: 525, ohms: 4 }, { watts: 775, ohms: 2 }])!.volts, 45.8, 1e-9, "XLS 1502 volts");
  // The sub's rating as a voltage, and the amp's 4 Ω watts in the sub's V²/Re terms.
  near(Math.sqrt(400 * 3.1), 35.2, 0.05, "volts for 400 W into Re");
  near(37.4 ** 2 / 3.1, 451, 0.5, "350 W @ 4 Ω as V²/Re");
  near(20 * Math.log10(37.4 / 35.2), 0.53, 0.005, "XLS 1002 headroom");
  near(20 * Math.log10(45.8 / 35.2), 2.29, 0.005, "XLS 1502 headroom");
  near((2 * 37.4 ** 2) / 3.1, 902, 1, "clipped to a square wave, V²/Re");
  const r = (name: string) => run(name)[0]!.result as any;
  const one = r("amp-one"), par = r("amp-parallel"), ser = r("amp-series"), bri = r("amp-bridged");
  const ix = (x: any, hz: number) => (x.freq as Float64Array).findIndex((f) => f >= hz);
  const extreme = (x: any, key: string, lo: number, hi: number, sign: 1 | -1) => {
    let best = { v: -Infinity, f: 0 };
    x.freq.forEach((f: number, i: number) => { if (f >= lo && f <= hi && sign * x[key][i] > best.v) best = { v: sign * x[key][i], f }; });
    return { v: sign * best.v, f: best.f };
  };
  // One sub's impedance: dips, peaks, phase.
  const zmin = extreme(one, "impedanceOhm", 15, 500, -1);
  near(zmin.v, 3.15, 0.005, "one sub lowest |Z|"); near(zmin.f, 183, 3, "where");
  near(one.impedanceOhm[ix(one, 23.8)], 3.88, 0.01, "|Z| at the tuning");
  const lowPk = extreme(one, "impedanceOhm", 10, 20, 1), hiPk = extreme(one, "impedanceOhm", 30, 60, 1);
  near(lowPk.v, 17.3, 0.05, "lower peak"); near(lowPk.f, 14.6, 0.15, "at");
  near(hiPk.v, 17.5, 0.05, "upper peak"); near(hiPk.f, 39.5, 0.2, "at");
  near(one.impedanceOhm[ix(one, 50)], 7.84, 0.01, "|Z| at 50 Hz");
  near(one.impedancePhaseDeg[ix(one, 50)], -45, 0.5, "phase at 50 Hz");
  near(3.15 / 4, 0.79, 0.005, "79% of 4 Ω");
  // Watts at the rated 35.2 V follow the impedance; the SPL doesn't.
  [[25, 293], [40, 70], [100, 320], [150, 376]].forEach(([hz, w]) => near(one.ampAtMax.watts[ix(one, hz!)], w!, 1, `watts at ${hz} Hz`));
  near(extreme({ freq: one.freq, w: one.ampAtMax.watts }, "w", 24, 200, 1).v, 381, 1, "most watts 24–200 Hz");
  near(extreme({ freq: one.freq, w: one.ampAtMax.watts }, "w", 24, 200, -1).v, 70, 1, "fewest watts 24–200 Hz");
  near(extreme(one, "spl", 30, 200, 1).v - extreme(one, "spl", 30, 200, -1).v, 1.37, 0.05, "SPL spread 30–200 Hz");
  near(extreme({ freq: one.freq, amps: one.ampAtMax.amps }, "amps", 15, 200, 1).v, 10.8, 0.05, "one sub's peak current");
  // Two in parallel on one channel: the dips and the current limit.
  near(extreme(par, "impedanceOhm", 15, 500, -1).v, 1.58, 0.005, "parallel lowest |Z|");
  near(par.impedanceOhm[ix(par, 23.8)], 1.94, 0.01, "parallel |Z| at the tuning");
  const lim: number[] = []; par.freq.forEach((f: number, i: number) => { if (par.limitedBy[i] === "amp") lim.push(f); });
  near(lim[0]!, 22.2, 0.15, "amp-limited from"); near(Math.max(...lim.filter((f) => f < 40)), 25.3, 0.15, "to");
  near(Math.min(...lim.filter((f) => f > 40)), 79.0, 0.3, "and again from");
  const unl = (() => { const s = EXAMPLES["amp-parallel"]!(); const t = { ...s, settings: { ...s.settings, ampVolts: 0, ampAmps: 0 } }; return runDesigns(t, solveDriver(t))[0]!.result as any; })();
  near(unl.ampAtMax.amps[ix(unl, 23.8)], 17.2, 0.05, "current wanted at the tuning");
  [[23.8, 115.1, 115.4], [25, 116.1, 116.1], [80, 118.2, 118.3], [100, 117.2, 118.3], [150, 116.3, 118.2]].forEach(([hz, a, b]) => {
    near(par.maxSpl[ix(par, hz!)], a!, 0.05, `parallel max SPL at ${hz} Hz`);
    near(unl.maxSpl[ix(unl, hz!)], b!, 0.05, `unlimited at ${hz} Hz`);
  });
  // The other wirings at 30 Hz, and what limits them.
  near(one.maxSpl[ix(one, 30)], 111.3, 0.05, "one sub at 30 Hz");
  near(ser.maxSpl[ix(ser, 30)], 111.9, 0.05, "series, one channel at 30 Hz");
  near(bri.maxSpl[ix(bri, 30)], 117.4, 0.05, "series, bridged at 30 Hz");
  near(par.maxSpl[ix(par, 30)], 117.2, 0.05, "parallel at 30 Hz");
  near(one.maxSpl[ix(one, 100)], 112.5, 0.05, "one sub at 100 Hz");
  near(ser.maxSpl[ix(ser, 100)], 113.2, 0.05, "series, one channel at 100 Hz");
  near(bri.maxSpl[ix(bri, 100)], 118.7, 0.05, "series, bridged at 100 Hz");
  assert.equal(ser.limitedBy[ix(ser, 30)], "amp");
  assert.equal(bri.limitedBy[ix(bri, 30)], "thermal");
  assert.ok(!bri.limitedBy.includes("amp"), "bridged never meets the amp's limits");
  near(extreme({ freq: bri.freq, amps: bri.ampAtMax.amps }, "amps", 15, 200, 1).v, 11.0, 0.05, "bridged peak current");
  near(extreme({ freq: ser.freq, amps: ser.ampAtMax.amps }, "amps", 15, 200, 1).v, 5.84, 0.05, "series peak current");
});

test("sealed / ported / PR guide: presets, rules of thumb, the three boxes at 350 W with and without a filter", async () => {
  const { sizeAllForDriver } = await import("../packages/web/src/presets.ts");
  const { boxSuits } = await import("../packages/web/src/boxType.ts");
  const { withDriver, prParams, BOX_TYPES } = await import("./examples.ts");
  const { DEFAULT_STATE } = await import("../packages/web/src/state.ts");
  // The presets still give the example's boxes (so the guide can't drift from the app).
  let s0 = withDriver({ ...DEFAULT_STATE, power: 350 }, "dayton-audio/rss265hf-4");
  s0 = { ...s0, designs: s0.designs.map((d) => (d.kind === "pr" ? ({ ...d, prName: "Dayton Audio RSS265-PR", params: prParams("dayton-audio/rss265-pr"), count: 2, extra: [] } as typeof d) : d)) };
  const sized = sizeAllForDriver(s0);
  const by = (k: string) => sized.state.designs.find((d) => d.kind === k) as any;
  assert.equal(by("sealed").vb_l, BOX_TYPES.sealed_l); assert.equal(by("sealed").preset, "Qtc 0.707");
  assert.equal(by("vented").vb_l, BOX_TYPES.vented_l); assert.equal(by("vented").targetFb, BOX_TYPES.fb); assert.equal(by("vented").preset, "QB3");
  assert.equal(by("pr").addedMass_g, 164);
  assert.match(sized.changed.join("\n"), /a 7\.5 cm flared port \(still over the chuffing line at its 350 W rating\)/);
  // The textbook box the guide mentions: Keele's formula with the app's Qts (from Qes and Qms).
  const qts = (0.53 * 3.06) / (0.53 + 3.06);
  near(15 * qts ** 2.87 * 54, 82.8, 0.05, "Keele Vb");
  near(54 / ((0.707 / qts) ** 2 - 1), 37.3, 0.05, "Qtc 0.707: Vas / ((Qtc/Qts)² − 1)");
  // The rules of thumb for the three drivers in the table.
  const suits = [boxSuits(29.6, 0.69, 3.25)!, boxSuits(25.6, 0.53, 3.06)!, boxSuits(35, 0.4, 1.87)!];
  assert.deepEqual(suits.map((b) => [Math.round(b.ebp), Math.round(b.qts * 100) / 100, b.text]), [
    [43, 0.57, "leans sealed, ported can work too"], [48, 0.45, "leans sealed, ported can work too"], [88, 0.33, "leans ported, sealed can work too"],
  ]);
  // The three boxes, filtered (the example) and not.
  const all = (name: string) => run(name).map((d) => d.result as any);
  const [se, po, pr] = all("box-types-example");
  const [se0, po0, pr0] = all("box-types-nofilter");
  const ix = (r: any, hz: number) => (r.freq as Float64Array).findIndex((f) => f >= hz);
  const peak = (r: any, k: string, lo = 10, hi = 500) => { let b = { v: -1, f: 0 }; r.freq.forEach((f: number, i: number) => { if (f >= lo && f <= hi && r[k][i] > b.v) b = { v: r[k][i], f }; }); return b; };
  const dip = (r: any, lo: number, hi: number) => { let b = { v: 1e9, f: 0 }; r.freq.forEach((f: number, i: number) => { if (f >= lo && f <= hi && r.excursionMm[i] < b.v) b = { v: r.excursionMm[i], f }; }); return b; };
  [[se, 41.1], [po, 21.1], [pr, 23.2], [po0, 20.1], [pr0, 22.65]].forEach(([r, f3], i) => near((r as any).summary.f3, f3 as number, 0.05, `F3 ${i}`));
  near(po.summary.fb, 22.3, 0.05, "ported Fb"); near(pr.summary.fb, 22.8, 0.05, "PR Fb");
  const v = run("box-types-example")[1]!.design as any; assert.equal(v.length_cm, 50.5);
  near(peak(po, "portVelocity").v, 15.03, 0.05, "port speed at 350 W");
  ([[se, [93.25, 97.4, 100.4, 105.4]], [po, [104.6, 109.45, 107.3, 108.6]], [pr, [96.1, 106.8, 105.3, 107.6]]] as const).forEach(([r, m], k) =>
    [20, 25, 30, 40].forEach((hz, j) => near(r.maxSpl[ix(r, hz)], m[j]!, 0.05, `max SPL ${k} at ${hz} Hz`)));
  ([[se, 24.5, 3.59], [po, 35.0, 6.54], [pr, 30.9, 5.01]] as const).forEach(([r, V, A], k) => {
    near(r.ampAtMax.volts[ix(r, 25)], V, 0.05, `volts ${k}`); near(r.ampAtMax.amps[ix(r, 25)], A, 0.05, `amps ${k}`);
  });
  // Cone (and PR) travel at 350 W.
  ([[se, 17.0, 25.0], [po, 18.4, 17.3], [pr, 19.8, 18.5], [se0, 19.96, 10], [po0, 43.5, 10], [pr0, 35.6, 10]] as const).forEach(([r, x, f], k) => {
    const p = peak(r, "excursionMm"); near(p.v, x, 0.05, `peak travel ${k}`); near(p.f, f, 0.3, `where ${k}`);
  });
  near(peak(pr, "prExcursionMm").v, 21.5, 0.05, "PR travel, filtered"); near(peak(pr0, "prExcursionMm").v, 24.2, 0.05, "PR travel, no filter");
  near(dip(po, 18, 30).v, 6.27, 0.05, "ported dip"); near(dip(po, 18, 30).f, 22.5, 0.3, "at");
  near(dip(pr, 18, 30).v, 9.93, 0.05, "PR dip");
  // Watts each box takes before its first limit (from the 350 W the slider shows).
  const w = (r: any, hz: number) => 350 * 10 ** ((r.maxSpl[ix(r, hz)] - r.spl[ix(r, hz)]) / 10);
  ([[se, 183, 284], [po, 373, 278], [pr, 291, 276]] as const).forEach(([r, a, b], k) => { near(w(r, 25), a, 1, `W at 25 Hz ${k}`); near(w(r, 40), b, 1, `W at 40 Hz ${k}`); });
  // Group delay.
  ([[se, 22.8, 11.0], [po, 39.1, 11.8], [pr, 43.6, 11.3], [se0, 6.9, 5.8], [po0, 23.3, 6.6], [pr0, 27.8, 6.1]] as const).forEach(([r, a, b], k) => {
    near(r.groupDelayMs[ix(r, 25)], a, 0.05, `GD 25 ${k}`); near(r.groupDelayMs[ix(r, 40)], b, 0.05, `GD 40 ${k}`);
  });
  // Where the sealed box out-plays the others, and the PR's notch.
  const below = (a: any) => { let f0 = 0; a.freq.forEach((f: number, i: number) => { if (f >= 10 && f <= 30 && a.maxSpl[i] < se.maxSpl[i]) f0 = f; }); return f0; };
  near(below(po), 15.6, 0.3, "sealed beats ported below"); near(below(pr), 19.2, 0.3, "sealed beats PR below");
  near(19.6 * Math.sqrt(200 / 350), 14.8, 0.05, "PR resonance with 150 g");
  // The PR's other tunings: the preset's 164 g, and three disks.
  for (const [m, fb, f3] of [[164, 22.4, 23.15], [225, 20.7, 26.21]]) {
    const s = EXAMPLES["box-types-example"]!();
    const t = { ...s, designs: [{ ...s.designs[2]!, addedMass_g: m } as any] };
    const r = runDesigns(t, solveDriver(t))[0]!.result;
    near(r.summary.fb!, fb!, 0.05, `fb with ${m} g`); near(r.summary.f3!, f3!, 0.05, `F3 with ${m} g`);
  }
});

test("car subwoofer guide: what the text says about the three boxes (its numbers come from the engine at build: site/liveNumbers.ts)", () => {
  const peak = (f: Float64Array, y: ArrayLike<number>, lo: number, hi: number) => {
    let m = -Infinity, mf = 0;
    f.forEach((q, i) => { if (q >= lo && q <= hi && y[i]! > m) { m = y[i]!; mf = q; } });
    return [m, mf] as const;
  };
  const car = run("car-example");
  const out = run("car-nocabin");
  const [se, p33, p28] = car.map((d) => d.result);
  const hump = (r: typeof se) => peak(r.freq, r.spl, 15, 200)[0] - at(r.freq, r.spl, 80);
  const xPeak = (r: typeof se) => peak(r.freq, r.excursionMm, 10, 200)[0];
  // "All three boxes reach the low 20s" in the car.
  car.forEach((d) => assert.ok(d.f3Room! > 19 && d.f3Room! < 25, `${d.design.name} F3 in the car ${d.f3Room}`));
  // "The ported boxes … sit 5–7 dB higher at 30–40 Hz with a hump"; the sealed box has the smallest hump.
  for (const p of [p33, p28]) for (const f of [30, 40]) {
    const d = at(p.freq, p.spl, f) - at(se.freq, se.spl, f);
    assert.ok(d > 4.5 && d < 7.5, `ported over sealed at ${f} Hz: ${d}`);
  }
  assert.ok(hump(se) < Math.min(hump(p33), hump(p28)), "sealed hump smallest");
  // The table's bold cells: the 28 Hz box loudest at 25 and 30 Hz, the 33 Hz box at 40 Hz.
  for (const f of [25, 30]) assert.ok(at(p28.freq, p28.spl, f) > Math.max(at(se.freq, se.spl, f), at(p33.freq, p33.spl, f)), `28 Hz box loudest at ${f} Hz`);
  assert.ok(at(p33.freq, p33.spl, 40) > Math.max(at(se.freq, se.spl, 40), at(p28.freq, p28.spl, 40)), "33 Hz box loudest at 40 Hz");
  // "Tuning lower … moves the hump down … makes it smaller."
  assert.ok(peak(p28.freq, p28.spl, 15, 200)[1] < peak(p33.freq, p33.spl, 15, 200)[1] && hump(p28) < hump(p33), "28 Hz hump lower and smaller");
  // "The sealed curve is the only one that crosses the red Xmax line"; "28 Hz box just under".
  assert.ok(xPeak(se) > 12.3 && xPeak(p33) < 12.3 && xPeak(p28) < 12.3 && xPeak(p28) > 11.5, "only sealed over Xmax");
  // Max SPL: the sealed box cone-limited up to 45 Hz; the 28 Hz box limited by power at 25 and 30 Hz.
  se.freq.forEach((f, i) => { if (f >= 10 && f <= 44) assert.equal(se.limitedBy[i], "xmax", `sealed at ${f} Hz`); });
  for (const f of [25, 30]) assert.equal(p28.limitedBy[p28.freq.findIndex((q) => q >= f)], "thermal", `28 Hz box at ${f} Hz`);
  // Both ports under the 17 m/s chuffing line.
  for (const p of [p33, p28]) assert.ok(peak(p.freq, p.portVelocity!, 10, 200)[0] < 17, "port under 17 m/s");
  // Out of the car: "the sealed box … is 14 dB down at 25 Hz"; the ported boxes "nearly flat" (humps under 2 dB).
  const [oSe, o33, o28] = out.map((d) => d.result);
  const down25 = at(oSe.freq, oSe.spl, 80) - at(oSe.freq, oSe.spl, 25);
  assert.ok(down25 > 13.5 && down25 < 15, `sealed 25 Hz out of the car: ${down25}`);
  assert.ok(hump(o33) < 2 && hump(o28) < 2, "ported nearly flat out of the car");
  // "The excursion and port speed are exactly the same in the car and out of it."
  car.forEach((d, i) => {
    assert.deepEqual(Array.from(out[i]!.result.excursionMm), Array.from(d.result.excursionMm), `${d.design.name} excursion`);
    if (d.result.portVelocity) assert.deepEqual(Array.from(out[i]!.result.portVelocity!), Array.from(d.result.portVelocity), `${d.design.name} port speed`);
  });
  // No subsonic filter: the ported cones reach about 36 mm at 15 Hz, the sealed one 16 mm.
  const s0 = EXAMPLES["car-example"]!();
  const s = { ...s0, highPass: { ...s0.highPass, on: false } };
  const bare = runDesigns(s, solveDriver(s));
  [15.9, 35.9, 36.2].forEach((x, i) => near(at(bare[i]!.result.freq, bare[i]!.result.excursionMm, 15), x, 0.6, `${bare[i]!.design.name} at 15 Hz, no filter`));
});

test("compare drivers guide: RSS265HF-4 vs RSS265HO-4 at 350 W in 30 L sealed and 50 L ported at 26 Hz, and the boxes the app sizes for each", async () => {
  const peak = (f: Float64Array, y: ArrayLike<number>) => { let m = -Infinity; f.forEach((q, i) => { if (q >= 10 && q <= 300) m = Math.max(m, y[i]!); }); return m; };
  const rows = run("compare-example");
  assert.deepEqual(rows.map((d) => d.label), ["Sealed 30 L · RSS265HF-4", "Ported 50 L, 26 Hz · RSS265HF-4", "Sealed 30 L · RSS265HO-4", "Ported 50 L, 26 Hz · RSS265HO-4"]);
  const want = [
    { f3: 41.9, ref: 109.6, spl: [98.0, 101.9, 106.1, 109.2], max: [97.2, 100.4, 105.4], v30: 28.3, x: 14.6 },
    { f3: 26.4, ref: 109.6, spl: [105.2, 108.8, 110.7, 110.8], max: [106.6, 109.2, 110.1], v30: 35.0, x: 13.1, port: 10.3, len: 67.4 },
    { f3: 54.3, ref: 108.9, spl: [96.7, 99.9, 103.3, 106.6], max: [97.0, 100.2, 105.3], v30: 34.7, x: 12.1 },
    { f3: 24.2, ref: 108.9, spl: [107.1, 109.0, 108.0, 108.3], max: [109.6, 111.7, 110.0], v30: 45.8, x: 10.6, port: 12.8, len: 67.4 },
  ];
  rows.forEach((d, i) => {
    const r = d.result;
    const w = want[i]!;
    near(r.summary.f3!, w.f3, 0.06, `${d.label} F3`);
    near(r.summary.referenceSpl, w.ref, 0.06, `${d.label} passband level`);
    [25, 30, 40, 60].forEach((f, j) => near(at(r.freq, r.spl, f), w.spl[j]!, 0.06, `${d.label} at ${f} Hz`));
    [25, 30, 40].forEach((f, j) => near(at(r.freq, r.maxSpl, f), w.max[j]!, 0.06, `${d.label} max SPL at ${f} Hz`));
    near(at(r.freq, r.ampAtMax.volts, 30), w.v30, 0.06, `${d.label} volts for max SPL at 30 Hz`);
    near(peak(r.freq, r.excursionMm), w.x, 0.06, `${d.label} peak excursion`);
    if (w.port) near(peak(r.freq, r.portVelocity!), w.port, 0.06, `${d.label} port speed`);
    if (w.len) near((d.design as { length_cm: number }).length_cm, w.len, 0.06, `${d.label} port length`);
  });
  near(rows[0]!.result.summary.qtc!, 0.77, 0.006, "HF Qtc");
  near(rows[2]!.result.summary.qtc!, 0.51, 0.006, "HO Qtc");
  // Size all for each driver: the boxes each one wants.
  const { sizeAllForDriver } = await import("../packages/web/src/presets.ts");
  const { withDriver } = await import("./examples.ts");
  const { DEFAULT_STATE } = await import("../packages/web/src/state.ts");
  const own = (id: string) => {
    const s = sizeAllForDriver(withDriver({ ...DEFAULT_STATE, power: 350 }, id)).state;
    return runDesigns(s, solveDriver(s)).filter((d) => d.design.kind === "sealed" || d.design.kind === "vented").map((d) => [d.vb_l, (d.design as { targetFb?: number }).targetFb ?? null, Math.round(d.result.summary.f3! * 10) / 10]);
  };
  assert.deepEqual(own("dayton-audio/rss265hf-4"), [[39.8, null, 41.1], [86.4, 22.3, 20.2]]);
  assert.deepEqual(own("dayton-audio/rss265ho-4"), [[10.6, null, 54.9], [19, 29.5, 31.6]]);
});

test("T/S parameters guide: DSA215-8 vs RSS210HF-4 at 21.7 V in the DSA215-8's own boxes, the presets, and the arithmetic in the text", async () => {
  const peak = (f: Float64Array, y: ArrayLike<number>) => { let m = -Infinity; f.forEach((q, i) => { if (q >= 10 && q <= 400) m = Math.max(m, y[i]!); }); return m; };
  const rows = run("ts-example");
  assert.deepEqual(rows.map((d) => d.label), ["Sealed 10.7 L · DSA215-8", "Ported 18 L, 41.7 Hz · DSA215-8", "Sealed 10.7 L · RSS210HF-4", "Ported 18 L, 41.7 Hz · RSS210HF-4"]);
  const want = [
    { f3: 79.3, ref: 107.0, spl: [87.1, 93.7, 100.6], max: [88.7, 93.8], x: 5.6, qtc: 0.70 },
    { f3: 49.2, ref: 107.0, spl: [90.9, 100.0, 105.8], max: [89.4, 99.2], x: 7.8, port: 18.7, len: 16.1 },
    { f3: 45.7, ref: 103.1, spl: [90.5, 97.5, 103.6], max: [93.4, 98.4], x: 8.3, qtc: 1.04 },
    { f3: 36.8, ref: 103.1, spl: [93.2, 102.6, 108.9], max: [91.7, 99.2], x: 10.1, port: 26.0, len: 16.1 },
  ];
  rows.forEach((d, i) => {
    const r = d.result;
    const w = want[i]!;
    near(r.summary.f3!, w.f3, 0.06, `${d.label} F3`);
    near(r.summary.referenceSpl, w.ref, 0.06, `${d.label} passband`);
    [30, 40, 60].forEach((f, j) => near(at(r.freq, r.spl, f), w.spl[j]!, 0.06, `${d.label} at ${f} Hz`));
    [30, 40].forEach((f, j) => near(at(r.freq, r.maxSpl, f), w.max[j]!, 0.06, `${d.label} max SPL at ${f} Hz`));
    near(peak(r.freq, r.excursionMm), w.x, 0.06, `${d.label} peak excursion`);
    if (w.qtc) near(r.summary.qtc!, w.qtc, 0.006, `${d.label} Qtc`);
    if (w.port) near(peak(r.freq, r.portVelocity!), w.port, 0.06, `${d.label} port speed`);
    if (w.len) near((d.design as { length_cm: number }).length_cm, w.len, 0.06, `${d.label} port length`);
  });
  // The ported RSS210HF-4 peaks 5.9 dB above its passband near 57 Hz.
  const r3 = rows[3]!.result;
  near(peak(r3.freq, r3.spl) - r3.summary.referenceSpl, 5.9, 0.06, "RSS210HF-4 ported peak");
  // Size all for each driver: the example's boxes are the DSA215-8's.
  const { sizeAllForDriver } = await import("../packages/web/src/presets.ts");
  const { withDriver } = await import("./examples.ts");
  const { DEFAULT_STATE } = await import("../packages/web/src/state.ts");
  const own = (id: string) => {
    const s = sizeAllForDriver(withDriver({ ...DEFAULT_STATE, power: 80 }, id)).state;
    return runDesigns(s, solveDriver(s)).filter((d) => d.design.kind === "sealed" || d.design.kind === "vented").map((d) => [d.vb_l, (d.design as { targetFb?: number }).targetFb ?? null]);
  };
  assert.deepEqual(own("dayton-audio/dsa215-8"), [[10.7, null], [18, 41.7]]);
  assert.deepEqual(own("dayton-audio/rss210hf-4"), [[47.4, null], [80.9, 20.5]]);
  // The text's arithmetic: Qes from the parts, EBP, amplifier volts, efficiency ratio.
  near((2 * Math.PI * 35 * 0.0346 * 5.9) / 10.6 ** 2, 0.4, 0.001, "Qes");
  near(35 / 0.4, 87.5, 1e-9, "EBP");
  near(Math.sqrt(80 * 5.9), 21.7, 0.05, "volts");
  near(10 * Math.log10((35 ** 3 * 37.4) / 0.4 / ((29.6 ** 3 * 23.7) / 0.69)), 6.5, 0.05, "efficiency ratio dB");
  near(10 * Math.log10(5.9 / 3.1), 2.8, 0.05, "same volts into 3.1 vs 5.9 Ω");
  // The app's passband level per watt (into Re) matches the reference efficiency formula,
  // 112.0 + 10·log10(9.78e-10 · Vas · Fs³ / Qes) dB at 1 W, 1 m, half space: 88.0 and 81.4 dB.
  const perWatt = (i: number, re: number) => rows[i]!.result.summary.referenceSpl - 10 * Math.log10(21.7 ** 2 / re);
  const eta = (fs: number, vas: number, qes: number) => 112.02 + 10 * Math.log10((9.7822e-10 * vas * fs ** 3) / qes);
  near(eta(35, 37.4, 0.4), 88.0, 0.05, "DSA215-8 from η0");
  near(eta(29.6, 23.7, 0.69), 81.4, 0.05, "RSS210HF-4 from η0");
  near(perWatt(0, 5.9), eta(35, 37.4, 0.4), 0.2, "DSA215-8 app vs η0");
  near(perWatt(2, 3.1), eta(29.6, 23.7, 0.69), 0.3, "RSS210HF-4 app vs η0");
});

test("design assistant guide: the home-subwoofer defaults still put the example's driver and PR box first, and it opens to the example's boxes", async () => {
  const { TS_PARAMS } = await import("../packages/engine/src/index.ts");
  const { loadDatabase } = await import("../packages/db-tools/src/load.ts");
  const { prCandidate } = await import("./drivers.ts");
  const { DEFAULT_STATE } = await import("../packages/web/src/state.ts");
  const { evaluateDriver, goalFor, openResults, prefilter, prShortlist, rankResults } = await import("../packages/web/src/assistant.ts");
  const { limitsOf } = await import("../packages/web/src/sim.ts");
  const db = loadDatabase();
  const rows = db.drivers.map(({ id, data: d, flags }) => ({
    id, brand: d.brand, model: d.model, type: d.type, ohms: d.nominal_ohms,
    coil_ohms: d.voice_coils === 2 ? (d.ts_wiring === "series" ? d.nominal_ohms / 2 : d.nominal_ohms * 2) : undefined,
    size_in: d.size_in, fs: d.ts.fs, qts: d.ts.qts ?? (d.ts.qms * d.ts.qes) / (d.ts.qms + d.ts.qes), vas_l: d.ts.vas_l, xmax_mm: d.ts.xmax_mm,
    pe_w: d.ts.pe_w, sd_cm2: d.ts.sd_cm2, flags: flags.length ? flags.map((f) => f.code) : undefined,
  }));
  const recs = new Map(db.drivers.map((e) => [e.id, e.data]));
  const loaded = (id: string) => {
    const rec = recs.get(id)!;
    const ts: Record<string, number> = {};
    for (const k of Object.keys(TS_PARAMS)) { const v = (rec.ts as unknown as Record<string, number | undefined>)[k]; if (typeof v === "number") ts[k] = v; }
    return { name: `${rec.brand} ${rec.model}`, brand: rec.brand, nominal_ohms: rec.nominal_ohms, ts, le_mh: rec.ts.le_mh, xmax_mm: rec.ts.xmax_mm, pe_w: rec.ts.pe_w,
      dvcWiring: rec.voice_coils === 2 ? (rec.ts_wiring ?? "parallel") : undefined, cutout_mm: rec.physical?.cutout_mm, depth_mm: rec.physical?.depth_mm };
  };
  const goal = goalFor("home", "balanced");
  const cands = prefilter(rows as never, goal);
  const base = DEFAULT_STATE;
  let res = cands.flatMap((r) => evaluateDriver(base, r, loaded(r.id) as never, goal));
  res = [...res, ...prShortlist(rankResults(res, goal), cands).flatMap((r) => evaluateDriver(base, r, loaded(r.id) as never, goal, "pr", db.passiveRadiators.map(prCandidate)))];
  const ranked = rankResults(res, goal);
  const top = ranked[0]!;
  assert.deepEqual([top.driverId, top.box, top.vb_l, top.fb, top.pr?.name, top.pr?.count, top.pr?.addedMass_g, top.over], ["dayton-audio/rss315ho-44", "pr", 43.5, 23, "Dayton Audio RSS315-PR", 2, 723, []]);
  near(top.f3, 24.94, 0.06, "PR F3");
  // Within its limits from 20 Hz up, but its cone and PRs pass Xmax below that: the card says so.
  assert.deepEqual(top.subsonic, { below_hz: 20, safe_w: 80 });
  assert.equal(top.pr!.prUse, 0.81);
  const mine = ranked.filter((r) => r.driverId === top.driverId);
  const ported = mine.find((r) => r.box === "vented")!;
  const sealed = mine.find((r) => r.box === "sealed")!;
  assert.deepEqual(ported.over, ["port"]);
  assert.equal(ported.safe_w, 61);
  assert.equal(sealed.vb_l, 23.6);
  assert.equal(ranked.findIndex((r) => r.driverId === "18-sound/18ntlw5000-8ohm" && r.box === "vented") + 1, 4);
  assert.equal(ranked.indexOf(sealed) + 1, 3);
  assert.equal(ranked.indexOf(ported) + 1, 530);
  assert.equal(sealed.subsonic, undefined);
  // Re-sorted: Deepest and Loudest on the same results; Smallest sizes the boxes again.
  const deep = rankResults(res, { ...goal, priority: "deep" })[0]!;
  assert.deepEqual([deep.driverId, deep.box, deep.vb_l, Math.round(deep.f3 * 10) / 10, deep.pr?.name, deep.over], ["dayton-audio/rss315ho-44", "pr", 43.5, 24.9, "Dayton Audio RSS315-PR", []]);
  const loud = rankResults(res, { ...goal, priority: "loud" })[0]!;
  assert.deepEqual([loud.driverId, loud.box, loud.vb_l, loud.loud_db, loud.pr?.name], ["18-sound/15ntls3500", "vented", 80, 110.0, undefined]);
  const sgoal = goalFor("home", "small");
  const scands = prefilter(rows as never, sgoal);
  let sres = scands.flatMap((r) => evaluateDriver(base, r, loaded(r.id) as never, sgoal));
  sres = [...sres, ...prShortlist(rankResults(sres, sgoal), scands).flatMap((r) => evaluateDriver(base, r, loaded(r.id) as never, sgoal, "pr", db.passiveRadiators.map(prCandidate)))];
  const small = rankResults(sres, sgoal)[0]!;
  assert.deepEqual([small.driverId, small.box, small.vb_l, small.pr?.name, small.pr?.count, small.pr?.addedMass_g], ["peerless/stw-350f188pr01-04", "pr", 31.7, "SEAS SL26R", 1, 640]);
  assert.ok(small.notes.some((n) => n.includes("won't all fit")));
  // The counts the guide gives for these defaults.
  const grade = (g: string) => ranked.filter((r) => (g === "over" ? r.over.length > 0 : g === "deep" ? !r.over.length && !!r.deep : !r.over.length && !r.deep)).length;
  assert.deepEqual([cands.length, ranked.length, grade("ok"), grade("deep"), grade("over")], [760, 1486, 451, 78, 957]);
  // Opening it with ported too, plus the sealed box, gives the example's designs.
  const opened = openResults(DEFAULT_STATE, loaded(top.driverId) as never, [top, ported, sealed], goal);
  const ex = EXAMPLES["assistant-example"]!();
  const strip = (d: object) => { const { id: _i, name: _n, ...x } = d as Record<string, unknown>; return x; };
  assert.deepEqual(opened.designs.map(strip), ex.designs.map(strip));
  assert.deepEqual([opened.power, opened.dvc], [ex.power, ex.dvc]);
  // The example at 300 W.
  const rows3 = run("assistant-example");
  const l = rows3.map((d) => limitsOf(d.result, ex.xmax_mm, false));
  near(l[0]!.x!, 9.53, 0.01, "PR cone");
  near(l[0]!.xpr!.mm, 13.96, 0.01, "PR travel");
  near(l[1]!.x!, 8.71, 0.01, "ported cone");
  near(l[1]!.vp!, 37.7, 0.06, "ported port speed");
  near(l[2]!.x!, 10.30, 0.01, "sealed cone");
  [24.9, 24.1, 42.9].forEach((f3, i) => near(rows3[i]!.result.summary.f3!, f3, 0.06, `${rows3[i]!.label} F3`));
  [106.8, 107.4, 101.0].forEach((db30, i) => near(at(rows3[i]!.result.freq, rows3[i]!.result.spl, 30), db30, 0.06, `${rows3[i]!.label} at 30 Hz`));
  // The trap: below 20 Hz the PR box's cone passes Xmax; a 24 dB/oct 18 Hz high-pass filter fixes it.
  near(at(rows3[0]!.result.freq, rows3[0]!.result.excursionMm, 15), 21.0, 0.06, "PR cone at 15 Hz");
  near(Math.max(...Array.from(rows3[2]!.result.excursionMm)), 11.3, 0.06, "sealed cone, 10 Hz up");
  const hp = { ...ex, highPass: { on: true, type: "butterworth" as const, order: 4, freq: 18 } };
  const withHp = runDesigns(hp, solveDriver(hp))[0]!.result;
  near(at(withHp.freq, withHp.excursionMm, 15), 9.1, 0.06, "PR cone at 15 Hz, filtered");
  near(withHp.summary.f3!, 25.5, 0.06, "PR F3, filtered");
});

test("passive radiator guide: the QB3 box, the finder's picks, the DS215-PR's tuning, excursion and the port it replaces", async () => {
  const { evaluatePrCandidates, rankPrResults, portLengthForFb } = await import("../packages/engine/src/index.ts");
  const { loadDatabase } = await import("../packages/db-tools/src/load.ts");
  const { prCandidate } = await import("./drivers.ts");
  const { driverInputOf, simOptionsOf, checkFromHz, airOf } = await import("../packages/web/src/sim.ts");
  const { prTuning, sizeAllForDriver } = await import("../packages/web/src/presets.ts");
  const { withDriver } = await import("./examples.ts");
  const { DEFAULT_STATE } = await import("../packages/web/src/state.ts");
  const s = EXAMPLES["pr-example"]!();
  // The box is the driver's QB3 preset.
  const vented = sizeAllForDriver(withDriver(DEFAULT_STATE, "dayton-audio/dsa215-8")).state.designs.find((d) => d.kind === "vented") as any;
  assert.deepEqual([vented.vb_l, vented.targetFb, vented.preset], [18, 41.7, "QB3"]);
  // The finder's three picks the guide lists.
  const res = rankPrResults([...evaluatePrCandidates(driverInputOf(s, solveDriver(s)), loadDatabase().passiveRadiators.map(prCandidate), { vb_l: 18, targetFb: 41.7, losses: { ql: s.settings.losses.ql, qa: s.settings.losses.qa }, sim: simOptionsOf(s), fMin: checkFromHz(s.highPass.on) })].flat());
  const pick = (name: string, count: number) => res.find((r) => r.name === name && r.count === count)!;
  for (const [name, count, g, f3, use] of [["Dayton Audio DSA270-PR", 1, 79, 50.7, 47], ["Dayton Audio DS215-PR", 1, 4, 52.5, 74], ["SB Acoustics SB20PFC-00", 2, 48, 50.4, 39]] as const) {
    const r = pick(name, count);
    assert.equal(Math.round(r.addedMass_g!), g, name); near(r.f3!, f3, 0.06, `${name} F3`); assert.equal(Math.round(r.prUse! * 100), use, name);
  }
  near(prTuning(s.designs[1] as any, 18, airOf(s)).bare(), 42.8, 0.06, "DS215-PR bare tuning");
  // The example at 35 W with the 30 Hz filter.
  const [po, pr] = runDesigns(s, solveDriver(s)).map((d) => d.result);
  const max = (r: typeof po, k: "excursionMm" | "prExcursionMm" | "portVelocity") => Math.max(...Array.from(r[k]!).filter((_, i) => r.freq[i]! >= 10));
  near(po.summary.f3!, 49.2, 0.06, "ported F3"); near(pr.summary.f3!, 52.5, 0.06, "PR F3");
  near(max(pr, "excursionMm"), 5.33, 0.02, "woofer"); near(max(pr, "prExcursionMm"), 7.94, 0.02, "PR");
  // The port table: plain tubes for 41.7 Hz in 18 L.
  for (const [dia, len, v] of [[5, 15.1, 21.5], [6, 22.6, 14.9], [7, 31.6, 11.0]]) {
    const L = portLengthForFb(18, { shape: "round", diameter_cm: dia!, length_cm: 10 } as never, 41.7);
    near(L, len!, 0.06, `${dia} cm port length`);
    const t = { ...s, designs: [{ ...s.designs[0]!, diameter_cm: dia, length_cm: Math.round(L * 10) / 10 } as never] };
    near(max(runDesigns(t, solveDriver(t))[0]!.result, "portVelocity"), v!, 0.06, `${dia} cm port speed`);
  }
});

test("port, group delay and subsonic guides: their Keele box against the app's QB3 preset for the RSS315HF-4", async () => {
  const { alignmentDriver } = await import("../packages/web/src/sim.ts");
  const { ventedAlignmentFor } = await import("../packages/web/src/presets.ts");
  const { withDriver } = await import("./examples.ts");
  const { DEFAULT_STATE } = await import("../packages/web/src/state.ts");
  const s = withDriver(DEFAULT_STATE, "dayton-audio/rss315hf-4");
  const qb3 = ventedAlignmentFor(alignmentDriver(solveDriver(s), s)!, 1)!;
  near(qb3.vb_l, 75.6, 0.05, "QB3 Vb"); near(qb3.fb, 24.4, 0.05, "QB3 Fb");
  const keele = ventedAlignmentFor({ ...alignmentDriver(solveDriver(s), s)!, style: "textbook" }, 1)!;
  assert.equal(keele.name, "Keele"); near(keele.vb_l, 83.5, 0.05, "Keele Vb"); near(keele.fb, 23.8, 0.05, "Keele Fb");
});

test("deep-bass zone picture: the 8NDL51 passes Xmax only below 0.7 × its tuning at 55 W", async () => {
  const { limitsOf } = await import("../packages/web/src/sim.ts");
  const s = EXAMPLES["deep-bass-example"]!();
  const r = run("deep-bass-example")[0]!.result;
  near(r.summary.fb!, 59.3, 0.1, "tuning");
  const l = limitsOf(r, s.xmax_mm, false);
  assert.deepEqual(l.over, [], "not over");
  assert.ok(l.deep, "graded deep bass");
  near(l.deep!.below_hz, 41.6, 0.06, "zone edge");
  near(l.deep!.x_mm, 7.3, 0.06, "cone in the zone");
  assert.ok(l.x! < s.xmax_mm, "within Xmax above the zone");
});

test("every example gives each design its own id", () => {
  for (const [k, f] of Object.entries(EXAMPLES)) {
    const ids = f().designs.map((d) => d.id);
    assert.equal(new Set(ids).size, ids.length, k);
  }
});
