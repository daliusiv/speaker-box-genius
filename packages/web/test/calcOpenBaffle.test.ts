import { test } from "node:test";
import assert from "node:assert/strict";
import { openBaffleFrequencies } from "@sbg/engine";
import { decodeState, encodeState, DEFAULT_STATE, type AppState } from "../src/state.ts";
import { airOf, driverInputOf, runDesigns, solveDriver } from "../src/sim.ts";
import { boardForPeak, boardNumbers, obDesign, obProblem, obSuits, readOb, WALL_DASH, type ObForm } from "../src/calculators/obCalcMath.ts";
import { OB_QUERY } from "../src/calculators/openBaffle.ts";

/** A 12″ driver by its T/S at `power` W, as the calculator builds it. */
const driver = (o: { fs: number; qms: number; qes: number; vas_l: number; xmax_mm: number }, power = 1): AppState => ({
  ...DEFAULT_STATE,
  drive: "watts",
  power,
  ts: { fs: o.fs, qms: o.qms, qes: o.qes, vas_l: o.vas_l, re: 5.6, sd_cm2: 520 },
  le_mh: 0.5,
  xmax_mm: o.xmax_mm,
});
// High Qts and low Fs (passive: +0.6 dB of its own at 40 Hz), low Qts with travel (DSP), low Qts with little travel (neither).
const PASSIVE = driver({ fs: 30, qms: 10, qes: 1, vas_l: 107, xmax_mm: 10.9 });
const DSP = driver({ fs: 24, qms: 2.8, qes: 0.45, vas_l: 84, xmax_mm: 14.3 });
const NEITHER = driver({ fs: 60, qms: 4, qes: 0.4, vas_l: 30, xmax_mm: 4 });
const BOARD: ObForm = { frame: "flat", w_cm: 45, h_cm: 100, x_cm: 22.5, y_cm: 35, t_cm: 1.8, depth_cm: 30 };

test("open baffle calculator: board numbers are the app's Open baffle card readouts (the simulator's own summary)", () => {
  for (const b of [BOARD, { ...BOARD, frame: "u" as const }, { ...BOARD, frame: "h" as const, w_cm: 60, h_cm: 60, x_cm: 30, y_cm: 30 }]) {
    const s = { ...PASSIVE, designs: [obDesign(b)] };
    const solved = solveDriver(s);
    const [d] = runDesigns(s, solved);
    const sd = driverInputOf(s, solved).sd_cm2 / 1e4;
    const card = boardNumbers(b, sd, airOf(s));
    assert.deepEqual(card, d!.result.summary.ob, b.frame);
    const r = readOb(s, b)!;
    assert.equal(r.fPeak, card.fPeak);
    assert.equal(r.fNull, card.fNull);
    assert.equal(r.fQuarter, card.fQuarter);
    if (b.frame === "flat") assert.equal(card.fQuarter, null);
    else assert.ok(card.fQuarter! > 50 && card.fQuarter! < 400, `${b.frame} quarter-wave ${card.fQuarter}`);
  }
});

test("open baffle calculator: a board for a peak gives that peak within 2 %; out-of-range peaks get none", () => {
  for (const [fp, ar] of [[300, "square"], [500, "square"], [400, "tall"], [800, "tall"]] as const) {
    const b = boardForPeak(fp, ar, 1.8, 0.052)!;
    assert.ok(b, `${fp} Hz ${ar}`);
    const got = boardNumbers(b, 0.052).fPeak;
    assert.ok(Math.abs(got / fp - 1) <= 0.02, `${fp} Hz ${ar}: ${got}`);
    assert.equal(b.x_cm, b.w_cm / 2);
    assert.equal(b.h_cm, ar === "tall" ? 2 * b.w_cm : b.w_cm);
    assert.ok(Number.isInteger(b.w_cm));
  }
  assert.equal(boardForPeak(60, "square", 1.8), null, "needs a board over 1.5 m");
  assert.equal(boardForPeak(5000, "square", 1.8), null, "needs a board under 15 cm");
  assert.equal(boardForPeak(0, "square", 1.8), null);
  // A square 45 cm board and the board found for its own peak are the same board.
  const sq = { ...BOARD, w_cm: 45, h_cm: 45, x_cm: 22.5, y_cm: 22.5 };
  assert.equal(boardForPeak(boardNumbers(sq, 0.052).fPeak, "square", 1.8, 0.052)!.w_cm, 45);
});

