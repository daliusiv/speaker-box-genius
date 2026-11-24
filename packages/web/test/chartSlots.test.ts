import { test } from "node:test";
import assert from "node:assert/strict";
import { CHART_GROUPS, defaultSlots, parseSlots, pickSlot, resolveSlots, slotPlace, type ChartKey } from "../src/chartSlots.ts";

const all = new Set<ChartKey>(CHART_GROUPS.flatMap((g) => g.charts.map((c) => c.key)));

test("slots start as response, excursion, max SPL and impedance; the old tab pick seeds the third", () => {
  assert.deepEqual(defaultSlots(), ["response", "excursion", "maxspl", "impedance"]);
  assert.deepEqual(defaultSlots("port"), ["response", "excursion", "port", "impedance"]);
  assert.deepEqual(defaultSlots("impedance"), ["response", "excursion", "impedance", "maxspl"]);
  // The phones' Excursion tab and anything unknown fall back to Max SPL.
  assert.deepEqual(defaultSlots("excursion"), defaultSlots());
  assert.deepEqual(defaultSlots("nonsense"), defaultSlots());
});

test("saved slots read back only when they're four known charts", () => {
  assert.deepEqual(parseSlots('["response","excursion","port","delay"]'), ["response", "excursion", "port", "delay"]);
  assert.equal(parseSlots('["response","excursion"]'), null);
  assert.equal(parseSlots('["response","excursion","port","bogus"]'), null);
  assert.equal(parseSlots("not json"), null);
  assert.equal(parseSlots(null), null);
});

test("a slot whose chart this project doesn't have shows the first chart no slot shows", () => {
  const sealedOnly = new Set<ChartKey>(["response", "excursion", "maxspl", "impedance", "delay", "transient"]);
  // Port speed (no ported box) → the first chart in menu order that no slot holds: Max SPL.
  assert.deepEqual(resolveSlots(["response", "excursion", "port", "impedance"], sealedOnly), ["response", "excursion", "maxspl", "impedance"]);
  // A chart in two slots shows once.
  assert.deepEqual(resolveSlots(["response", "response", "maxspl", "impedance"], all), ["response", "excursion", "maxspl", "impedance"]);
  assert.deepEqual(resolveSlots(["response", "excursion", "maxspl", "impedance"], all), ["response", "excursion", "maxspl", "impedance"]);
});

test("picking a chart another slot shows swaps the two", () => {
  const slots: ChartKey[] = ["response", "excursion", "maxspl", "impedance"];
  assert.deepEqual(pickSlot(slots, slots, 2, "impedance"), ["response", "excursion", "impedance", "maxspl"]);
  assert.deepEqual(pickSlot(slots, slots, 0, "excursion"), ["excursion", "response", "maxspl", "impedance"]);
  assert.deepEqual(pickSlot(slots, slots, 2, "port"), ["response", "excursion", "port", "impedance"]);
  // One per row shows three: the fourth slot keeps its chart.
  assert.deepEqual(pickSlot(slots, slots.slice(0, 3), 2, "delay"), ["response", "excursion", "delay", "impedance"]);
});

test("slot places read naturally", () => {
  assert.equal(slotPlace(1, 2), "top right");
  assert.equal(slotPlace(3, 2), "bottom right");
  assert.equal(slotPlace(2, 1), "third");
});
