import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { simulate } from "../src/simulate.ts";
import type { LineInput } from "../src/line.ts";

// Regression against Hornresp 55.30. Each folder under fixtures/hornresp holds one design:
// input.json (our LineInput), and Hornresp's own exports for it at 2.83 V in half space:
// spl.frd (SPL at 1 m) and ze.zma (electrical impedance). The records Hornresp was run on
// are in docs/hornresp-validation/records. Hornresp's air: c = 344 m/s, ρ = 1.205 kg/m³.
// Hornresp works SPL out from radiated power, so the comparison uses splFrom: "power".

const DIR = join(dirname(fileURLToPath(import.meta.url)), "fixtures", "hornresp");
const AIR = { rho: 1.205, c: 344 };
// DSA215-8, as written into every validation record.
const DRIVER = { fs: 35, qms: 1.87, qes: 0.4, vas_l: 37.4, re: 5.9, sd_cm2: 211.2, le_mh: 1, xmax_mm: 5.5, pe_w: 80 };

const readCurve = (file: string) =>
  readFileSync(file, "utf8")
    .split(/\r?\n/)
    .slice(1)
    .map((l) => l.trim().split(/\s+/).map(Number))
    .filter((r) => r.length >= 2 && r[0]! > 0 && Number.isFinite(r[1]));

function interp(freq: Float64Array, y: Float64Array, f: number): number {
  let i = 0;
  while (i < freq.length - 2 && freq[i + 1]! < f) i++;
  const t = Math.log(f / freq[i]!) / Math.log(freq[i + 1]! / freq[i]!);
  return y[i]! + (y[i + 1]! - y[i]!) * t;
}

const percentile = (xs: number[], p: number) => [...xs].sort((a, b) => a - b)[Math.floor(p * (xs.length - 1))]!;

for (const id of existsSync(DIR) ? readdirSync(DIR) : []) {
  const input = JSON.parse(readFileSync(join(DIR, id, "input.json"), "utf8")) as LineInput;
  const r = simulate(DRIVER, input, { power: 2.83, convention: "volts", fMin: 10, fMax: 2000, points: 2000, air: AIR, splFrom: "power" });

  test(`Hornresp ${id}: electrical impedance`, () => {
    const errs = readCurve(join(DIR, id, "ze.zma"))
      .filter((p) => p[0]! <= 1000)
      .map(([f, z]) => Math.abs(interp(r.freq, r.impedanceOhm, f!) / z! - 1) * 100);
    const mean = errs.reduce((a, b) => a + b, 0) / errs.length;
    assert.ok(mean < 0.5, `mean |Ze| error ${mean.toFixed(2)} %`);
    assert.ok(Math.max(...errs) < 3, `worst |Ze| error ${Math.max(...errs).toFixed(1)} %`);
  });

  test(`Hornresp ${id}: SPL`, () => {
    // Deep notches are compared by where they fall, not by how deep they are: a few
    // hundredths of a hertz move the bottom of a 40 dB null by many dB.
    const errs = readCurve(join(DIR, id, "spl.frd"))
      .filter((p) => p[0]! <= 1000)
      .map(([f, db]) => Math.abs(interp(r.freq, r.spl, f!) - db!));
    const mean = errs.reduce((a, b) => a + b, 0) / errs.length;
    assert.ok(mean < 0.15, `mean SPL difference ${mean.toFixed(2)} dB`);
    assert.ok(percentile(errs, 0.95) < 0.4, `95th percentile ${percentile(errs, 0.95).toFixed(2)} dB`);
  });

  const zaFile = join(DIR, id, "za.txt");
  if (existsSync(zaFile)) {
    test(`Hornresp ${id}: acoustic impedance (Za, normalised)`, () => {
      const za = r.acousticImpedance!;
      const mag = Float64Array.from(za.resistance, (re, i) => Math.hypot(re, za.reactance[i]!));
      // Away from the sharp peaks and nulls (where a hair's shift in frequency moves the value a lot).
      const errs = readCurve(zaFile)
        .filter((p) => p[0]! <= 1000 && p[1]! > 0.3 && p[1]! < 5)
        .map(([f, z]) => Math.abs(20 * Math.log10(interp(r.freq, mag, f!) / z!)));
      const mean = errs.reduce((a, b) => a + b, 0) / errs.length;
      assert.ok(mean < 0.1, `mean |Za| difference ${mean.toFixed(3)} dB`);
    });
  }
}
