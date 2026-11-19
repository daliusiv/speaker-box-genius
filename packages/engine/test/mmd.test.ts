/**
 * Mmd (moving mass without the air load) and a PR's free-air resonance Fp.
 * Analytic checks, the WinISD reference (a PR's stored Fs) and the datasheet reader.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { STANDARD_AIR } from "../src/constants.ts";
import { readDatasheet } from "../src/datasheet.ts";
import { prFreeAirFs } from "../src/ts.ts";
import { solveTs } from "../src/tsSolver.ts";
import { loadProject } from "../validation/winisd.ts";

const near = (a: number | undefined, b: number, tol: number, what: string) =>
  assert.ok(a !== undefined && Math.abs(a - b) <= tol, `${what}: ${a} vs ${b} (tol ${tol})`);

// Sd 330 cm²: a = √(Sd/π) = 0.10249 m, 16ρa³/3 = 6.913 g at ρ = 1.204 kg/m³.
const AIR_330 = (16 * STANDARD_AIR.rho * (0.033 / Math.PI) ** 1.5) / 3 * 1000;

test("air load of a 330 cm² piston is 6.91 g", () => near(AIR_330, 6.913, 0.001, "16ρa³/3"));

test("Mmd is calculated from Mms and Sd, and Mms from Mmd and Sd", () => {
  const down = solveTs({ mms_g: 86.93, sd_cm2: 330 });
  near(down.values.mmd_g, 86.93 - AIR_330, 1e-9, "Mmd");
  assert.equal(down.source.mmd_g, "derived");
  const up = solveTs({ mmd_g: 80, sd_cm2: 330 });
  near(up.values.mms_g, 80 + AIR_330, 1e-9, "Mms");
  assert.equal(up.source.mms_g, "derived");
});

test("a full set with Mmd in place of Vas gives the same driver", () => {
  const base = { fs: 30, qms: 5.2, qes: 0.4, sd_cm2: 330, re: 3.4 };
  const ref = solveTs({ ...base, vas_l: 50 });
  const viaMmd = solveTs({ ...base, mmd_g: ref.values.mmd_g! });
  assert.deepEqual(viaMmd.missing, []);
  assert.deepEqual(viaMmd.conflicts, []);
  near(viaMmd.values.vas_l, 50, 1e-9, "Vas");
  near(viaMmd.values.bl, ref.values.bl!, 1e-9, "Bl");
});

test("Mms and Mmd that disagree are flagged; Sd is never blamed", () => {
  const r = solveTs({ mms_g: 86.93, mmd_g: 70, sd_cm2: 330 });
  assert.deepEqual(r.conflicts.map((c) => c.param).sort(), ["mmd_g", "mms_g"]);
  assert.equal(r.values.sd_cm2, 330);
  // Mms and Mmd alone never back-solve Sd.
  assert.equal(solveTs({ mms_g: 86.93, mmd_g: 80 }).values.sd_cm2, undefined);
});

test("datasheet reader: Mmd lines fill Mmd, never Mms", () => {
  for (const line of ["Mmd 12.3 g", "Mmd (g) 12.3", "Mmd (g, without air load): 12.3", "Moving mass without air load 12.3 g", "Moving mass, excl. air load: 12.3 g", "Moving mass (Mmd) 12.3 g"]) {
    assert.deepEqual(readDatasheet(line).values, { mmd_g: 12.3 }, line);
  }
  for (const line of ["Mms 14 g", "Mms (incl. air load) 14 g", "Moving Mass (Mms) 14 g", "Moving mass 14 g"]) {
    assert.deepEqual(readDatasheet(line).values, { mms_g: 14 }, line);
  }
});

test("datasheet reader: Rms in kg/s, N·s/m or mechanical ohms is the same number", () => {
  for (const line of ["Rms 1.23 kg/s", "Rms 1.23 N·s/m", "Rms 1.23 Ns/m", "Rms 1.23 N.s/m", "Mechanical resistance 1.23 mech ohm"]) {
    assert.deepEqual(readDatasheet(line).values, { rms: 1.23 }, line);
  }
});

test("PR free-air resonance Fp matches the Fs WinISD stores for the PR", () => {
  for (const file of ["dsa215-dsa270pr.wpr", "dsa215-dsa270pr-50l.wpr"]) {
    const p = loadProject(file);
    const stored = (p.pr!.params as { fs?: number }).fs!;
    near(prFreeAirFs(p.pr!.params, p.air), stored, stored * 1e-9, `${file} Fp`);
  }
});

test("Fp of the example PR (Mmp 122 g, Vap 80 L, Sdp 330 cm²) is 20.0 Hz", () => {
  near(prFreeAirFs({ mms_g: 122, vas_l: 80, sd_cm2: 330 }), 20.0, 0.05, "Fp");
  assert.ok(Number.isNaN(prFreeAirFs({ mms_g: 0, vas_l: 80, sd_cm2: 0 })) || !Number.isFinite(prFreeAirFs({ mms_g: 0, vas_l: 80, sd_cm2: 0 })));
});

test("datasheet reader: converted values keep 5 significant figures; typed numbers stay as written", () => {
  assert.equal(readDatasheet("Compliance Equivalent Volume (Vas) 1.32 ft.³").values.vas_l, 37.378);
  assert.equal(readDatasheet("Sd 35630 mm²").values.sd_cm2, 356.3);
  assert.equal(readDatasheet("Vas 37.378237 L").values.vas_l, 37.378237);
  assert.equal(readDatasheet("Xmax 11 mm p-p").values.xmax_mm, 5.5);
});
