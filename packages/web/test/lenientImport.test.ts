import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseOwpr, parseWdr, parseWpr } from "@sbg/engine";
import { applyHornresp } from "../src/hornrespBox.ts";
import { driverExtras } from "../src/importReport.ts";
import { applyOwpr } from "../src/owprImport.ts";
import { applyWpr } from "../src/wprImport.ts";
import { projectJson, readProjectFile } from "../src/formats/project.ts";
import { limitsOf, runDesigns, solveDriver } from "../src/sim.ts";
import { decodeState, DEFAULT_STATE, encodeState, type AppState, type VentedDesign } from "../src/state.ts";

const winisd = (f: string) => readFileSync(new URL(`../../engine/test/fixtures/${f}`, import.meta.url), "latin1");
const openisd = (f: string) => readFileSync(new URL(`../../engine/test/fixtures/openisd/${f}`, import.meta.url), "utf8");
const hornresp = (f: string) => readFileSync(new URL(`../../../docs/hornresp-validation/records/${f}`, import.meta.url), "utf8");
/** The file without the lines whose key matches. */
const without = (text: string, keys: RegExp) => text.split(/\r?\n/).filter((l) => !keys.test(l.split("=")[0]!.trim())).join("\n");
const fields = (a: { field: string }[]) => a.map((x) => x.field).sort();

/** A state whose driver has limits of its own, to check they're never carried over. */
const before: AppState = { ...DEFAULT_STATE, xmax_mm: 21, pe_w: 600, nominal_ohms: 2 };

test("complete files list nothing as assumed", () => {
  assert.deepEqual(applyWpr(before, parseWpr(winisd("dsa215.wpr")), "dsa215.wpr").assumed, []);
  assert.deepEqual(applyWpr(before, parseWpr(winisd("dsa215-dsa270pr.wpr")), "pr.wpr").assumed, []);
  const h = applyHornresp(before, hornresp("B2-ported.txt"), "B2-ported.txt");
  assert.ok(typeof h !== "string");
  // Hornresp has no nominal impedance: always 4 Ω, listed.
  assert.deepEqual(fields(h.assumed), ["Znom"]);
});

test(".wdr without Xmax, Pe, Le or Znom: unset or default, listed, never the previous driver's", () => {
  const d = parseWdr(without(winisd("um15-22.wdr"), /^(Xmax|Pe|Le|Znom)$/i));
  const x = driverExtras(d);
  assert.equal(x.xmax_mm, 0);
  assert.equal(x.pe_w, 0);
  assert.equal(x.le_mh, 0);
  assert.equal(x.nominal_ohms, 4);
  assert.deepEqual(fields(x.assumed), ["Le", "Pe", "Xmax", "Znom"]);
  assert.match(x.assumed.find((a) => a.field === "Xmax")!.value, /not set/);
});

test(".wpr without box losses, end correction, PR Qms / Xmax / count: WinISD's defaults, listed", () => {
  const vented = parseWpr(without(winisd("dsa215.wpr"), /^(Qlr|Qar|Qpr|endcorrection|Xmax|Pe)$/i));
  assert.equal(vented.box.ql, 10);
  assert.equal(vented.port!.endCorrection, 0.732);
  const v = applyWpr(before, vented, "dsa215.wpr");
  assert.equal(v.state.xmax_mm, 0, "Xmax isn't the previous driver's 21 mm");
  assert.equal(v.state.pe_w, 0);
  assert.deepEqual(fields(v.assumed), ["Absorption Qa", "Leakage Ql", "Pe", "Port end correction", "Port loss Qp", "Xmax"]);

  const pr = parseWpr(without(winisd("dsa215-dsa270pr.wpr"), /^(Qms|Npr|Qlr)$/i).replace(/^(\[PassiveRadiator\][\s\S]*?)^Xmax=.*$/m, "$1"));
  const p = applyWpr(before, pr, "pr.wpr");
  // The driver's Qms is in [Driver]; only the PR section's goes.
  assert.ok(p.assumed.some((a) => a.field === "PR Qmp" && a.value === "10"));
  assert.ok(p.assumed.some((a) => a.field === "Passive radiators" && a.value === "1"));
  assert.ok(p.assumed.some((a) => a.field === "Leakage Ql"));
  // A sealed or PR box has no port: its Qp isn't listed.
  assert.ok(!p.assumed.some((a) => a.field.startsWith("Port")));
});

