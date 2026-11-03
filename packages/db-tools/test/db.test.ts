import { test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { loadDatabase, REPO_ROOT } from "../src/load.ts";

test("the real database is valid", () => {
  const db = loadDatabase();
  assert.deepEqual(db.errors, []);
});

test("the documented examples are valid", () => {
  const db = loadDatabase(join(REPO_ROOT, "docs/examples"));
  assert.deepEqual(db.errors, []);
  assert.deepEqual(db.warnings, []);
  assert.equal(db.drivers.length, 1);
  assert.equal(db.passiveRadiators.length, 1);
  assert.equal(db.drivers[0]?.id, "example-audio/ex10-4");
  assert.equal(db.brands.get("example-audio")?.name, "Example Audio");
});

test("bad entries are reported with useful messages", () => {
  const db = loadDatabase(join(import.meta.dirname, "fixtures/bad"));
  const all = db.errors.join("\n");
  const expect = (re: RegExp) => assert.match(all, re);

  expect(/Bad_Brand: folder name must be a lowercase slug/);
  expect(/Bad_Brand: missing _brand.json/);
  expect(/x\.json: model: required/);
  expect(/x\.json: sources: at least one source is required/);
  expect(/u8\.json: sources\[0\]: a datasheet source needs a url/);
  assert.equal(db.drivers.length, 0);
});

test("a displacement equal to Vd is caught", () => {
  const db = loadDatabase(join(import.meta.dirname, "fixtures/bad"));
  assert.ok(db.errors.some((e) => e.includes("vd.json") && e.includes("equals Vd")), db.errors.join("\n"));
});

test("unit mix-ups fail the consistency check", () => {
  const db = loadDatabase(join(import.meta.dirname, "fixtures/bad"));
  assert.ok(
    db.errors.some((e) => e.includes("t12.json") && e.includes("imply Mms")),
    "Vas entered in ft³ should be flagged",
  );
});

test("dual voice coil fields are checked", async () => {
  const { validateDriver } = await import("../../schema/src/index.ts");
  const base = JSON.parse(
    (await import("node:fs")).readFileSync(join(REPO_ROOT, "drivers/dayton-audio/mx12-22.json"), "utf8"),
  );
  assert.deepEqual(validateDriver(base), []);
  assert.match(validateDriver({ ...base, ts_wiring: undefined }).join("\n"), /ts_wiring: must be one of series, parallel/);
  assert.match(validateDriver({ ...base, voice_coils: 3 }).join("\n"), /voice_coils: must be 1 or 2/);
  const { voice_coils: _, ...single } = base;
  assert.match(validateDriver(single).join("\n"), /ts_wiring: only for dual voice coil drivers/);
});

test("L2 and R2 go together", async () => {
  const { validateDriver } = await import("../../schema/src/index.ts");
  const base = JSON.parse(
    (await import("node:fs")).readFileSync(join(REPO_ROOT, "drivers/dayton-audio/rss315hf-4.json"), "utf8"),
  );
  assert.deepEqual(validateDriver({ ...base, ts: { ...base.ts, l2_mh: 0.88, r2_ohm: 4.8 } }), []);
  assert.match(validateDriver({ ...base, ts: { ...base.ts, l2_mh: 0.88 } }).join("\n"), /l2_mh and r2_ohm go together/);
});
