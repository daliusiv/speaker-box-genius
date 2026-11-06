import { test } from "node:test";
import assert from "node:assert/strict";
import { simulate } from "@sbg/engine";
import { DEFAULT_STATE, newDesign, type AppState, type BandpassDesign } from "../src/state.ts";
import { driverInputOf, enclosureOf, lossesFor, portRoom_cm, simOptionsOf, solveDriver } from "../src/sim.ts";
import { sizeAllForDriver, sizeBandpassDesign } from "../src/presets.ts";

// A 12″ subwoofer (the default driver) with a 4th- and a 6th-order bandpass box of 60 L each.
const bp = (order: BandpassDesign["order"], id: string): BandpassDesign => ({ ...(newDesign("bandpass", []) as BandpassDesign), id, name: `BP ${order}`, order, vb_l: 30, frontVb_l: 30 });
const state: AppState = { ...DEFAULT_STATE, designs: [bp("4", "a"), bp("6p", "b"), bp("6s", "c")] };

test("Size for a flat band: within the same total volume, a band up to 80 Hz, ports that fit, as simulated", () => {
  for (const d of state.designs.slice(0, 2) as BandpassDesign[]) {
    const r = sizeBandpassDesign(state, d);
    assert.ok(typeof r !== "string", `${d.order}: ${r}`);
    const x = r.design;
    assert.equal(x.order, d.order);
    assert.equal(x.id, d.id);
    assert.equal(x.preset, "Flat band");
    assert.ok(x.vb_l + x.frontVb_l <= 60 * 1.02, `${x.vb_l} + ${x.frontVb_l}`);
    const fits = (p: BandpassDesign["front"], vol: number) => p.length_cm <= portRoom_cm(vol, p.shape === "slot" ? p.slotHeight_cm : p.diameter_cm);
    assert.ok(fits(x.front, x.frontVb_l) && (x.order === "4" || fits(x.rear, x.vb_l)));
    const s = { ...state, designs: [x] };
    const res = simulate(driverInputOf(s, solveDriver(s))!, enclosureOf(x, x.vb_l, lossesFor(s, x), s.volume.wall_mm), simOptionsOf(s));
    assert.ok(res.summary.f3High! >= 80 && res.summary.f3! < 60, `band ${res.summary.f3}–${res.summary.f3High}`);
    assert.match(r.text, /band \d+–\d+ Hz/);
  }
  assert.match(sizeBandpassDesign(state, state.designs[2] as BandpassDesign) as string, /series/);
});

test("Size all boxes sizes bandpass designs too", () => {
  const r = sizeAllForDriver(state);
  assert.equal(r.changed.length, 2);
  assert.equal(r.skipped.length, 1);
  assert.ok(r.state.designs.slice(0, 2).every((d) => d.preset === "Flat band"));
});
