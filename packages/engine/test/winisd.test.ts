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
