import { test } from "node:test";
import assert from "node:assert/strict";
import { stripImpedance, variantFamilies, variantKey, variantLabel, variantLabels } from "../src/variants.ts";
import { loadDatabase, type Entry } from "../src/load.ts";
import type { Driver } from "../../schema/src/index.ts";

/** A minimal driver record; only the fields the grouping reads. */
function drv(id: string, model: string, ohms: number, o: { sd?: number; dvc?: boolean; wiring?: "series" | "parallel"; size?: number } = {}): Entry<Driver> {
  const data = { brand: "B", model, nominal_ohms: ohms, size_in: o.size ?? 12, ts: { sd_cm2: o.sd ?? 500 }, ...(o.dvc ? { voice_coils: 2, ts_wiring: o.wiring } : {}) } as unknown as Driver;
  return { id, file: id, data, flags: [] } as unknown as Entry<Driver>;
}

test("impedance and coil tokens come off the end of a model name", () => {
  assert.equal(stripImpedance("18NLW4100 (4 Ω)", false), "18NLW4100");
  assert.equal(stripImpedance("18NLW4100 (16 ohms)", false), "18NLW4100");
  assert.equal(stripImpedance("X-8 ohm", false), "X");
  assert.equal(stripImpedance("X 4Ω", false), "X");
  assert.equal(stripImpedance("ND90-8", false), "ND90");
  assert.equal(stripImpedance("ND64-16", false), "ND64");
  assert.equal(stripImpedance("SS10-22", true), "SS10");
  assert.equal(stripImpedance("SS10-22", false), "SS10-22");
  assert.equal(stripImpedance("W15D2", false), "W15");
  assert.equal(stripImpedance("PTT6.5M08-NAA-07", false), "PTT6.5M-NAA-07");
  assert.equal(stripImpedance("SW26DAC76-3-DV", true), "SW26DAC76");
  // Not impedances: revisions and sub-models.
  assert.equal(stripImpedance("C12K-2 (16 Ω)", false), "C12K-2");
  assert.equal(stripImpedance("12LW", false), "12LW");
  assert.equal(stripImpedance("FTR12-3070C (8 Ω)", false), "FTR12-3070C");
});

test("the same driver in two impedances is one family, in impedance order", () => {
  const f = variantFamilies([drv("b/18nlw4100-8ohm", "18NLW4100 (8 Ω)", 8), drv("b/18nlw4100-4ohm", "18NLW4100 (4 Ω)", 4)]);
  assert.deepEqual(f.get("b/18nlw4100-8ohm"), ["b/18nlw4100-4ohm", "b/18nlw4100-8ohm"]);
  assert.deepEqual(f.get("b/18nlw4100-4ohm"), f.get("b/18nlw4100-8ohm"));
  const d = variantFamilies([drv("d/nd90-8", "ND90-8", 8), drv("d/nd90-4", "ND90-4", 4)]);
  assert.deepEqual(d.get("d/nd90-4"), ["d/nd90-4", "d/nd90-8"]);
});

test("single voice coil sorts before dual at the same impedance; dual coil suffix pairs", () => {
  const f = variantFamilies([drv("b/ss10-22", "SS10-22", 4, { dvc: true, wiring: "series" }), drv("b/ss10-4", "SS10-4", 4)]);
  assert.deepEqual(f.get("b/ss10-4"), ["b/ss10-4", "b/ss10-22"]);
  const g = variantFamilies([drv("b/w15d4", "W15D4", 4, { dvc: true, wiring: "parallel" }), drv("b/w15d2", "W15D2", 2, { dvc: true, wiring: "parallel" })]);
  assert.deepEqual(g.get("b/w15d4"), ["b/w15d2", "b/w15d4"]);
});

test("versions with a different Sd, size or brand are not merged, and lone drivers have no family", () => {
  const f = variantFamilies([drv("b/x-4", "X-4", 4, { sd: 500 }), drv("b/x-8", "X-8", 8, { sd: 530 })]);
  assert.equal(f.size, 0);
  assert.equal(variantFamilies([drv("b/x-4", "X-4", 4, { sd: 500 }), drv("b/x-8", "X-8", 8, { sd: 509 })]).size, 2);
  assert.equal(variantFamilies([drv("b/x-4", "X-4", 4, { size: 10 }), drv("b/x-8", "X-8", 8, { size: 12 })]).size, 0);
  assert.equal(variantFamilies([drv("a/x-4", "X-4", 4), drv("b/x-8", "X-8", 8)]).size, 0);
  assert.equal(variantFamilies([drv("b/x-8", "X-8", 8)]).size, 0);
});

test("sub-models are different drivers", () => {
  const f = variantFamilies([drv("b/12nlw9300-4", "12NLW9300 (4 Ω)", 4), drv("b/12lw9300-8", "12LW9300 (8 Ω)", 8), drv("b/12nlw9300-8", "12NLW9300 (8 Ω)", 8), drv("b/12nlw9301-8", "12NLW9301 (8 Ω)", 8)]);
  assert.deepEqual(f.get("b/12nlw9300-4"), ["b/12nlw9300-4", "b/12nlw9300-8"]);
  assert.equal(f.has("b/12lw9300-8"), false);
  assert.equal(f.has("b/12nlw9301-8"), false);
});

test("the order does not depend on the input order", () => {
  const es = [drv("b/a-16", "A (16 Ω)", 16), drv("b/a-4", "A (4 Ω)", 4), drv("b/a-8", "A (8 Ω)", 8)];
  const one = variantFamilies(es);
  const two = variantFamilies([...es].reverse());
  assert.deepEqual(one.get("b/a-8"), ["b/a-4", "b/a-8", "b/a-16"]);
  assert.deepEqual(two.get("b/a-8"), one.get("b/a-8"));
});

test("labels: Ω for one coil, each coil's Ω for two, a model suffix when they'd match", () => {
  assert.equal(variantLabel(drv("x", "X", 8).data), "8 Ω");
  assert.equal(variantLabel(drv("x", "X", 2.5).data), "2.5 Ω");
  assert.equal(variantLabel(drv("x", "X", 1, { dvc: true, wiring: "parallel" }).data), "DVC 2+2 Ω");
  assert.equal(variantLabel(drv("x", "X", 8, { dvc: true, wiring: "series" }).data), "DVC 4+4 Ω");
  assert.deepEqual(variantLabels([drv("x", "X-A4", 4).data, drv("y", "X-B4", 4).data, drv("z", "X-8", 8).data]), ["4 Ω (A4)", "4 Ω (B4)", "8 Ω"]);
});

test("the database: 18NLW4100 and the Dayton and Purifi pairs are families", () => {
  const db = loadDatabase();
  const f = variantFamilies(db.drivers);
  assert.deepEqual(f.get("18-sound/18nlw4100-4ohm"), ["18-sound/18nlw4100-4ohm", "18-sound/18nlw4100-8ohm"]);
  assert.deepEqual(f.get("dayton-audio/nd90-8"), ["dayton-audio/nd90-4", "dayton-audio/nd90-8"]);
  assert.equal(f.get("purifi/ptt6-5m04-naa-07")?.length, 2);
  assert.ok(f.size > 300);
  for (const [id, ids] of f) assert.ok(ids.includes(id) && ids.length >= 2);
  // Keys agree inside every family.
  const by = new Map(db.drivers.map((e) => [e.id, e.data]));
  for (const [id, ids] of f) assert.equal(variantKey(id.split("/")[0]!, by.get(id)!), variantKey(ids[0]!.split("/")[0]!, by.get(ids[0]!)!));
});
