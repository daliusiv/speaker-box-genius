import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DEFAULT_STATE, type AppState } from "../src/state.ts";
import { alignmentDriver, solveDriver } from "../src/sim.ts";
import { sealedPreset, SEALED_MAX_VAS } from "../src/presets.ts";
import { boxForQtc, levelAt, PEAK_QTC, qtsOfState, readSealed, roundVb, sealedState } from "../src/calculators/sealedMath.ts";
import { SEALED_QUERY } from "../src/calculators/sealedBox.ts";
import { PORT_QUERY } from "../src/calculators/portLength.ts";

/** A driver by its T/S, at `power` W, as the calculator builds it. */
const driver = (o: { fs?: number; qms: number; qes: number; vas_l: number; re?: number; sd_cm2?: number; xmax_mm?: number }, power = 100): AppState => ({
  ...DEFAULT_STATE,
  drive: "watts",
  power,
  ts: { fs: o.fs ?? 30, qms: o.qms, qes: o.qes, vas_l: o.vas_l, re: o.re ?? 6, sd_cm2: o.sd_cm2 ?? 220 },
  le_mh: 0,
  xmax_mm: o.xmax_mm ?? 10,
});
const sizing = (s: AppState, q: number) => {
  const b = boxForQtc(s, q);
  assert.equal(typeof b, "object");
  return b as Exclude<typeof b, string>;
};

test("sealed calculator: the box for Qtc 0.707 is the app's sealed preset, to the last digit, for any number of drivers", () => {
  for (const n of [1, 2, 4]) {
    const s = { ...driver({ qms: 5, qes: 0.5, vas_l: 60 }), drivers: n };
    const align = alignmentDriver(solveDriver(s), s)!;
    const preset = sealedPreset(align, n)!;
    assert.equal(preset.name, "Qtc 0.707");
    assert.equal(sizing(s, 0.707).vb_l, preset.vb_l);
  }
  // Two drivers need twice the box.
  const one = driver({ qms: 5, qes: 0.5, vas_l: 60 });
  assert.ok(Math.abs(sizing({ ...one, drivers: 2 }, 0.8).vb_l / sizing(one, 0.8).vb_l - 2) < 1e-9);
});

test("sealed calculator: WinISD's closed-box wizard (Fs 30 Hz, Qms 5, Vas 50 L, Re 6 Ω), within its display rounding", () => {
  const F = JSON.parse(readFileSync(new URL("../../engine/test/fixtures/winisd-parity.json", import.meta.url), "utf8"));
  for (const c of F.sealed.cases) {
    const s = driver({ qms: 5, qes: 1 / (1 / c.qts - 1 / 5), vas_l: 50 });
    const vb = sizing(s, c.qtc).vb_l;
    assert.ok(Math.abs(vb - c.vb) / c.vb < 0.005, `Qts ${c.qts}, Qtc ${c.qtc}: ${vb} vs WinISD ${c.vb}`);
    // And the finished box reads the Qtc it was sized for, a hair under (WinISD reads 0.705 for 0.707).
    const r = readSealed(sealedState(s, vb))!;
    assert.ok(Math.abs(r.qtc! - c.qtc) < 0.006, `Qtc ${c.qtc}: reads ${r.qtc}`);
  }
});

test("sealed calculator: the Qtc and Fc of a box (WinISD: 24.32 L, Qts 0.40 → Qtc 0.705, Fsc 52.44 Hz)", () => {
  const s = driver({ qms: 5, qes: 1 / (1 / 0.4 - 1 / 5), vas_l: 50 });
  const r = readSealed(sealedState(s, 24.32))!;
  assert.ok(Math.abs(r.qtc! - 0.705) < 0.006, `${r.qtc}`);
  assert.ok(Math.abs(r.fc! - 52.44) < 0.2, `${r.fc}`);
});

test("sealed calculator: no box when Qts is above the Qtc, and none when the driver isn't complete", () => {
  const hi = driver({ qms: 5, qes: 0.9, vas_l: 50 });
  assert.ok(qtsOfState(hi)! > 0.707 - 1e-9);
  assert.equal(boxForQtc(hi, 0.707), "qts");
  assert.equal(boxForQtc(driver({ qms: 5, qes: 0.5, vas_l: 50 }), 0.3), "qts");
  assert.equal(boxForQtc({ ...DEFAULT_STATE, ts: {} }, 0.707), "incomplete");
});