test("open baffle calculator: the Dipole EQ wins bass back, keeps the cone within Xmax at the power set, and opens with the board", async () => {
  const r1 = readOb(DSP, BOARD)!;
  assert.ok(r1.loss! < -10, `dipole loss at 40 Hz ${r1.loss}`);
  assert.ok(r1.lossEq! > r1.loss! + 6, "the EQ wins back at least 6 dB at 40 Hz");
  assert.ok(r1.f3Eq! < r1.f3! * 0.7, "the EQ takes F3 down");
  assert.deepEqual(r1.eq.map((e) => e.type), ["lowshelf1", "peak"]);
  assert.ok(r1.eq.every((e) => e.target === "d1"), "aimed at the board that opens");
  for (const w of [1, 100]) {
    const r = readOb({ ...DSP, power: w }, BOARD)!;
    assert.ok(!r.over && r.x_mm! <= DSP.xmax_mm, `${w} W: ${r.x_mm} mm`);
  }
  // At 400 W the cone passes Xmax on the bare board already: no EQ can fix that, and the page says so (overBare).
  const loud = readOb({ ...DSP, power: 400 }, BOARD)!;
  assert.ok(loud.over && loud.overBare);
  assert.ok(!r1.overBare);
  // The chart: open baffle, with the EQ, and in a wall (dashed); the EQ only on the second.
  assert.deepEqual(r1.chart.designs.map((d) => d.kind), ["ob", "ob", "ib"]);
  assert.ok(r1.chart.eq.every((e) => e.target === "d2"));
  assert.equal(r1.designs.find((d) => d.design.id === "d3")!.dash, WALL_DASH);
  // Open in the simulator: the board and its EQ survive the link.
  const back = await decodeState(await encodeState(r1.open));
  assert.equal(back.designs.length, 1);
  const d = back.designs[0]!;
  assert.ok(d.kind === "ob" && d.w_cm === 45 && d.h_cm === 100 && d.x_cm === 22.5 && d.y_cm === 35 && d.frame === "flat");
  assert.deepEqual(back.eq.map((e) => [e.type, e.target]), [["lowshelf1", "d1"], ["peak", "d1"]]);
});

test("open baffle calculator: suits by the driver picker's rules; a driver that can't be simulated gives nothing", () => {
  assert.equal(obSuits(PASSIVE), "passive");
  assert.equal(obSuits(DSP), "dsp");
  assert.equal(obSuits(NEITHER), "neither");
  assert.equal(readOb(PASSIVE, BOARD)!.suits, "passive");
  assert.equal(readOb({ ...PASSIVE, ts: { ...PASSIVE.ts, fs: undefined as unknown as number } }, BOARD), null);
});

test("open baffle calculator: the form's problems are the app's own size rules", () => {
  assert.equal(obProblem(BOARD), null);
  assert.equal(obProblem({ ...BOARD, w_cm: 2 }), "size");
  assert.equal(obProblem({ ...BOARD, x_cm: 50 }), "driver");
  assert.equal(obProblem({ ...BOARD, y_cm: 0 }), "driver");
  assert.equal(obProblem({ ...BOARD, frame: "u", depth_cm: 2 }), "depth");
  assert.equal(obProblem({ ...BOARD, depth_cm: 2 }), null, "a flat board has no depth");
  // A flat board's numbers don't depend on the driver's cone when it has none (a point).
  assert.equal(boardNumbers(BOARD).fPeak, openBaffleFrequencies({ kind: "open-baffle", ...BOARD }, airOf(DEFAULT_STATE), 0).fPeak);
});

test("open baffle calculator: its link keys name each field once (the driver's place isn't its Xmax)", () => {
  const ids = Object.values(OB_QUERY).map((f) => f.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(OB_QUERY.x!.id, "ob-xmax");
  assert.equal(OB_QUERY.dx!.id, "ob-x");
  assert.equal(OB_QUERY.dy!.id, "ob-y");
});
