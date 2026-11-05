/**
 * Golden tests against WinISD 0.7.0.950.
 *
 * The cases (real WinISD projects in fixtures/, the values read from WinISD and their
 * tolerances) are in validation/winisd.ts, shared with the validation report
 * (docs/validation/results.json, the site's /validation/ page). This file runs every case's
 * checks and the checks on reading the project files.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { simulate } from "../src/simulate.ts";
import { QUANTITY, WINISD_CASES, loadProject, runCase } from "../validation/winisd.ts";

const near = (a: number, b: number, tol: number, what: string) =>
  assert.ok(Math.abs(a - b) <= tol, `${what}: ours ${a.toFixed(4)} vs WinISD ${b} (tol ${tol})`);

for (const k of WINISD_CASES) {
  test(`WinISD ${k.id}: ${k.title}`, () => {
    for (const c of runCase(k).results) {
      const q = QUANTITY[c.what];
      const where = c.f ? ` at ${c.f} Hz` : "";
      if (c.limit) assert.ok(c.limitOk, `${q.label}${where}: expected the ${c.limit} limit`);
      assert.ok(
        Math.abs(c.diff) <= c.tol,
        `${q.label}${where}: ours ${c.ours.toFixed(4)} vs WinISD ${c.winisd} (${q.rel ? `${(c.diff * 100).toFixed(2)} %` : c.diff.toFixed(4)}, tol ${q.rel ? `${(c.tol * 100).toFixed(2)} %` : c.tol})`,
      );
    }
  });
}

test("WinISD project file is read correctly (Dayton DSA215-8, vented)", () => {
  const p = loadProject("dsa215.wpr");
  assert.equal(p.box.type, "vented");
  near(p.box.vb_l, 18.0233, 1e-3, "Vb");
  near(p.port!.diameter_cm, 10.2, 1e-9, "port Ø");
  near(p.port!.length_cm, 70.642, 1e-3, "port length");
  assert.equal(p.rg, 0.1);
  assert.equal(p.simulateLe, false);
  near(p.power, 100.083, 1e-3, "power");
  near(p.box.fb!, 41.673, 1e-3, "Fb stored in the project");
});

test("sealed project is read as a closed box", () => {
  const p = loadProject("dsa215-closed.wpr");
  assert.equal(p.box.type, "sealed");
  near(p.box.vb_l, 10.4, 1e-9, "Vb");
});

test("passive radiator project is read (DSA270-PR, +50 g)", () => {
  const p = loadProject("dsa215-dsa270pr.wpr");
  assert.equal(p.box.type, "passive-radiator");
  assert.equal(p.pr!.count, 1);
  near(p.pr!.addedMass_g, 50, 1e-9, "added mass");
  near(p.pr!.params.mms_g, 88.16, 0.05, "PR Mms derived from Fs and Vas");
  near(p.box.fb!, 45.897, 1e-3, "Fb stored in the project");
  near(loadProject("dsa215-dsa270pr-50l.wpr").box.fb!, 38.671, 1e-3, "50 L Fb stored in the project");
});

test("high-pass filter is read from the project", () => {
  const p = loadProject("dsa215-hpf.wpr");
  assert.deepEqual(p.highPass, { type: "butterworth", order: 2, freq: 25 });
  assert.equal(p.unsupportedFilters, 0);
});

test("voice-coil inductance option, driver count and leakage are read", () => {
  assert.equal(loadProject("dsa215-le.wpr").simulateLe, true);
  const two = loadProject("dsa215-2drivers.wpr");
  assert.equal(two.drivers, 2);
  assert.equal(two.isobaric, false);
  assert.equal(loadProject("dsa215-ql7.wpr").box.ql, 7);
});

test("4th-order bandpass project is read", () => {
  const p = loadProject("dsa215-bp4.wpr");
  assert.equal(p.box.type, "bandpass");
  const bp = p.bandpass!;
  assert.equal(bp.order, "4");
  near(bp.front.vb_l, 20, 1e-9, "front Vb");
  near(bp.rear.vb_l, 15, 1e-9, "rear Vb");
  near(bp.front.port.diameter_cm, 7.5, 1e-9, "front port Ø");
  near(bp.front.fb, 50, 1e-3, "front tuning (Ff)");
  near(bp.rear.fb!, 65.4166, 1e-3, "rear chamber resonance (Frc)");
  assert.equal(bp.rear.port, undefined);
  assert.equal(bp.qicl, 100);
});

test("6th-order bandpass project is read", () => {
  const p = loadProject("dsa215-bp6.wpr");
  assert.equal(p.box.type, "bandpass");
  assert.equal(p.bandpass!.order, "6p");
});

test("isobaric projects are read", () => {
  for (const f of ["dsa215-iso-sealed.wpr", "dsa215-iso-ported.wpr"]) {
    const p = loadProject(f);
    assert.equal(p.isobaric, true);
    assert.equal(p.drivers, 2);
  }
});

test("a DVC driver wired in series is stored as wired", () => {
  const p = loadProject("dsa215-dvc-series.wpr");
  assert.equal(p.driver.voiceCoils, 2);
  assert.equal(p.driver.raw.vccon, "2");
  near(p.driver.ts.re!, 4 * 5.9, 1e-9, "series Re = 4 × parallel Re");
  near(p.driver.ts.bl!, 2 * 10.6, 1e-9, "series Bl = 2 × parallel Bl");
});

test("an isobaric pair keeps Fs and Qts and halves Vas", () => {
  const drv = { fs: 35, qms: 1.87, qes: 0.4, vas_l: 37.4, re: 5.9, sd_cm2: 211.2, le_mh: 0 };
  const iso = simulate(drv, { kind: "sealed", vb_l: 10 }, { isobaric: { coils: "parallel" }, fMin: 20, fMax: 200, points: 50 });
  const half = simulate({ ...drv, vas_l: drv.vas_l / 2, re: drv.re / 2 }, { kind: "sealed", vb_l: 10 }, { fMin: 20, fMax: 200, points: 50 });
  near(iso.summary.fc!, half.summary.fc!, 1e-9, "Fc");
  near(iso.summary.qtc!, half.summary.qtc!, 1e-9, "Qtc");
  for (let i = 0; i < iso.spl.length; i++) near(iso.spl[i]!, half.spl[i]!, 1e-9, "SPL");
});
