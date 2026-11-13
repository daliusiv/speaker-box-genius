import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { passiveRadiatorModel, STANDARD_AIR, type DriverInput } from "@sbg/engine";
import { applyHornresp, fromHornrespBox, toHornrespBox } from "../src/hornrespBox.ts";
import { importKind } from "../src/formats/imports.ts";
import { exportFormat } from "../src/formats/registry.ts";
import { DEFAULT_STATE, newDesign, type PrDesign, type SealedDesign, type VentedDesign } from "../src/state.ts";

const records = new URL("../../../docs/hornresp-validation/records/", import.meta.url);
const record = (name: string) => readFileSync(new URL(name, records), "utf8");
/** The DSA215-8 the B records use. */
const DSA215: DriverInput = { fs: 35, qms: 1.87, qes: 0.4, vas_l: 37.4, re: 5.9, sd_cm2: 211.2, le_mh: 1 };
const designs = DEFAULT_STATE.designs;
const values = (text: string) => Object.fromEntries([...text.matchAll(/^([A-Za-z][\w' ]*?) = (.+)$/gm)].map((m) => [m[1]!, m[2]!.trim()]));
const close = (a: number, b: number, tol: number) => Math.abs(a - b) <= tol * Math.max(1, Math.abs(b));

test("ported box export: the B2 validation record's box and driver", () => {
  const v: VentedDesign = { ...(newDesign("vented", designs) as VentedDesign), vb_l: 30, shape: "round", diameter_cm: 7, length_cm: 15, flare_cm: 0, count: 1 };
  const out = toHornrespBox(v, DSA215, { vb_l: 30, distance_cm: 0, eg: 2.83, drivers: 1 });
  assert.ok(typeof out !== "string");
  const ours = values(out.text);
  const ref = values(record("B2-ported.txt"));
  for (const k of ["Ang", "Eg", "S1", "S2", "Con", "Vrc", "Lrc", "Ap", "Lpt", "Acoustic Path Length", "Sd", "Re", "Nd"]) assert.equal(ours[k], ref[k], k);
  // Hornresp's air (1.205) against the app's standard air in the driver's mechanical values.
  for (const k of ["Bl", "Cms", "Rms", "Mmd"]) assert.ok(close(Number(ours[k]), Number(ref[k]), 0.003), `${k}: ${ours[k]} vs ${ref[k]}`);
});

test("PR box export: the B3 validation record's passive radiator", () => {
  // B3: DSA270-PR as Hornresp has it (Mmp 88.16 g without the air in front, Cmp 0.596 mm/N, Rmp 2.31).
  const air = (8 * 1.205 * Math.pow(0.0353 / Math.PI, 1.5)) / 3;
  const pr: PrDesign = { ...(newDesign("pr", designs) as PrDesign), vb_l: 50, count: 1, addedMass_g: 0, extra: [], params: { mms_g: 88.16 + air * 1000, sd_cm2: 353, vas_l: 0, qms: 1, xmax_mm: 10 } };
  // Qms such that the PR's damping is B3's 2.31 N·s/m, Vas from its compliance.
  const cmp = 0.596e-3;
  pr.params.vas_l = STANDARD_AIR.rho * STANDARD_AIR.c ** 2 * 0.0353 ** 2 * cmp * 1000;
  pr.params.qms = Math.sqrt(pr.params.mms_g / 1000 / cmp) / 2.31;
  const out = toHornrespBox(pr, DSA215, { vb_l: 50, distance_cm: 0, eg: 2.83, drivers: 1 });
  assert.ok(typeof out !== "string");
  const ours = values(out.text);
  const ref = values(record("B3-passive-radiator.txt"));
  for (const k of ["Vrc", "Lrc", "Sp1", "Cmp", "Mmp", "Rmp", "Added Mass"]) assert.equal(ours[k], ref[k], k);
});

test("box records read back: sealed, ported, PRs, the position and the driver", () => {
  const sealed: SealedDesign = { ...(newDesign("sealed", designs) as SealedDesign), vb_l: 22.5 };
  const vented: VentedDesign = { ...(newDesign("vented", designs) as VentedDesign), vb_l: 60, diameter_cm: 7.5, length_cm: 21.5, flare_cm: 0, count: 1, ventAt: "custom", ventDistance_cm: 35 };
  const pr: PrDesign = { ...(newDesign("pr", designs) as PrDesign), vb_l: 40, count: 2, addedMass_g: 25 };
  for (const [d, dist] of [[sealed, 0], [vented, 35], [pr, 18]] as const) {
    const out = toHornrespBox(d, DSA215, { vb_l: d.vb_l, distance_cm: dist, eg: 2.83, drivers: 2, wiring: "series" });
    assert.ok(typeof out !== "string");
    const back = fromHornrespBox(out.text, designs, "x");
    assert.ok(back && typeof back !== "string", String(back));
    assert.equal(back.design.kind, d.kind);
    assert.ok(close(back.design.vb_l, d.vb_l, 1e-4));
    assert.deepEqual(back.drivers, { count: 2, wiring: "series" });
    for (const k of ["fs", "qms", "qes", "vas_l", "re", "sd_cm2"] as const) assert.ok(close(back.driver!.ts[k]!, DSA215[k], 0.005), k);
    if (d.kind !== "sealed") assert.equal(back.design.kind !== "sealed" && back.design.ventDistance_cm, dist);
    if (d.kind === "vented" && back.design.kind === "vented") {
      assert.ok(close(back.design.diameter_cm, 7.5, 0.002) && back.design.length_cm === 21.5);
    }
    if (d.kind === "pr" && back.design.kind === "pr") {
      // Two PRs come back as one with their area, mass, compliance and damping: the same acoustics.
      const a = passiveRadiatorModel(d.params, d.addedMass_g, STANDARD_AIR);
      const b = passiveRadiatorModel(back.design.params, back.design.addedMass_g, STANDARD_AIR);
      assert.ok(close(b.sd, 2 * a.sd, 1e-3), "area");
      assert.ok(close(b.mmp, 2 * a.mmp, 2e-3), `mass ${b.mmp} vs ${2 * a.mmp}`);
      assert.ok(close(b.cmp, a.cmp / 2, 2e-3), "compliance");
      assert.ok(close(b.rmp, 2 * a.rmp, 5e-3), "damping");
    }
  }
});

test("a line record isn't read as a box; bandpass boxes can't be exported", () => {
  assert.equal(fromHornrespBox(record("01-straight-tl.txt"), designs, "x"), null);
  const f = exportFormat("hornresp")!;
  assert.equal(typeof f.supports!(newDesign("bandpass", designs), DEFAULT_STATE), "string");
  assert.equal(f.supports!(newDesign("line", designs), DEFAULT_STATE), true);
});

test("Open window: a Hornresp record opens as a new design with its driver and Hornresp's settings", () => {
  const text = record("B2-ported.txt");
  assert.equal(importKind("B2-ported.txt", text.slice(0, 4096)), "hornresp");
  const r = applyHornresp(DEFAULT_STATE, text, "B2-ported.txt");
  assert.ok(typeof r !== "string", String(r));
  const d = r.state.designs.at(-1)!;
  assert.equal(r.state.designs.length, designs.length + 1);
  assert.ok(d.kind === "vented" && d.vb_l === 30 && d.length_cm === 15);
  assert.equal(r.state.settings.lineSpl, "power");
  assert.equal(r.state.settings.air, "hornresp");
  // A line record opens as a line.
  const line = applyHornresp(DEFAULT_STATE, record("01-straight-tl.txt"), "01.txt");
  assert.ok(typeof line !== "string" && line.state.designs.at(-1)!.kind === "line");
});

test("Save & Export: Hornresp records for every box but bandpass", () => {
  const f = exportFormat("hornresp")!;
  const ids = DEFAULT_STATE.designs.map((d) => d.id);
  const out = f.run({ state: DEFAULT_STATE, designs: [], shareUrl: "" }, ids, {});
  assert.ok(typeof out !== "string" && "files" in out, String(out));
  assert.equal(out.files.length, ids.length);
  for (const file of out.files) assert.match(String(file.data), /^ID = 55\.30/);
});
