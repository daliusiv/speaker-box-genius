import { test } from "node:test";
import assert from "node:assert/strict";
import { abs, arg } from "../src/complex.ts";
import {
  addedMassResult,
  driverImpedance,
  estimateFromPeak,
  fitImpedance,
  parseImpedance,
  type ImpedanceParams,
} from "../src/impedance.ts";
import { cmsFromVas, mmsFromFsCms } from "../src/ts.ts";

const TRUE: ImpedanceParams = { re: 3.5, fs: 25.6, qms: 3.06, qes: 0.53, le_mh: 0.96 };

/** A synthetic log sweep from the model, optionally with deterministic "noise". */
function sweep(p: ImpedanceParams, opts: { phase?: boolean; noise?: number; comma?: boolean; sep?: string } = {}): string {
  const lines = ["* synthetic sweep", "Freq(Hz) Mag(ohm) Phase(deg)"];
  let seed = 1;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1;
  for (let i = 0; i < 300; i++) {
    const f = 5 * Math.exp((Math.log(1000 / 5) * i) / 299);
    const z = driverImpedance(p, f);
    const m = abs(z) * (1 + (opts.noise ?? 0) * rnd());
    const ph = (arg(z) * 180) / Math.PI + (opts.noise ?? 0) * 50 * rnd();
    const cols = opts.phase === false ? [f, m] : [f, m, ph];
    let row = cols.map((v) => v.toFixed(5)).join(opts.sep ?? " ");
    if (opts.comma) row = row.replace(/\./g, ",");
    lines.push(row);
  }
  return lines.join("\n");
}

const within = (a: number, b: number, rel: number, what: string) =>
  assert.ok(Math.abs(a - b) <= rel * Math.abs(b), `${what}: ${a} vs ${b} (±${rel * 100}%)`);

test("parses .zma, CSV and European CSV sweeps", () => {
  const a = parseImpedance(sweep(TRUE));
  assert.equal(a.freq.length, 300);
  assert.ok(a.phase);
  const b = parseImpedance(sweep(TRUE, { sep: "," }));
  assert.equal(b.freq.length, 300);
  const c = parseImpedance(sweep(TRUE, { sep: ";", comma: true }));
  within(c.mag[100]!, a.mag[100]!, 1e-6, "European CSV magnitude");
  const d = parseImpedance(sweep(TRUE, { phase: false }));
  assert.equal(d.phase, null);
  assert.throws(() => parseImpedance("hello\nworld"), /Couldn't find/);
});

test("bandwidth estimate is close to the true parameters", () => {
  const e = estimateFromPeak(parseImpedance(sweep({ ...TRUE, le_mh: 0 })), TRUE.re);
  within(e.fs, TRUE.fs, 0.01, "fs");
  within(e.qms, TRUE.qms, 0.02, "qms");
  within(e.qes, TRUE.qes, 0.02, "qes");
});

test("fit recovers the parameters from a clean sweep with phase", () => {
  const r = fitImpedance(parseImpedance(sweep(TRUE)));
  within(r.re, TRUE.re, 0.002, "re");
  within(r.fs, TRUE.fs, 0.002, "fs");
  within(r.qms, TRUE.qms, 0.005, "qms");
  within(r.qes, TRUE.qes, 0.005, "qes");
  within(r.le_mh, TRUE.le_mh, 0.02, "le");
  assert.ok(r.rmsError < 1e-4, String(r.rmsError));
  assert.ok(r.usedPhase);
});

test("fit works from magnitude only, and with 1 % noise", () => {
  const m = fitImpedance(parseImpedance(sweep(TRUE, { phase: false })));
  within(m.fs, TRUE.fs, 0.005, "fs (mag only)");
  within(m.qms, TRUE.qms, 0.02, "qms (mag only)");
  within(m.qes, TRUE.qes, 0.02, "qes (mag only)");
  const n = fitImpedance(parseImpedance(sweep(TRUE, { noise: 0.01 })));
  within(n.fs, TRUE.fs, 0.01, "fs (noisy)");
  within(n.qms, TRUE.qms, 0.05, "qms (noisy)");
  within(n.qes, TRUE.qes, 0.05, "qes (noisy)");
});

test("a measured DC resistance is held fixed", () => {
  const r = fitImpedance(parseImpedance(sweep(TRUE)), 3.5);
  assert.equal(r.re, 3.5);
  within(r.qes, TRUE.qes, 0.005, "qes");
});

test("added mass gives Mms, Cms and Vas consistent with the T/S relations", () => {
  // Build the "true" driver: Vas 53.8 L, Sd 356.3 cm² → Cms, Mms at fs
  const cms = cmsFromVas(53.8, 356.3);
  const mms = mmsFromFsCms(25.6, cms);
  const mass = 50; // g
  const fsMass = 1 / (2 * Math.PI * Math.sqrt((mms + mass / 1000) * cms));
  const r = addedMassResult(25.6, fsMass, mass, 356.3);
  within(r.mms_g, mms * 1000, 1e-9, "mms");
  within(r.vas_l!, 53.8, 1e-9, "vas");
  assert.throws(() => addedMassResult(25.6, 25.5, 1), /barely moved/);
});
