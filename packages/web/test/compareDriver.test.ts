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

test("a comparison driver can have its own count and wiring: one 15″ against two 10″ in one project", async () => {
  const { compareView, compareOwnCount, encodeState, decodeState, encodeStateShort, decodeStateAny } = await import("../src/state.ts");
  const { runDesigns, solveDriver } = await import("../src/sim.ts");
  const main = { ...DEFAULT_STATE, xmax_mm: 14, pe_w: 500, drivers: 1, wiring: "parallel" as const };
  const ten = { ...compareWith(main, full).compare, drivers: 2, wiring: "parallel" as const };
  const s = { ...main, compare: ten };
  // The view uses the comparison's count; the main state keeps its own.
  assert.equal(compareView(s)!.drivers, 2);
  assert.equal(s.drivers, 1);
  assert.equal(compareOwnCount(s), true);
  // Labels say so.
  const labels = runDesigns(s, solveDriver(s)).map((d) => d.label);
  assert.ok(labels.some((l) => l.endsWith("· 2 × Woofer")) || labels.some((l) => / 2 × /.test(l)), labels.join(" | "));
  // The comparison's results are those of the same driver as the main one, two in parallel.
  const asMain = { ...main, ...compareView(s)!, compare: null };
  const a = runDesigns(s, solveDriver(s)).filter((d) => d.compare).map((d) => d.result.maxSpl[100]);
  const b = runDesigns(asMain, solveDriver(asMain)).map((d) => d.result.maxSpl[100]);
  assert.deepEqual(a, b);
  // Swap swaps the counts too, and back again.
  const sw = swapCompare(s);
  assert.equal(sw.drivers, 2);
  assert.equal(sw.compare!.drivers, 1);
  assert.deepEqual(swapCompare(sw).compare, s.compare);
  assert.equal(swapCompare(sw).drivers, 1);
  // Links keep it, long and short.
  assert.deepEqual(decodeState(encodeState(s))!.compare, s.compare);
  assert.deepEqual((await decodeStateAny(await encodeStateShort(s)))!.compare, s.compare);
  // Without its own count it follows the main driver's, as before (and old links decode that way).
  const follow = { ...main, drivers: 3, compare: compareWith(main, full).compare };
  assert.equal(compareView(follow)!.drivers, 3);
  assert.equal(compareOwnCount(follow), false);
  assert.equal(decodeState(encodeState(follow))!.compare!.drivers, undefined);
  assert.equal(swapCompare(follow).drivers, 3);
  assert.equal(swapCompare(follow).compare!.drivers, undefined);
});
