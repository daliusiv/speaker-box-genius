import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseOwpr, ventedFb, DEFAULT_END_CORRECTION } from "@sbg/engine";
import { DEFAULT_STATE, decodeState, encodeState } from "../src/state.ts";
import { airOf, runDesigns, solveDriver } from "../src/sim.ts";
import { applyOwpr } from "../src/owprImport.ts";

const fixture = (f: string) => readFileSync(new URL(`../../engine/test/fixtures/openisd/${f}`, import.meta.url), "utf8");

test("an OpenISD sealed project becomes our driver, air, drive and a new sealed box", () => {
  const { state: s, notes } = applyOwpr(DEFAULT_STATE, parseOwpr(fixture("w5-sealed.owpr")), "w5-sealed.owpr");
  assert.equal(s.driverName, "Tang Band W5-1138SMF");
  assert.equal(s.settings.air, "custom");
  assert.deepEqual(s.settings.airConditions, { temp_C: 20, humidity_pct: 30, pressure_hPa: 1013.3 });
  assert.equal(s.settings.rg, 0.1);
  assert.equal(s.drive, "watts");
  assert.equal(s.power, 1);
  const box = s.designs.at(-1)!;
  assert.equal(box.kind, "sealed");
  assert.equal(box.vb_l, 8);
  assert.equal(s.designs.length, DEFAULT_STATE.designs.length + 1);
  assert.ok(notes.some((n) => n.startsWith("Air set")));
  // It simulates, and survives a share link.
  assert.equal(solveDriver(s).missing.length, 0);
  assert.ok(runDesigns(s, solveDriver(s)).every((r) => Number.isFinite(r.result.summary.f3 ?? 0)));
  assert.deepEqual(decodeState(encodeState(s))?.settings.airConditions, s.settings.airConditions);
});

const w5 = parseOwpr(fixture("w5-sealed.owpr"));

test("every OpenISD box type comes in as a design that simulates", () => {
  for (const [f, kind] of [
    ["passiveRadiator-old.owpr", "pr"],
    ["bandpass4-layout5.owpr", "bandpass"],
    ["bandpass6-old.owpr", "bandpass"],
    ["abc-old.owpr", "bandpass"],
  ] as const) {
    // The older files are OpenISD's templates with no driver: give them the W5's.
    const p = { ...parseOwpr(fixture(f)), driver: w5.driver };
    const { state: s } = applyOwpr(DEFAULT_STATE, p, f);
    const d = s.designs.at(-1)!;
    assert.equal(d.kind, kind, f);
    const solved = solveDriver(s);
    assert.equal(solved.missing.length, 0, `${f}: ${solved.missing}`);
    const r = runDesigns(s, solved).find((x) => x.design.id === d.id)!;
    assert.ok(r.result.spl.every(Number.isFinite), f);
  }
});

/** OpenISD's ported template with a 20 L chamber, and either a port length or only a tuning goal. */
function vented(length_m: number | null, goal_hz?: number): string {
  const raw = JSON.parse(fixture("vented-old.owpr"));
  const v = (raw.edited ?? raw.saved).box.vented;
  v.chamber.volume_m3 = 0.02;
  if (goal_hz) v.chamber.tuning_goal_hz = goal_hz;
  if (length_m !== null) v.vent.length_m = { state: "E", value: length_m };
  return JSON.stringify(raw);
}

test("a ported box keeps OpenISD's port length, or gets the length that tunes it to the project's goal", () => {
  const withLength = applyOwpr(DEFAULT_STATE, parseOwpr(vented(0.15)), "v.owpr").state.designs.at(-1)!;
  assert.ok(withLength.kind === "vented" && withLength.vb_l === 20 && withLength.diameter_cm === 5 && withLength.length_cm === 15);
  const { state: s } = applyOwpr(DEFAULT_STATE, parseOwpr(vented(null, 40)), "v.owpr");
  const d = s.designs.at(-1)!;
  assert.ok(d.kind === "vented");
  if (d.kind !== "vented") return;
  const fb = ventedFb(d.vb_l, { shape: "round", diameter_cm: d.diameter_cm, length_cm: d.length_cm }, d.count, DEFAULT_END_CORRECTION, airOf(s));
  assert.ok(Math.abs(fb - 40) < 0.05, `tuning ${fb}`);
  assert.equal(d.targetFb, 40);
});
