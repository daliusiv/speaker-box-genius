import { test } from "node:test";
import assert from "node:assert/strict";
import { withDriver } from "../src/assistant.ts";
import { compareWith } from "../src/compareDriver.ts";
import { changedFields, resetDriver } from "../src/driverOrigin.ts";
import { DEFAULT_STATE, type AppState } from "../src/state.ts";
import type { LoadedDriver } from "../src/library.ts";

/** A database entry without Xmax, Pe or a nominal impedance. */
const bare: LoadedDriver = {
  id: "example/w8-bare",
  name: "Example W8 (no limits)",
  brand: "Example",
  ts: { fs: 32, qms: 4.1, qes: 0.42, vas_l: 38, re: 3.3, sd_cm2: 220, bl: 9.1 },
  le_mh: 0.8,
};
/** The driver before: limits of its own, which must not carry over. */
const before: AppState = { ...DEFAULT_STATE, xmax_mm: 21, pe_w: 600, nominal_ohms: 2 };

test("picking a database driver without Xmax or Pe leaves them unset, never the previous driver's", () => {
  const s = withDriver(before, bare);
  assert.equal(s.xmax_mm, 0);
  assert.equal(s.pe_w, 0);
  assert.equal(s.nominal_ohms, 4);
  // A complete entry still sets its own.
  const full = withDriver(before, { ...bare, xmax_mm: 9, pe_w: 150, nominal_ohms: 8 });
  assert.deepEqual([full.xmax_mm, full.pe_w, full.nominal_ohms], [9, 150, 8]);
});

test("Xmax typed for such a driver counts as a change from the database, and Reset clears it", () => {
  const s = { ...withDriver(before, bare), xmax_mm: 7 };
  assert.deepEqual(changedFields(s, bare), ["Xmax"]);
  const back = resetDriver(s, bare);
  assert.equal(back.xmax_mm, 0);
  assert.deepEqual(changedFields(back, bare), []);
});

test("a comparison driver without Xmax or Pe still borrows the main driver's, and says so", () => {
  const main = withDriver(before, { ...bare, xmax_mm: 9, pe_w: 150 });
  const r = compareWith(main, bare);
  assert.equal(r.compare.xmax_mm, 9);
  assert.equal(r.compare.pe_w, 150);
  assert.equal(r.borrowed.length, 2);
  // Nothing to borrow when the main driver's are unset too.
  const none = compareWith(withDriver(before, bare), bare);
  assert.equal(none.compare.xmax_mm, 0);
  assert.deepEqual(none.borrowed, []);
});

test("a comparison driver's borrowed Xmax and Pe don't count as edits, and Reset keeps them", () => {
  const main = withDriver(before, { ...bare, xmax_mm: 9, pe_w: 150 });
  const { compare } = compareWith(main, bare);
  assert.deepEqual(changedFields(compare, bare, true), []);
  const back = resetDriver({ ...compare, ts: { ...compare.ts, fs: 40 } }, bare, true);
  assert.deepEqual([back.xmax_mm, back.pe_w, back.ts.fs], [9, 150, 32]);
});
