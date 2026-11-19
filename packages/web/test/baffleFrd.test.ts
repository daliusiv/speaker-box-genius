import { test } from "node:test";
import assert from "node:assert/strict";
import { applyBaffle, parseCurve, type Baffle } from "@sbg/engine";
import { baffleOnlyDownload, baffleOnlyFileName, coneFromSd, fitProblem, frdDownload, frdFileName, readFrd, sdFromCone, withCone } from "../src/baffleFrd.ts";
import { baffleGeometry, baffleOf, driverOffBaffle } from "../src/sim.ts";
import { EXPORT_FORMATS } from "../src/formats/registry.ts";
import { GROUPS } from "../src/formats/types.ts";
import { baffleLine } from "../src/formats/baffleFrd.ts";
import { DEFAULT_STATE, decodeState, encodeState, type AppState } from "../src/state.ts";

const B: Baffle = { width: 0.25, height: 0.4, x: 0.125, y: 0.12 };

const frdText = (phase: boolean) => {
  const lines = ["* Freq(Hz) SPL(dB) Phase(degrees)"];
  for (let f = 20; f <= 20000; f *= 1.06) lines.push(phase ? `${f.toFixed(3)}\t${(88 + Math.sin(f / 500)).toFixed(3)}\t${(-f / 100).toFixed(2)}` : `${f.toFixed(3)} ${(88).toFixed(3)}`);
  return lines.join("\r\n");
};

test("cone diameter and Sd convert both ways", () => {
  assert.equal(coneFromSd(137), 132.1);
  assert.ok(Math.abs(sdFromCone(coneFromSd(137)) - 137) < 0.25);
  assert.equal(coneFromSd(undefined), 0);
});

test("readFrd keeps phase when the file has it, and refuses impedance files", () => {
  assert.ok(readFrd("a.frd", frdText(true)).curve.phase);
  assert.equal(readFrd("a.frd", frdText(false)).curve.phase, undefined);
  assert.throws(() => readFrd("a.zma", frdText(true)), /impedance/);
  assert.throws(() => readFrd("a.txt", "* Freq(Hz) Z(Ohm) Phase\n" + frdText(true)), /impedance/);
  assert.throws(() => readFrd("a.frd", "nothing here"), /frequency response/);
});

test("fit check: off the baffle, cone too wide, over the edge, missing size", () => {
  assert.equal(fitProblem(B, 132, false), null);
  assert.match(fitProblem(B, 132, true)!, /off the baffle/);
  assert.match(fitProblem(B, 300, false)!, /wider than the baffle/);
  assert.match(fitProblem({ ...B, x: 0.05 }, 132, false)!, /edge/);
  assert.match(fitProblem(B, 0, false)!, /cone diameter/);
});

test("file names", () => {
  assert.equal(frdFileName("L16RN.frd", B), "L16RN on baffle 25x40.frd");
  assert.equal(baffleOnlyFileName(B, 132.1), "baffle 25x40 132.1 mm.frd");
});

test("Export FRD = the engine's applyBaffle on the file, with the cone typed here", () => {
  const f = readFrd("L16RN.frd", frdText(true));
  const out = frdDownload(B, 132, f);
  assert.equal(out.name, "L16RN on baffle 25x40.frd");
  const back = parseCurve(out.data as string, "spl", 10, { phase: true });
  const ref = applyBaffle(f.curve, withCone(B, 132));
  assert.equal(back.f.length, ref.f.length);
  for (let i = 0; i < ref.f.length; i++) {
    assert.ok(Math.abs(back.v[i]! - ref.v[i]!) <= 5e-5 * Math.abs(ref.v[i]!) + 1e-9);
    assert.ok(Math.abs(back.phase![i]! - ref.phase[i]!) <= 5e-5 * Math.abs(ref.phase[i]!) + 1e-9);
  }
  assert.match(out.data as string, /^\* Baffle 25 x 40 cm/);
  assert.match(out.data as string, /Phase: the file's phase plus the baffle's/);
  assert.match(frdDownload(B, 132, readFrd("x.frd", frdText(false))).data as string, /Phase: diffraction only/);
});

test("Export baffle only: on the file's frequencies, or the 1/48-octave grid with no file", () => {
  const f = readFrd("L16RN.frd", frdText(true));
  const withFile = parseCurve(baffleOnlyDownload(B, 132, f).data as string, "spl", 10, { phase: true });
  assert.equal(withFile.f.length, f.curve.f.length);
  const alone = baffleOnlyDownload(B, 132, null);
  assert.equal(alone.name, "baffle 25x40 132 mm.frd");
  const grid = parseCurve(alone.data as string, "spl", 10, { phase: true });
  assert.equal(grid.f.length, 1 + Math.round(48 * Math.log2(2000)));
  assert.match(alone.data as string, /Baffle only/);
});

test("the tool adds nothing to links: the baffle state round-trips unchanged", () => {
  const s: AppState = { ...DEFAULT_STATE, baffle: { ...DEFAULT_STATE.baffle, on: true, fromBox: false } };
  const back = decodeState(encodeState(s));
  assert.deepEqual(back.baffle, s.baffle);
  assert.ok(baffleOf(back, 137));
});

test("the window's baffle: Baffle step's geometry whether or not the step is on; the sim's baffleOf only when on", () => {
  const off: AppState = { ...DEFAULT_STATE, baffle: { ...DEFAULT_STATE.baffle, on: false, fromBox: false, width_cm: 30, height_cm: 45, x_cm: 15, y_cm: 14 } };
  const on: AppState = { ...off, baffle: { ...off.baffle, on: true } };
  assert.equal(baffleOf(off, 137), null);
  assert.deepEqual(baffleOf(on, 137), baffleGeometry(off, 137));
  assert.deepEqual(baffleGeometry(off, 137), { width: 0.3, height: 0.45, x: 0.15, y: 0.14, sd_cm2: 137, c: baffleGeometry(on, 137)!.c });
  assert.equal(driverOffBaffle(off), false);
  assert.equal(driverOffBaffle({ ...off, baffle: { ...off.baffle, x_cm: 31 } }), true);
  assert.equal(baffleGeometry({ ...off, baffle: { ...off.baffle, width_cm: 0 } }), null);
});

test("Save & Export: Driver on baffle sits in Crossover tools, picks a file, names the baffle", () => {
  const f = EXPORT_FORMATS.find((x) => x.id === "baffle-frd")!;
  assert.equal(f.group, "crossover");
  assert.equal(GROUPS.crossover, "Crossover tools");
  assert.deepEqual(Object.keys(GROUPS), ["project", "sim", "crossover", "dsp"]);
  assert.ok(f.pick?.accept.includes(".frd"));
  assert.equal(f.action, "Choose a driver curve…");
  const s: AppState = { ...DEFAULT_STATE, baffle: { ...DEFAULT_STATE.baffle, fromBox: false, width_cm: 30, height_cm: 45, x_cm: 15, y_cm: 14 } };
  assert.equal(baffleLine(s), "Baffle: 30 × 45 cm, typed in Baffle step; driver 15 cm from left, 14 cm from top. You can change it in the window.");
  const ids = EXPORT_FORMATS.map((x) => x.group);
  assert.ok(ids.indexOf("crossover") > ids.lastIndexOf("sim") && ids.indexOf("crossover") < ids.indexOf("dsp"));
});

test("links keep the baffle size and place with the step off", () => {
  const s: AppState = { ...DEFAULT_STATE, baffle: { on: false, fromBox: false, width_cm: 31, height_cm: 47, x_cm: 12, y_cm: 9 } };
  assert.deepEqual(decodeState(encodeState(s)).baffle, s.baffle);
});