test(".owpr without losses: OpenISD's defaults, listed; the driver's limits not carried over", () => {
  // OpenISD's ported template with a 20 L chamber and a port, its losses removed, and the W5's driver.
  const raw = JSON.parse(openisd("vented-old.owpr"));
  const v = (raw.edited ?? raw.saved).box.vented;
  v.chamber.volume_m3 = 0.02;
  v.vent.length_m = { state: "E", value: 0.15 };
  delete v.chamber.losses;
  const w5 = parseOwpr(openisd("w5-sealed.owpr")).driver;
  const p = { ...parseOwpr(JSON.stringify(raw)), driver: { ...w5, xmax_mm: undefined, pe_w: undefined } };
  const r = applyOwpr(before, p, "vented.owpr");
  assert.equal(r.state.designs.at(-1)!.kind, "vented");
  assert.deepEqual(fields(r.assumed).filter((f) => /Q/.test(f)), ["Absorption Qa", "Leakage Ql", "Port loss Qp"]);
  assert.equal(r.state.xmax_mm, 0);
  assert.equal(r.state.pe_w, 0);
  assert.ok(r.assumed.some((a) => a.field === "Xmax") && r.assumed.some((a) => a.field === "Pe"));
});

test("Hornresp PR record without Cmp and Mmp opens with the example PR's, listed", () => {
  const text = without(hornresp("B3-passive-radiator.txt"), /^(Cmp|Mmp)$/);
  const r = applyHornresp(before, text, "B3.txt");
  assert.ok(typeof r !== "string", String(r));
  const d = r.state.designs.at(-1)!;
  assert.equal(d.kind, "pr");
  if (d.kind === "pr") {
    assert.equal(d.params.sd_cm2, 353, "the record's Sp is kept");
    assert.equal(d.params.xmax_mm, 0, "Hornresp has no PR Xmax: not set");
  }
  assert.deepEqual(fields(r.assumed), ["PR Xmax", "PR compliance Cmp", "PR moving mass Mmp", "Znom"]);
});

test("Hornresp ported record without Lpt opens tuned to the driver's Fs, listed", () => {
  const r = applyHornresp(before, without(hornresp("B2-ported.txt"), /^Lpt$/), "B2.txt");
  assert.ok(typeof r !== "string", String(r));
  const d = r.state.designs.at(-1) as VentedDesign;
  assert.equal(d.kind, "vented");
  assert.ok(d.length_cm > 1);
  const lpt = r.assumed.find((a) => a.field === "Port length Lpt");
  assert.ok(lpt);
  assert.match(lpt.note!, /35\.\d Hz/, "tuned to the DSA215's Fs (35 Hz)");
  // The box really is tuned there (impedance minimum between the two peaks).
  const run = runDesigns(r.state, solveDriver(r.state)).find((x) => x.design.id === d.id)!.result;
  assert.ok(Math.abs(run.summary.fb! - 35) < 2, `fb ${run.summary.fb}`);
});

test("a project with a box type this version doesn't know opens without it", () => {
  const file = JSON.parse(projectJson(DEFAULT_STATE));
  file.state.designs = [...file.state.designs, { ...file.state.designs[0], id: "zzz", kind: "horn-from-the-future" }];
  const r = readProjectFile(JSON.stringify(file));
  assert.ok(r);
  assert.equal(r.dropped, 1);
  assert.equal(r.state.designs.length, DEFAULT_STATE.designs.length);
  assert.equal(readProjectFile(projectJson(DEFAULT_STATE))!.dropped, 0);
});

test("Xmax 0 (not set): no cone limit, so nothing goes over", () => {
  const s: AppState = { ...DEFAULT_STATE, xmax_mm: 0, power: 2000 };
  const runs = runDesigns(s, solveDriver(s));
  for (const d of runs) assert.ok(!limitsOf(d.result, 0, false).over.includes("xmax"));
  // With a real Xmax the same drive is over (the check above isn't vacuous).
  assert.ok(runs.some((d) => limitsOf(d.result, 1, false).over.includes("xmax")));
});

test("an unset Xmax and Pe survive a share link and a project file (not reset to the defaults)", () => {
  const s: AppState = { ...DEFAULT_STATE, xmax_mm: 0, pe_w: 0 };
  const back = decodeState(encodeState(s))!;
  assert.equal(back.xmax_mm, 0);
  assert.equal(back.pe_w, 0);
  assert.equal(readProjectFile(projectJson(s))!.state.xmax_mm, 0);
});
