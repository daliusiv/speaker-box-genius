import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { lineProfile } from "../src/simulate.ts";
import type { DriverInput } from "../src/model.ts";
import type { LineInput } from "../src/line.ts";
import { HORNRESP_AIR, HORNRESP_DIR, HORNRESP_DRIVER, readTable } from "../validation/hornresp.ts";

/*
 * Pressure and air speed inside the mass-loaded line (case 05) against Hornresp 60.60's
 * chart window, Tools > Sound Pressure and Tools > Particle Velocity, at 2.83 V. Hornresp
 * can't export these charts, so the reference values are read off its screenshots (about
 * ±2 % of full scale): peaks, nulls and the frequencies they fall on.
 *
 * "Offset Throat" is the line at the driver (S2); its particle velocity is the air moving on
 * towards the mouth. "Horn Mouth" is the port's outer end. The app's line profile gives both.
 *
 * Hornresp samples about 70 points per octave, which clips the line's sharp upper
 * resonances (the app's own chart at a resonance's exact peak reads higher), so the app is
 * sampled on Hornresp's frequencies before the peaks are taken.
 */
const input = JSON.parse(readFileSync(join(HORNRESP_DIR, "05-mltl", "input.json"), "utf8")) as LineInput;
const grid = readTable(join(HORNRESP_DIR, "05-mltl", "hornresp.txt")).map((x) => x.Freq!).filter((f) => f <= 2000);
const peakPa = (db: number) => 2e-5 * 10 ** (db / 20) * Math.SQRT2;
const at = grid.map((f) => {
  const pts = lineProfile(HORNRESP_DRIVER as DriverInput, input, f, { power: 2.83, convention: "volts", air: HORNRESP_AIR }).points;
  const driver = pts.filter((q) => Math.abs(q.x_cm - 27.5) < 1e-6); // closed-end side, then mouth side
  const mouth = pts[pts.length - 1]!;
  return { f, pThroat: peakPa(driver[0]!.spl_db), uThroat: driver[1]!.velocity_ms, pMouth: peakPa(mouth.spl_db), uMouth: mouth.velocity_ms };
});
type Key = "pThroat" | "uThroat" | "pMouth" | "uMouth";
const extreme = (k: Key, lo: number, hi: number, min = false) =>
  at.filter((o) => o.f >= lo && o.f <= hi).reduce((a, o) => ((min ? o[k] < a[k] : o[k] > a[k]) ? o : a));

// [output, band (Hz), Hornresp's value, its full scale, roughly where (Hz)]
const PEAKS: [Key, number, number, number, number, number][] = [
  ["pThroat", 20, 80, 342, 600, 44],
  ["pThroat", 140, 220, 520, 600, 168],
  ["pThroat", 400, 540, 305, 600, 470],
  ["pThroat", 560, 680, 210, 600, 620],
  ["pMouth", 20, 80, 41, 140, 45],
  ["pMouth", 140, 220, 131, 140, 168],
  ["pMouth", 400, 540, 103, 140, 470],
  ["pMouth", 560, 680, 58, 140, 620],
  ["uThroat", 15, 40, 0.34, 1.4, 27],
  ["uThroat", 140, 220, 1.3, 1.4, 168],
  ["uThroat", 400, 540, 0.82, 1.4, 470],
  ["uMouth", 20, 80, 5.0, 6, 40],
  ["uMouth", 140, 220, 3.97, 6, 168],
  ["uMouth", 400, 540, 1.12, 6, 470],
];

test("mass-loaded line: pressure and air speed at the driver and the mouth match Hornresp's charts", () => {
  for (const [k, lo, hi, ref, scale, f] of PEAKS) {
    const o = extreme(k, lo, hi);
    assert.ok(Math.abs(o[k] - ref) < 0.025 * scale, `${k} ${lo}-${hi} Hz: ${o[k].toFixed(3)} vs Hornresp ${ref}`);
    assert.ok(Math.abs(Math.log2(o.f / f)) < 0.1, `${k} peak at ${o.f.toFixed(0)} Hz vs about ${f}`);
  }
});

test("mass-loaded line: nulls fall where Hornresp's do", () => {
  // The pressure at the driver goes to zero at about 125 Hz, the air moving on from it at about
  // 50 Hz (the line's tuning); the mouth's air speed bottoms at about 0.6 m/s near 125 Hz.
  const p = extreme("pThroat", 80, 160, true);
  assert.ok(p.pThroat < 0.02 * 600 && Math.abs(Math.log2(p.f / 125)) < 0.1, `pressure null ${p.pThroat.toFixed(2)} Pa at ${p.f}`);
  const u = extreme("uThroat", 40, 70, true);
  assert.ok(u.uThroat < 0.02 * 1.4 && Math.abs(Math.log2(u.f / 50)) < 0.1, `air speed null ${u.uThroat.toFixed(3)} m/s at ${u.f}`);
  const m = extreme("uMouth", 80, 160, true);
  assert.ok(Math.abs(m.uMouth - 0.6) < 0.025 * 6, `mouth air speed minimum ${m.uMouth.toFixed(2)} m/s`);
});
