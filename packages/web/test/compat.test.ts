import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_STATE } from "../src/state.ts";
import { COMPAT, compatOf, withCompat } from "../src/compat.ts";

test("the default settings are the Default preset, and each preset is recognised after applying it", () => {
  assert.equal(compatOf(DEFAULT_STATE.settings), "default");
  for (const id of Object.keys(COMPAT) as (keyof typeof COMPAT)[]) assert.equal(compatOf(withCompat(DEFAULT_STATE.settings, id)), id);
});

test("a preset changes only the conventions, and a tweak afterwards reads as Custom", () => {
  const mine = { ...DEFAULT_STATE.settings, units: "imperial" as const, ampVolts: 40, losses: { ql: 7, qa: 50, qp: 80 }, coilTemp_C: 60 };
  const h = withCompat(mine, "hornresp");
  assert.equal(h.units, "imperial");
  assert.equal(h.ampVolts, 40);
  assert.deepEqual(h.losses, mine.losses);
  assert.equal(h.coilTemp_C, 60);
  assert.equal(compatOf({ ...h, portModel: "lumped" }), null);
});
