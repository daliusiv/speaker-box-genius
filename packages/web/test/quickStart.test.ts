import { test } from "node:test";
import assert from "node:assert/strict";
import { loadDatabase } from "../../db-tools/src/load.ts";
import { withDriver } from "../src/assistant.ts";
import { sizeForNewDriver, type QuickPr } from "../src/quickStart.ts";
import { sizeAllForDriver } from "../src/presets.ts";
import { portRoom_cm } from "../src/sim.ts";
import { DEFAULT_STATE, type PrDesign, type VentedDesign } from "../src/state.ts";

const db = loadDatabase();
const RHO = 1.204;
const C = 343.4;

// The database's PRs as the app loads them (library.ts: Vas from Cms or Fs when it isn't given).
const prs: QuickPr[] = db.passiveRadiators.map((e) => {
  const r = e.data as { brand: string; model: string; params: { mms_g: number; sd_cm2: number; xmax_mm: number; qms?: number; vas_l?: number; cms_mm_per_n?: number; fs?: number } };
  const p = r.params;
  const sd = p.sd_cm2 / 1e4;
  const cms = p.cms_mm_per_n !== undefined ? p.cms_mm_per_n / 1000 : 1 / ((2 * Math.PI * p.fs!) ** 2 * (p.mms_g / 1000));
  const params = { mms_g: p.mms_g, sd_cm2: p.sd_cm2, xmax_mm: p.xmax_mm, qms: p.qms ?? 10, vas_l: Math.round((p.vas_l ?? cms * RHO * C * C * sd * sd * 1000) * 10) / 10 };
  return { id: e.id, name: `${r.brand} ${r.model}`, pr: params, params };
});

function driver(id: string) {
  const r = db.drivers.find((e) => e.id === id)!.data as { brand: string; model: string; nominal_ohms: number; ts: Record<string, number> };
  const { le_mh, xmax_mm, pe_w, ...ts } = r.ts;
  return { name: `${r.brand} ${r.model}`, brand: r.brand, nominal_ohms: r.nominal_ohms, ts, le_mh, xmax_mm, pe_w, source: {} } as unknown as Parameters<typeof withDriver>[1];
}

test("picking a driver from the assistant sizes every example box for it, with a port and a PR to suit", () => {
  const base = withDriver(DEFAULT_STATE, driver("dayton-audio/rss265hf-4"));
  const r = sizeForNewDriver(base, prs);
  const plain = sizeAllForDriver(base).state;
  const kinds = r.state.designs.map((d) => d.kind);
  assert.deepEqual(kinds, base.designs.map((d) => d.kind), "same boxes, none added or removed");
  // Volumes and tunings: exactly what "Size all boxes" gives.
  r.state.designs.forEach((d, i) => assert.equal(d.vb_l, plain.designs[i]!.vb_l, `${d.name} volume`));
  const v = r.state.designs.find((d) => d.kind === "vented") as VentedDesign;
  // The widest port that fits straight in the new box (the example's 10 cm one doesn't).
  assert.ok(v.length_cm > 0 && v.length_cm <= portRoom_cm(v.vb_l, v.diameter_cm, null), `${v.diameter_cm} cm port, ${v.length_cm} cm long, fits`);
  const old = plain.designs.find((d) => d.kind === "vented") as VentedDesign;
  assert.ok(old.length_cm > portRoom_cm(old.vb_l, old.diameter_cm, null), "the example's port would not have fitted");
  const pr = r.state.designs.find((d) => d.kind === "pr") as PrDesign;
  assert.notEqual(pr.prName, (base.designs.find((d) => d.kind === "pr") as PrDesign).prName, "a real PR, not the example");
  assert.ok(prs.some((c) => c.name === pr.prName));
  assert.ok(pr.addedMass_g >= 0);
  assert.ok(r.changed.some((c) => c.includes(pr.prName)), r.changed.join("; "));
});

test("without the PR list (it didn't load) the PR box keeps its PR and is still sized", () => {
  const base = withDriver(DEFAULT_STATE, driver("dayton-audio/rss265hf-4"));
  const r = sizeForNewDriver(base, null);
  const pr = r.state.designs.find((d) => d.kind === "pr") as PrDesign;
  assert.equal(pr.prName, (base.designs.find((d) => d.kind === "pr") as PrDesign).prName);
  assert.equal(r.changed.length, sizeAllForDriver(base).changed.length);
});
