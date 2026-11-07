import { test } from "node:test";
import assert from "node:assert/strict";
import type { Driver, PassiveRadiator } from "../../schema/src/index.ts";
import { validateDriver, validatePassiveRadiator } from "../../schema/src/index.ts";
import { doubtsXmax, driverFlags, passiveRadiatorFlags } from "../src/plausibility.ts";
import { loadDatabase } from "../src/load.ts";

const driver = (ts: Partial<Driver["ts"]>, extra: Partial<Driver> = {}): Driver => ({
  brand: "Test",
  model: "T1",
  type: "woofer",
  nominal_ohms: 8,
  size_in: 6.5,
  ts: { fs: 40, qms: 4, qes: 0.4, vas_l: 20, re: 6, sd_cm2: 130, xmax_mm: 6, ...ts },
  sources: [{ kind: "datasheet", url: "https://example.com" }],
  status: "community",
  ...extra,
});

const pr = (params: Partial<PassiveRadiator["params"]>, size_in = 6.5): PassiveRadiator => ({
  brand: "Test",
  model: "P1",
  type: "passive-radiator",
  size_in,
  params: { mms_g: 50, sd_cm2: 130, xmax_mm: 10, fs: 20, ...params },
  sources: [{ kind: "datasheet", url: "https://example.com" }],
  status: "community",
});

const codes = (flags: { code: string }[]) => flags.map((f) => f.code);

test("an ordinary driver has no flags", () => {
  assert.deepEqual(driverFlags(driver({})), []);
});

test("long-throw drivers in the database don't trip the Xmax check", () => {
  // Purifi PTT4.0 (8.8 mm on 85 mm) and Dayton UMII8 (18 mm on 160 mm) are real.
  assert.deepEqual(codes(driverFlags(driver({ sd_cm2: 56.7, xmax_mm: 8.8 }, { size_in: 4 }))), []);
  assert.deepEqual(codes(driverFlags(driver({ sd_cm2: 201, xmax_mm: 18 }, { size_in: 8 }))), []);
});

test("a peak-to-peak Xmax is flagged, with the one-way value suggested", () => {
  const f = driverFlags(driver({ sd_cm2: 28.3, xmax_mm: 19 }, { size_in: 3 }));
  assert.deepEqual(codes(f), ["xmax-high"]);
  assert.match(f[0]!.message, /one-way value is 9\.5 mm/);
  assert.ok(doubtsXmax(codes(f)));
});

test("a tiny Xmax is flagged for bass drivers only", () => {
  assert.deepEqual(codes(driverFlags(driver({ xmax_mm: 0.2 }))), ["xmax-low"]);
  // Guitar speakers and midranges legitimately have small Xmax.
  assert.deepEqual(codes(driverFlags(driver({ xmax_mm: 0.2 }, { type: "other" }))), []);
  assert.deepEqual(codes(driverFlags(driver({ xmax_mm: 0.2 }, { type: "midrange" }))), []);
});

test("a size that doesn't match Sd is flagged, but doesn't put Xmax in doubt", () => {
  const f = codes(driverFlags(driver({ sd_cm2: 75 }, { size_in: 3 })));
  assert.deepEqual(f, ["size-sd"]);
  assert.equal(doubtsXmax(f), false);
});

test("passive radiators get a looser Xmax limit", () => {
  // Purifi PTT4.0PR: 14 mm on an 85 mm cone is real.
  assert.deepEqual(codes(passiveRadiatorFlags(pr({ sd_cm2: 56.7, xmax_mm: 14 }, 4))), []);
  assert.deepEqual(codes(passiveRadiatorFlags(pr({ sd_cm2: 56.7, xmax_mm: 28 }, 4))), ["xmax-high"]);
});

test("a plausibility_note clears the flags and passes the schema", () => {
  const d = driver({ sd_cm2: 28.3, xmax_mm: 19 }, { size_in: 3, plausibility_note: "Checked: the datasheet says 19 mm one-way." });
  assert.deepEqual(driverFlags(d), []);
  assert.deepEqual(validateDriver(d), []);
  const p = { ...pr({ xmax_mm: 60 }), plausibility_note: "Checked." };
  assert.deepEqual(passiveRadiatorFlags(p), []);
  assert.deepEqual(validatePassiveRadiator(p), []);
});

test("flags in the real database stay few (each one is a review item)", () => {
  const db = loadDatabase();
  const flagged = [...db.drivers, ...db.passiveRadiators].filter((e) => e.flags.length > 0);
  assert.ok(flagged.length < 40, `${flagged.length} flagged: loosen the thresholds or work through pnpm db:review`);
});
