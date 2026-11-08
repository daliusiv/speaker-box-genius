import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_STATE, type VentedDesign } from "../src/state.ts";
import { airOf, portRoom_cm } from "../src/sim.ts";
import { bestVentedPort, ventedPresetPatch } from "../src/presets.ts";

const s = DEFAULT_STATE;
const air = airOf(s);
const vented = s.designs.find((d) => d.kind === "vented") as VentedDesign;
const pick = (d: VentedDesign, vb: number, fb: number) => bestVentedPort(s, d, vb, fb);

test("a preset keeps the port's size when its new length fits the box", () => {
  const v: VentedDesign = { ...vented, shape: "round", diameter_cm: 5, count: 1, flare_cm: 0 };
  const out = ventedPresetPatch(v, { name: "QB3", vb_l: 60, fb: 35 }, 1, air, null, pick);
  assert.equal(out.msg, "");
  assert.ok(out.patch && out.patch.diameter_cm === undefined && out.patch.length_cm! > 0);
  assert.ok(out.patch.length_cm! <= portRoom_cm(60, 5));
  assert.equal(out.patch.vb_l, 60);
  assert.equal(out.patch.targetFb, 35);
});

test("a port that would be too long for the preset's box is swapped for one that fits", () => {
  // A 15 cm tube tuning 20 L to 30 Hz needs far more than the ~12 cm a 20 L box has room for.
  const v: VentedDesign = { ...vented, shape: "round", diameter_cm: 15, count: 1, flare_cm: 0 };
  const out = ventedPresetPatch(v, { name: "QB3", vb_l: 20, fb: 30 }, 1, air, null, pick);
  assert.match(out.msg, /would be too long to fit, so it's now /);
  const p = { ...v, ...out.patch } as VentedDesign;
  const clearance = p.shape === "round" ? p.diameter_cm : p.slotHeight_cm;
  assert.ok(p.length_cm <= portRoom_cm(20, clearance) + 0.05, `${p.shape} ${p.length_cm} cm`);
  assert.equal(p.targetFb, 30);
});

test("with no way to pick a port, the box is left alone and the reason given", () => {
  const v: VentedDesign = { ...vented, shape: "round", diameter_cm: 15, count: 1, flare_cm: 0 };
  const out = ventedPresetPatch(v, { name: "QB3", vb_l: 20, fb: 30 }, 1, air, null);
  assert.equal(out.patch, null);
  assert.match(out.msg, /no simple port fits/);
});

test("stuffing: the box is built smaller than it acts", () => {
  const v: VentedDesign = { ...vented, shape: "round", diameter_cm: 5, count: 1, flare_cm: 0 };
  assert.equal(ventedPresetPatch(v, { name: "QB3", vb_l: 60, fb: 35 }, 1.2, air, null).patch!.vb_l, 50);
});
