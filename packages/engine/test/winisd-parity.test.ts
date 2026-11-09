import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { sealedVolumeForAlignment } from "../src/alignments.ts";
import { WINISD_AIR } from "../src/constants.ts";
import { prFb } from "../src/model.ts";
import { simulate } from "../src/simulate.ts";
import { solveTs } from "../src/tsSolver.ts";

const F = JSON.parse(readFileSync(new URL("./fixtures/winisd-parity.json", import.meta.url), "utf8"));
const near = (a: number, b: number, tol: number, what: string) => assert.ok(Math.abs(a - b) <= tol, `${what}: ${a} vs WinISD ${b}`);
const driver = (qts: number) => ({ fs: 30, qms: 5, qes: 1 / (1 / qts - 1 / 5), vas_l: 50, re: 6 });

test("sealed presets: the boxes WinISD's closed-box wizard gives, within its display rounding", () => {
  for (const c of F.sealed.cases) near(sealedVolumeForAlignment({ ...driver(c.qts), style: "winisd" }, c.qtc)!, c.vb, 0.006 + c.vb * 0.0004, `Qts ${c.qts}, Qtc ${c.qtc}`);
});

test("sealed Qtc and Fsc as WinISD shows them with its leak off", () => {
  for (const c of F.qtc.cases) {
    const r = simulate({ ...driver(0.4), sd_cm2: 220 }, { kind: "sealed", vb_l: c.vb, ql: Infinity, qa: c.qa ?? Infinity }, { rg: 0.1, air: WINISD_AIR, fMin: 20, fMax: 200, points: 20 });
    near(r.summary.qtc!, c.qtc, 0.0006, `Qtc, ${c.vb} L, Qa ${c.qa ?? "none"}`);
    near(r.summary.fc!, c.fsc, 0.006, `Fsc, ${c.vb} L`);
  }
});

test("the T/S solver works out what WinISD's driver editor does, with WinISD's air", async () => {
  const { loadDatabase } = await import("../../db-tools/src/load.ts");
  const db = loadDatabase();
  for (const c of F.driverEditor.cases) {
    const t = db.drivers.find((d) => d.id === c.driver)!.data.ts;
    const v = solveTs({ fs: t.fs, qms: t.qms, qes: t.qes, vas_l: t.vas_l, re: t.re, sd_cm2: t.sd_cm2 }, 0.03, WINISD_AIR).values;
    near(v.mms_g!, c.mms_g, 0.051, `${c.driver} Mms`);
    near(v.cms_mm_per_n!, c.cms_mm_per_n, 0.00006, `${c.driver} Cms`);
    near(v.rms! / c.rms, 1, 0.0002, `${c.driver} Rms`);
    near(v.bl! / c.bl, 1, 0.0002, `${c.driver} Bl`);
    const n0 = ((4 * Math.PI ** 2) / WINISD_AIR.c ** 3) * t.fs ** 3 * (t.vas_l / 1000) / t.qes * 100;
    near(n0, c.n0_pct, 0.00006, `${c.driver} η0`);
    near(t.fs / t.qes, c.ebp, 0.006, `${c.driver} EBP`);
  }
});

test("passive radiator tuning: the same formula as WinISD's, with the PR's compliance from its Vas", () => {
  const pr = { mms_g: 300, sd_cm2: 506.7, xmax_mm: 26, qms: 4.79, vas_l: 78.9 };
  for (const c of F.prTuning.cases) near(prFb(c.vb, pr, c.count, c.added_g, WINISD_AIR), c.fb, 0.006, `${c.vb} L, ${c.count} PR`);
});
