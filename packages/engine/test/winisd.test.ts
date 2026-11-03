/**
 * Golden tests against WinISD 0.7.0.950.
 *
 * Each case is a real WinISD project plus values read from WinISD's own
 * cursor read-out (transfer function) or graphs (excursion, port velocity).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseWpr } from "../src/wdr.ts";
import { simulate } from "../src/simulate.ts";

const near = (a: number, b: number, tol: number, what: string) =>
  assert.ok(Math.abs(a - b) <= tol, `${what}: ours ${a.toFixed(4)} vs WinISD ${b} (tol ${tol})`);

function run(file: string, f: number) {
  const p = parseWpr(readFileSync(join(import.meta.dirname, "fixtures", file), "utf8"));
  const t = p.driver.ts;
  const r = simulate(
    {
      fs: t.fs!,
      qms: t.qms!,
      qes: t.qes!,
      vas_l: t.vas_l!,
      re: t.re!,
      sd_cm2: t.sd_cm2!,
      le_mh: p.simulateLe ? p.driver.le_mh : 0,
      xmax_mm: p.driver.xmax_mm,
      pe_w: p.driver.pe_w,
    },
    {
      kind: "vented",
      vb_l: p.box.vb_l,
      port: { shape: "round", diameter_cm: p.port!.diameter_cm, length_cm: p.port!.length_cm },
      portCount: p.port!.count,
      endCorrection: p.port!.endCorrection,
      ql: p.box.ql,
      qa: p.box.qa,
      qp: p.box.qp,
    },
    { power: p.power, rg: p.rg, air: p.air, fMin: f, fMax: f, points: 1 },
  );
  return { p, r, tf: r.spl[0]! - r.summary.referenceSpl, x: r.excursionMm[0]!, v: r.portVelocity![0]! };
}

test("WinISD project file is read correctly (Dayton DSA215-8, vented)", () => {
  const { p } = run("dsa215.wpr", 40);
  assert.equal(p.box.type, "vented");
  near(p.box.vb_l, 18.0233, 1e-3, "Vb");
  near(p.port!.diameter_cm, 10.2, 1e-9, "port Ø");
  near(p.port!.length_cm, 70.642, 1e-3, "port length");
  assert.equal(p.rg, 0.1);
  assert.equal(p.simulateLe, false);
  near(p.power, 100.083, 1e-3, "power");
});

test("DSA215-8 vented: tuning frequency matches WinISD exactly", () => {
  const { r, p } = run("dsa215.wpr", 40);
  near(r.summary.fb!, p.box.fb!, 1e-3, "Fb");
});

test("DSA215-8 vented: transfer function matches WinISD's cursor read-out to 0.01 dB", () => {
  for (const [f, db] of [
    [20.09, -25.034],
    [40, -5.783],
    [80.63, -0.143],
  ] as const) {
    near(run("dsa215.wpr", f).tf, db, 0.01, `TF at ${f} Hz`);
  }
});

test("DSA215-8 vented: excursion and peak port velocity match WinISD's graphs", () => {
  // Read off WinISD's graphs, so the tolerance reflects reading accuracy (±0.3).
  near(run("dsa215.wpr", 20).x, 20.3, 0.3, "excursion at 20 Hz (mm)");
  near(run("dsa215.wpr", 100).x, 3.7, 0.3, "excursion at 100 Hz (mm)");
  near(run("dsa215.wpr", 20).v, 8.5, 0.3, "port velocity at 20 Hz (m/s, peak)");
  near(run("dsa215.wpr", 34.5).v, 10.45, 0.3, "port velocity maximum (m/s, peak)");
});

// ---------------------------------------------------------------------------
// Sealed (WinISD BType=0): DSA215-8 in 10.4 L, Qtc ≈ 0.71
// ---------------------------------------------------------------------------

function runSealed(f: number) {
  const p = parseWpr(readFileSync(join(import.meta.dirname, "fixtures", "dsa215-closed.wpr"), "utf8"));
  const t = p.driver.ts;
  const r = simulate(
    { fs: t.fs!, qms: t.qms!, qes: t.qes!, vas_l: t.vas_l!, re: t.re!, sd_cm2: t.sd_cm2!, le_mh: p.simulateLe ? p.driver.le_mh : 0 },
    { kind: "sealed", vb_l: p.box.vb_l, ql: p.box.ql, qa: p.box.qa },
    { power: p.power, rg: p.rg, air: p.air, fMin: f, fMax: f === 0 ? 500 : f, points: f === 0 ? 4000 : 1 },
  );
  return { p, r, tf: r.spl[0]! - r.summary.referenceSpl };
}

test("DSA215-8 sealed: project is read as a closed box", () => {
  const { p } = runSealed(40);
  assert.equal(p.box.type, "sealed");
  near(p.box.vb_l, 10.4, 1e-9, "Vb");
});

test("DSA215-8 sealed: transfer function matches WinISD's cursor read-out to 0.02 dB", () => {
  for (const [f, db] of [
    [20.28, -23.679],
    [40, -12.113],
    [80.38, -2.86],
  ] as const) {
    near(runSealed(f).tf, db, 0.02, `TF at ${f} Hz`);
  }
});

test("DSA215-8 sealed: WinISD's 'Fsc' (79.03 Hz) is the −3 dB point, matched by our F3", () => {
  const r = simulate(
    { fs: 35, qms: 1.87, qes: 0.4, vas_l: 37.4, re: 5.9, sd_cm2: 211.2, le_mh: 0 },
    { kind: "sealed", vb_l: 10.4 },
    { power: 100.083, rg: 0.1, air: runSealed(40).p.air, fMin: 10, fMax: 500, points: 4000 },
  );
  near(r.summary.f3!, 79.03, 0.15, "F3 vs WinISD Fsc");
  near(r.summary.qtc!, 0.709, 0.005, "Qtc");
});

// ---------------------------------------------------------------------------
// Passive radiator (WinISD BType=4): DSA215-8 + 1× DSA270-PR (+50 g) in 18 L
// ---------------------------------------------------------------------------

import { prFb } from "../src/model.ts";

function runPr(f: number) {
  const p = parseWpr(readFileSync(join(import.meta.dirname, "fixtures", "dsa215-dsa270pr.wpr"), "utf8"));
  const t = p.driver.ts;
  const r = simulate(
    { fs: t.fs!, qms: t.qms!, qes: t.qes!, vas_l: t.vas_l!, re: t.re!, sd_cm2: t.sd_cm2!, le_mh: p.simulateLe ? p.driver.le_mh : 0 },
    { kind: "passive-radiator", vb_l: p.box.vb_l, pr: p.pr!.params, prCount: p.pr!.count, addedMass_g: p.pr!.addedMass_g, ql: p.box.ql, qa: p.box.qa },
    { power: p.power, rg: p.rg, air: p.air, fMin: f, fMax: f, points: 1 },
  );
  return { p, r, tf: r.spl[0]! - r.summary.referenceSpl };
}

test("DSA215-8 + DSA270-PR: project is read as a passive radiator box", () => {
  const { p } = runPr(40);
  assert.equal(p.box.type, "passive-radiator");
  assert.equal(p.pr!.count, 1);
  near(p.pr!.addedMass_g, 50, 1e-9, "added mass");
  near(p.pr!.params.mms_g, 88.16, 0.05, "PR Mms derived from Fs and Vas");
});

test("DSA215-8 + DSA270-PR: tuning matches WinISD exactly (Fh 45.897 Hz, 17.49 Hz with mass)", () => {
  const { p } = runPr(40);
  near(prFb(p.box.vb_l, p.pr!.params, p.pr!.count, p.pr!.addedMass_g, p.air), p.box.fb!, 1e-3, "Fb");
});

test("DSA215-8 + DSA270-PR: transfer function within 0.15 dB of WinISD", () => {
  // Known gap (≈0.1 dB near tuning): WinISD appears to reference box losses to a
  // different frequency for PR boxes. Tighten once a second PR project pins it down.
  for (const [f, db] of [
    [20.09, -38.84],
    [40, -7.79],
    [61.25, -0.315],
  ] as const) {
    near(runPr(f).tf, db, 0.15, `TF at ${f} Hz`);
  }
});