test("sealed calculator: past 2 × Vas the calculator says so where the sealed preset stops at 2 × Vas", () => {
  const s = driver({ qms: 6, qes: 0.767, vas_l: 100 });
  const b = sizing(s, 0.707);
  assert.ok(b.pastMax && b.vb_l > b.maxVb_l && b.maxVb_l === SEALED_MAX_VAS * 100);
  const align = alignmentDriver(solveDriver(s), s)!;
  assert.equal(sealedPreset(align, 1)!.vb_l, b.maxVb_l);
  assert.equal(sizing({ ...s, drivers: 2 }, 0.707).maxVb_l, 400);
  assert.ok(!sizing(driver({ qms: 5, qes: 0.5, vas_l: 60 }), 0.707).pastMax);
});

test("sealed calculator: F3, F10, excursion, output and the peak of a box", () => {
  const s = driver({ qms: 5, qes: 0.5, vas_l: 60 }, 200);
  const small = readSealed(sealedState(s, sizing(s, 1).vb_l))!;
  const flat = readSealed(sealedState(s, sizing(s, 0.707).vb_l))!;
  const big = readSealed(sealedState(s, sizing(s, 0.577).vb_l))!;
  assert.ok(small.qtc! > PEAK_QTC && small.peakDb > 0.5 && small.peakDb < 1.6, `Qtc 1.0 has a peak of about 1 dB: ${small.peakDb}`);
  assert.ok(flat.qtc! < PEAK_QTC && flat.peakDb < 0.05, `no peak at 0.707: ${flat.peakDb}`);
  // A bigger box plays deeper (F10) and louder at 30 Hz, and takes more cone.
  assert.ok(big.f10! < flat.f10! && flat.f10! < small.f10!);
  assert.ok(big.spl30! > flat.spl30! && flat.spl30! > small.spl30!);
  assert.ok(big.x_mm! > flat.x_mm! && flat.x_mm! > small.x_mm!);
  assert.ok(big.vb_l > flat.vb_l && flat.vb_l > small.vb_l);
  assert.equal(flat.power_w, 200);
  assert.ok(flat.f3! > 30 && flat.f3! < 80);
});

test("sealed calculator: a driver with no Xmax still gives its excursion, and 0 for the limit", () => {
  const s = { ...driver({ qms: 5, qes: 0.5, vas_l: 60 }, 100), xmax_mm: 0 };
  const r = readSealed(sealedState(s, 40))!;
  assert.equal(r.xmax_mm, 0);
  assert.ok(r.x_mm !== null && r.x_mm > 0);
});

test("sealed calculator: a link opens the same box (volume to 0.01 L), and the levels are read off the response", () => {
  assert.equal(roundVb(38.85404), 38.85);
  assert.equal(sealedState(driver({ qms: 5, qes: 0.5, vas_l: 60 }), 38.85404).designs[0]!.vb_l, 38.85);
  assert.equal(levelAt([10, 100, 1000], [0, 10, 40], 100), 10);
  assert.ok(Math.abs(levelAt([10, 100, 1000], [0, 10, 40], Math.sqrt(1000))! - 5) < 1e-9);
  assert.equal(levelAt([10, 100], [0, 10], 5), null);
});

test("sealed calculator: link keys are short and unique, and name their own fields", () => {
  const keys = Object.keys(SEALED_QUERY);
  for (const k of keys) assert.match(k, /^[a-z]{1,3}$/, `short key: ${k}`);
  const ids = Object.values(SEALED_QUERY).map((f) => f.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const id of ids) assert.match(id, /^sc-/);
  for (const k of ["u", "m", "q", "vb", "n", "d", "fs", "qes", "qms", "vas", "re", "sd", "x", "pe", "p"]) assert.ok(keys.includes(k), k);
  assert.ok(PORT_QUERY.u, "the port page keeps its own spec");
});
