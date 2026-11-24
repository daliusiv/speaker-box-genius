import { test } from "node:test";
import assert from "node:assert/strict";
import { designDriver, loadDb, prCandidate, type DriverPage } from "./drivers.ts";
import { boxDeltas, PAGE_SUBSTITUTES, similarInput, substitutesFor } from "./similar.ts";
import { variantFamilies } from "../packages/db-tools/src/variants.ts";

// The 10-inch drivers: enough for a real pool (well over 5, so no widening), quick to design.
const db = loadDb();
const prs = db.passiveRadiators.map(prCandidate);
const pages = db.drivers
  .filter((e) => e.data.size_in === 10)
  .map((e) => designDriver(e, prs))
  .filter((p): p is DriverPage => p !== null);
const tens = pages.filter((p) => p.rec.size_in === 10 && (p.rec.type === "woofer" || p.rec.type === "subwoofer"));
const families = variantFamilies(pages.map((p) => ({ id: p.id, file: "", data: p.rec, flags: p.flags })));

test("a page in its own boxes: every difference 0", () => {
  const p = tens[0]!;
  for (const b of boxDeltas(p, p)) {
    assert.equal(b.delta.dF3, 0);
    assert.equal(b.delta.dLevel283, 0);
    assert.ok(b.delta.dMaxSpl === null || b.delta.dMaxSpl === 0);
  }
});

test("substitutes: never itself or its own versions, by distance, ≤ 3 from its brand, no risky on pages", () => {
  assert.ok(tens.length > 20);
  let listed = 0;
  for (const p of tens) {
    const subs = substitutesFor(p, pages);
    const all = substitutesFor(p, pages, { includeRisky: true });
    assert.ok(all.length <= PAGE_SUBSTITUTES);
    const fam = new Set(families.get(p.id) ?? [p.id]);
    for (const s of all) assert.ok(!fam.has(s.id), `${p.id} lists ${s.id}`);
    assert.ok(all.filter((s) => pages.find((x) => x.id === s.id)!.brandSlug === p.brandSlug).length <= 3);
    for (let i = 1; i < all.length; i++) assert.ok(all[i - 1]!.distance <= all[i]!.distance);
    assert.deepEqual(subs, all.filter((s) => s.tier !== "risky"));
    for (const s of all) {
      assert.equal(s.boxes.length, p.designs.filter((d) => !d.compare).length);
      // Demotion only ever lowers the tier.
      const rank = { close: 0, usable: 1, risky: 2 };
      assert.ok(rank[s.tier] >= rank[s.scoreTier]);
    }
    listed += subs.length;
  }
  assert.ok(listed > tens.length, `only ${listed} substitutes over ${tens.length} pages`);
});

test("deterministic", () => {
  const p = tens[tens.length - 1]!;
  assert.deepEqual(substitutesFor(p, pages), substitutesFor(p, pages));
});

test("similarInput: published values only (no default Xmax / Pe), DVC coil impedance", () => {
  for (const p of pages) {
    const x = similarInput(p);
    assert.equal(x.xmax_mm, p.rec.ts.xmax_mm);
    assert.equal(x.pe_w, p.rec.ts.pe_w);
    if (p.rec.voice_coils === 2) {
      const wired = p.rec.ts_wiring ?? "parallel";
      assert.equal(wired === "parallel" ? x.coil_ohms! / 2 : x.coil_ohms! * 2, p.rec.nominal_ohms);
    }
  }
});
