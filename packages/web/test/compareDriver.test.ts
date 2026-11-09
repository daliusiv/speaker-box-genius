import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_STATE, COMPARE_KEYS, swapCompare } from "../src/state.ts";
import { compareWith, compareMessage } from "../src/compareDriver.ts";
import type { LoadedDriver } from "../src/library.ts";

const full: LoadedDriver = {
  name: "Test Woofer 10",
  brand: "Test",
  nominal_ohms: 8,
  ts: { fs: 30, qms: 4, qes: 0.4, vas_l: 40, re: 6, sd_cm2: 330 },
  le_mh: 1.2,
  xmax_mm: 9,
  pe_w: 250,
};

test("a comparison driver gets exactly the fields the main driver gets when loaded", () => {
  const s = { ...DEFAULT_STATE, xmax_mm: 12.3, pe_w: 350 };
  const { compare, borrowed } = compareWith(s, full);
  assert.deepEqual(Object.keys(compare).sort(), [...COMPARE_KEYS].sort());
  assert.equal(compare.driverName, "Test Woofer 10");
  assert.equal(compare.nominal_ohms, 8);
  assert.equal(compare.xmax_mm, 9);
  assert.equal(compare.pe_w, 250);
  assert.equal(compare.le_mh, 1.2);
  assert.deepEqual(borrowed, []);
  // Swapping twice gives back the same two drivers.
  const both = { ...s, compare };
  assert.deepEqual(swapCompare(swapCompare(both)).compare, compare);
  assert.equal(swapCompare(both).xmax_mm, 9);
});

test("a database entry without Xmax or a power rating borrows the main driver's, and the message says so", () => {
  const s = { ...DEFAULT_STATE, xmax_mm: 12.3, pe_w: 350 };
  const noX = compareWith(s, { ...full, xmax_mm: undefined });
  assert.equal(noX.compare.xmax_mm, 12.3);
  assert.deepEqual(noX.borrowed, ["Xmax (12.3 mm)"]);
  assert.match(compareMessage("Test Woofer 10", noX.borrowed), /no Xmax, so its limits use the main driver's Xmax \(12\.3 mm\)/);
  const neither = compareWith(s, { ...full, xmax_mm: undefined, pe_w: undefined });
  assert.deepEqual(neither.borrowed, ["Xmax (12.3 mm)", "power rating (350 W)"]);
  assert.match(compareMessage("T", neither.borrowed), /no Xmax or power rating, so its limits use the main driver's Xmax \(12\.3 mm\) and power rating \(350 W\)/);
  assert.equal(compareMessage("T", []), "Comparing with T: dashed curves in every box.");
  assert.match(compareMessage("T", [], "Xmax looks too large."), /every box\. Xmax looks too large\.$/);
});
