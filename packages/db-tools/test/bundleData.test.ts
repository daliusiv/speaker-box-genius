import { test } from "node:test";
import assert from "node:assert/strict";
import { gzipSync } from "node:zlib";
import { loadDatabase } from "../src/load.ts";
import { buildIndex } from "../src/bundleData.ts";
import { variantFamilies } from "../src/variants.ts";
import { doubtsXmax } from "../src/plausibility.ts";

const db = loadDatabase();
const index = buildIndex(db, "test");
const byId = new Map(index.drivers.map((d) => [d.id, d]));

test("index carries the similar-drivers fields: family, qes, cutout, depth, doubtful Xmax", () => {
  const families = variantFamilies(db.drivers);
  for (const e of db.drivers) {
    const r = byId.get(e.id)!;
    assert.equal(r.qes, e.data.ts.qes, e.id);
    assert.equal(r.cutout_mm, e.data.physical?.cutout_mm, e.id);
    assert.equal(r.depth_mm, e.data.physical?.depth_mm, e.id);
    assert.equal(r.xmax_doubtful, doubtsXmax(e.flags.map((f) => f.code)) ? true : undefined, e.id);
    const fam = families.get(e.id);
    assert.equal(r.family, fam?.[0], e.id);
    // The flag mirrors the flags list the app already reads.
    assert.equal(!!r.xmax_doubtful, !!r.flags?.some((c) => c === "xmax-high" || c === "xmax-low"), e.id);
  }
});

test("versions of one driver share a family key, and other drivers don't", () => {
  const withFamily = index.drivers.filter((d) => d.family);
  assert.ok(withFamily.length > 100, `${withFamily.length} drivers in families`);
  const groups = new Map<string, string[]>();
  for (const d of withFamily) (groups.get(d.family!) ?? groups.set(d.family!, []).get(d.family!)!).push(d.id);
  for (const [key, ids] of groups) {
    assert.ok(ids.length >= 2, key);
    assert.ok(ids.includes(key), `family key ${key} is one of its members`);
    assert.equal(new Set(ids.map((id) => id.split("/")[0])).size, 1, `${key}: one brand`);
  }
});

test("the new fields add less than 15 KB gzipped to index.json", () => {
  const strip = index.drivers.map(({ cutout_mm: _c, depth_mm: _d, family: _f, xmax_doubtful: _x, ...rest }) => rest);
  const before = gzipSync(JSON.stringify({ ...index, drivers: strip })).length;
  const after = gzipSync(JSON.stringify(index)).length;
  assert.ok(after - before < 15_000, `+${after - before} bytes gzipped`);
  console.log(`index.json gz ${before} → ${after} (+${after - before})`);
});
