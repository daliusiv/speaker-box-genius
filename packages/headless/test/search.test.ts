import assert from "node:assert/strict";
import { test } from "node:test";
import { closestIds, searchDrivers, searchPassiveRadiators, type DbIndex } from "../src/index.ts";

const d = (id: string, brand: string, model: string, o: Partial<DbIndex["drivers"][number]> = {}) => ({ id, brand, model, type: "woofer", ohms: 4, ...o });
const index: DbIndex = {
  drivers: [
    d("dayton-audio/dsa215-8", "Dayton Audio", "DSA215-8", { size_in: 8, fs: 28, qts: 0.4, xmax_mm: 9 }),
    d("dayton-audio/dsa215-4", "Dayton Audio", "DSA215-4", { size_in: 8, fs: 28, qts: 0.41, xmax_mm: 9 }),
    d("dayton-audio/rss315ho-4", "Dayton Audio", "RSS315HO-4", { type: "subwoofer", size_in: 12, fs: 22, qts: 0.38, xmax_mm: 22 }),
    d("18-sound/12w700", "18 Sound", "12W700", { size_in: 12, fs: 40, qts: 0.3, xmax_mm: 6 }),
    d("seas/h1207", "SEAS", "H1207 Dayton Tribute", { size_in: 6.5, fs: 30, qts: 0.35 }),
    d("scan-speak/18w-8531g00", "Scan-Speak", "18W/8531G00", { size_in: 7, fs: 25, qts: 0.33, xmax_mm: 8 }),
  ],
  passiveRadiators: [
    { id: "dayton-audio/dayton-pr-8", brand: "Dayton Audio", model: "DSA 8 PR", size_in: 8, sd_cm2: 220 },
    { id: "dayton-audio/dayton-pr-12", brand: "Dayton Audio", model: "PR 12", size_in: 12, sd_cm2: 500 },
    { id: "example-audio/ex10-pr", brand: "Example Audio", model: "EX10-PR", size_in: 10, sd_cm2: 330 },
  ],
};
const ids = (r: { results: { id: string }[] }) => r.results.map((e) => e.id);

test("exact model or id ranks first, whatever the case, spaces and punctuation", () => {
  assert.equal(ids(searchDrivers(index, { query: "DSA 215 8" }))[0], "dayton-audio/dsa215-8");
  assert.equal(ids(searchDrivers(index, { query: "dsa215-8" }))[0], "dayton-audio/dsa215-8");
  assert.equal(ids(searchDrivers(index, { query: "Dayton-Audio/DSA215-8" }))[0], "dayton-audio/dsa215-8");
  assert.deepEqual(ids(searchDrivers(index, { query: "18w8531g00" })), ["scan-speak/18w-8531g00"]);
  assert.deepEqual(ids(searchDrivers(index, { query: "18 sound 12w700" })), ["18-sound/12w700"]);
});

test("model matches rank above brand-only matches", () => {
  // "dayton" is the brand of three drivers and in one model name: the model hit comes first.
  const r = searchDrivers(index, { query: "dayton" });
  assert.equal(r.total, 4);
  assert.equal(ids(r)[0], "seas/h1207");
});

test("all tokens must match; no query lists everything within the filters", () => {
  assert.deepEqual(ids(searchDrivers(index, { query: "dayton rss" })), ["dayton-audio/rss315ho-4"]);
  assert.equal(searchDrivers(index, { query: "zzz" }).total, 0);
  assert.equal(searchDrivers(index, {}).total, 6);
});

test("filters", () => {
  assert.deepEqual(ids(searchDrivers(index, { type: "Subwoofer" })), ["dayton-audio/rss315ho-4"]);
  assert.deepEqual(ids(searchDrivers(index, { size_in: 12 })).sort(), ["18-sound/12w700", "dayton-audio/rss315ho-4"]);
  assert.deepEqual(ids(searchDrivers(index, { size_in: 6.5 })), ["seas/h1207"]);
  assert.deepEqual(ids(searchDrivers(index, { fs_max: 25 })).sort(), ["dayton-audio/rss315ho-4", "scan-speak/18w-8531g00"]);
  assert.deepEqual(ids(searchDrivers(index, { qts_max: 0.33 })).sort(), ["18-sound/12w700", "scan-speak/18w-8531g00"]);
  assert.deepEqual(ids(searchDrivers(index, { xmax_min: 20 })), ["dayton-audio/rss315ho-4"]);
  assert.deepEqual(ids(searchDrivers(index, { query: "dayton", xmax_min: 9 })), ["dayton-audio/dsa215-4", "dayton-audio/dsa215-8", "dayton-audio/rss315ho-4"]);
});

test("limit defaults to 10, is capped at 25, and total counts everything", () => {
  const big: DbIndex = { drivers: Array.from({ length: 40 }, (_, i) => d(`b/m${i}`, "B", `M${i}`)), passiveRadiators: [] };
  assert.equal(searchDrivers(big, {}).results.length, 10);
  assert.equal(searchDrivers(big, { limit: 100 }).results.length, 25);
  assert.equal(searchDrivers(big, { limit: 3 }).results.length, 3);
  assert.equal(searchDrivers(big, { limit: 3 }).total, 40);
});

test("searchPassiveRadiators", () => {
  assert.deepEqual(ids(searchPassiveRadiators(index, { query: "ex10 pr" })), ["example-audio/ex10-pr"]);
  assert.deepEqual(ids(searchPassiveRadiators(index, { size_in: 12 })), ["dayton-audio/dayton-pr-12"]);
  assert.deepEqual(ids(searchPassiveRadiators(index, { sd_min: 300 })).sort(), ["dayton-audio/dayton-pr-12", "example-audio/ex10-pr"]);
});

test("closestIds suggests near misses, same brand first", () => {
  assert.equal(closestIds(index, "dayton-audio/dsa215-9")[0], "dayton-audio/dsa215-4");
  assert.deepEqual(closestIds(index, "dayton-audio/dsa215-9", 2), ["dayton-audio/dsa215-4", "dayton-audio/dsa215-8"]);
  assert.equal(closestIds(index, "dsa215-8")[0], "dayton-audio/dsa215-8", "a model typed without its brand");
  assert.equal(closestIds(index, "example-audio/ex10-pr2", 1, "pr")[0], "example-audio/ex10-pr");
  assert.equal(closestIds(index, "x", 3).length, 3);
  assert.ok(!closestIds(index, "seas/h1207").includes("seas/h1207"));
});
