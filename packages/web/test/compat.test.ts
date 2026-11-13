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

test("Settings → SPL reaches boxes as well as lines: the same in the bass, lower up top, twice as much for two cones side by side", async () => {
  const { runDesigns, solveDriver } = await import("../src/sim.ts");
  const sealed = DEFAULT_STATE.designs.filter((d) => d.kind === "sealed");
  const at = (s: typeof DEFAULT_STATE, f: number) => {
    const r = runDesigns(s, solveDriver(s))[0]!.result;
    const i = r.freq.findIndex((x) => x >= f);
    return r.spl[i]!;
  };
  const two = { ...DEFAULT_STATE, designs: sealed, drivers: 2 };
  const hornresp = { ...two, settings: withCompat(two.settings, "hornresp") };
  // The default is unchanged (in front of the box, like WinISD), and the Hornresp preset now reaches boxes.
  assert.equal(DEFAULT_STATE.settings.lineSpl, "on-axis");
  assert.equal(hornresp.settings.lineSpl, "power");
  const power = { ...two, settings: { ...two.settings, lineSpl: "power" as const } };
  assert.ok(Math.abs(at(power, 30) - at(two, 30)) < 0.02, "the same in the bass");
  const one = { ...DEFAULT_STATE, designs: sealed };
  const dropOne = at(one, 300) - at({ ...one, settings: { ...one.settings, lineSpl: "power" } }, 300);
  const dropTwo = at(two, 300) - at(power, 300);
  // The example's 10-inch cone: about 0.2 dB at 300 Hz on its own, about twice that for two side by side.
  assert.ok(dropOne > 0.1 && dropOne < 0.35, `one: ${dropOne}`);
  assert.ok(Math.abs(dropTwo / dropOne - 2) < 0.2, `two: ${dropTwo}`);
});

test("F3 from: the presets keep passband, 'peak' reads as Custom except F3 from, and links keep it", async () => {
  const { COMPAT_NAMES, nearestCompat } = await import("../src/compat.ts");
  const { decodeState, encodeState } = await import("../src/state.ts");
  for (const id of Object.keys(COMPAT) as (keyof typeof COMPAT)[]) assert.equal(COMPAT[id].values.f3From, id === "vituixcad" ? "peak" : "passband");
  assert.equal(COMPAT_NAMES.f3From, "F3 from");
  assert.equal(DEFAULT_STATE.settings.f3From, "passband");
  const peak = { ...withCompat(DEFAULT_STATE.settings, "winisd"), f3From: "peak" as const };
  assert.equal(compatOf(peak), null);
  assert.equal(nearestCompat(peak).id, "winisd");
  assert.deepEqual(nearestCompat(peak).differ, ["f3From"]);
  const link = encodeState(DEFAULT_STATE);
  assert.ok(!link.includes("f3From"), "default stripped from links");
  assert.equal(decodeState(link)!.settings.f3From, "passband");
  const back = decodeState(encodeState({ ...DEFAULT_STATE, settings: { ...DEFAULT_STATE.settings, f3From: "peak" } }))!;
  assert.equal(back.settings.f3From, "peak");
  const bogus = decodeState(encodeState({ ...DEFAULT_STATE, settings: { ...DEFAULT_STATE.settings, f3From: "nope" as never } }))!;
  assert.equal(bogus.settings.f3From, "passband");
});

test("VituixCAD preset: recognised, changes only conventions; qaVolume and ventPlacement default off and survive links", async () => {
  const { COMPAT_NAMES, nearestCompat } = await import("../src/compat.ts");
  const { decodeState, encodeState } = await import("../src/state.ts");
  const mine = { ...DEFAULT_STATE.settings, units: "imperial" as const, ampVolts: 40, losses: { ql: 7, qa: 50, qp: 80 }, airFill: "filled" as const, rg_ohm: 0.3 };
  const v = withCompat(mine, "vituixcad");
  assert.equal(compatOf(v), "vituixcad");
  assert.equal(v.units, "imperial");
  assert.equal(v.ampVolts, 40);
  assert.deepEqual(v.losses, mine.losses);
  assert.equal(v.airFill, "filled");
  assert.equal(v.rg_ohm, 0.3);
  assert.equal(v.qaVolume, true);
  assert.equal(v.ventPlacement, "portLength");
  assert.equal(nearestCompat({ ...v, qaVolume: false }).id, "vituixcad");
  assert.equal(COMPAT_NAMES.qaVolume, "Absorption");
  assert.equal(COMPAT_NAMES.ventPlacement, "Port sound");
  assert.equal(compatOf(DEFAULT_STATE.settings), "default");
  assert.equal(DEFAULT_STATE.settings.qaVolume, false);
  assert.equal(DEFAULT_STATE.settings.ventPlacement, "own");
  const link = encodeState(DEFAULT_STATE);
  assert.ok(!link.includes("qaVolume") && !link.includes("ventPlacement"));
  const d = decodeState(link)!.settings;
  assert.equal(d.qaVolume, false);
  assert.equal(d.ventPlacement, "own");
  const back = decodeState(encodeState({ ...DEFAULT_STATE, settings: v }))!.settings;
  assert.equal(back.qaVolume, true);
  assert.equal(back.ventPlacement, "portLength");
  const bogus = decodeState(encodeState({ ...DEFAULT_STATE, settings: { ...DEFAULT_STATE.settings, qaVolume: "yes" as never, ventPlacement: "nope" as never } }))!.settings;
  assert.equal(bogus.qaVolume, false);
  assert.equal(bogus.ventPlacement, "own");
});
