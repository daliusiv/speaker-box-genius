import { test } from "node:test";
import assert from "node:assert/strict";
import { solveTs } from "../../engine/src/tsSolver.ts";
import { isUntouched, splitConflicts } from "../src/datasheetCheck.ts";

// REDCATT 8FHW-1 as published: Qms and Qes give Qts 0.636, the sheet says 0.60 (5.7 % off).
const published = { fs: 41, qms: 4.2, qes: 0.75, qts: 0.6, vas_l: 19.6, re: 4, sd_cm2: 202.3, mms_g: 45.9, bl: 7.88 };

test("untouched means the same parameters with the same numbers", () => {
  assert.equal(isUntouched({ ...published }, published), true);
  assert.equal(isUntouched({ ...published, qts: 0.61 }, published), false);
  const { qts: _, ...fewer } = published;
  assert.equal(isUntouched(fewer, published), false);
  assert.equal(isUntouched(published, undefined), false);
});

test("a database driver's small disagreements are rounding, not warnings", () => {
  const c = solveTs(published).conflicts;
  assert.ok(c.some((x) => x.param === "qts"));
  const s = splitConflicts(published, published, c);
  assert.equal(s.warn.length, 0);
  assert.ok(s.rounding.length > 0);
  assert.ok(s.worst > 0.05 && s.worst <= 0.1);
});

test("typed values keep the strict check; big published disagreements still warn", () => {
  const typed = { ...published, qts: 0.61 };
  const c = solveTs(typed).conflicts;
  assert.deepEqual(splitConflicts(typed, published, c).warn, c);
  const bad = { ...published, qts: 0.45 }; // 29 % off
  const s = splitConflicts(bad, bad, solveTs(bad).conflicts);
  assert.ok(s.warn.some((x) => x.param === "qts"));
});
