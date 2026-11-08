import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_STATE, type AppState } from "../src/state.ts";
import { amplifierLoad, runDesigns, solveDriver, switchDrive } from "../src/sim.ts";

test("switching W ↔ V keeps the same drive, and switching back doesn't drift", () => {
  for (const extra of [{}, { drivers: 2, wiring: "series" as const }, { isobaric: true, isoCoils: "parallel" as const }]) {
    const w: AppState = { ...DEFAULT_STATE, ...extra, power: 100 };
    const v: AppState = { ...w, ...switchDrive(w, "volts") };
    assert.equal(v.drive, "volts");
    const a = runDesigns(w, solveDriver(w))[0]!.result.spl;
    const b = runDesigns(v, solveDriver(v))[0]!.result.spl;
    for (let i = 0; i < a.length; i += 37) assert.ok(Math.abs(a[i]! - b[i]!) < 0.05, `${JSON.stringify(extra)}: ${a[i]} vs ${b[i]}`);
    const back = { ...v, ...switchDrive(v, "watts") };
    assert.equal(back.power, 100);
  }
  // Without a complete driver, nothing to convert with: just switch.
  const bare = { ...DEFAULT_STATE, ts: { fs: 30 } } as AppState;
  assert.equal(switchDrive(bare, "volts").volts, bare.volts);
});

test("the amplifier load follows the wiring: 2 in parallel halve it, 2 in series double it, DVC coils too", () => {
  const load = (extra: Partial<AppState>) => {
    const s: AppState = { ...DEFAULT_STATE, nominal_ohms: 4, ...extra };
    return amplifierLoad(s, solveDriver(s))!;
  };
  const one = load({});
  assert.equal(one.nominal, 4);
  assert.ok(Math.abs(load({ drivers: 2, wiring: "parallel" }).nominal - 2) < 1e-9);
  assert.ok(Math.abs(load({ drivers: 2, wiring: "series" }).nominal - 8) < 1e-9);
  assert.ok(Math.abs(load({ drivers: 2, wiring: "parallel" }).re - one.re / 2) < 1e-9);
  // A DVC driver whose values are for one coil, both coils in series: twice one coil.
  assert.ok(Math.abs(load({ dvc: { on: true, entered: "one", wired: "series" } }).nominal - 8) < 1e-9);
  assert.equal(amplifierLoad({ ...DEFAULT_STATE, ts: { fs: 30 } } as AppState, solveDriver({ ...DEFAULT_STATE, ts: { fs: 30 } } as AppState)), null);
});

test("projects start at 1 W (as WinISD and Hornresp); links from before, with no power, open at the 100 W they were made with", async () => {
  const { compactState, decodeState, encodeState } = await import("../src/state.ts");
  assert.equal(DEFAULT_STATE.power, 1);
  // A new link always carries its power, even the default.
  assert.equal(compactState(DEFAULT_STATE).power, 1);
  const back = decodeState(encodeState(DEFAULT_STATE))!;
  assert.equal(back.power, 1);
  // An old link: the power left out because it was the 100 W default then.
  const old = compactState(DEFAULT_STATE) as Record<string, unknown>;
  delete old.power;
  const fromOld = decodeState(encodeState(old as never));
  assert.equal(fromOld?.power, 100);
});

test("the rated power is the whole bank's: Pe times the drivers, as the thermal limit counts it", async () => {
  const { ratedPowerOf } = await import("../src/sim.ts");
  assert.equal(ratedPowerOf({ ...DEFAULT_STATE, pe_w: 70 }), 70);
  assert.equal(ratedPowerOf({ ...DEFAULT_STATE, pe_w: 70, drivers: 2 }), 140);
  assert.equal(ratedPowerOf({ ...DEFAULT_STATE, pe_w: 0 }), 0);
});

test("my own air conditions: the charts use them, links keep them, and nonsense in a link falls back", async () => {
  const { airOf } = await import("../src/sim.ts");
  const { decodeState, encodeState } = await import("../src/state.ts");
  const cold: AppState = { ...DEFAULT_STATE, settings: { ...DEFAULT_STATE.settings, air: "custom", airConditions: { temp_C: 0, humidity_pct: 0, pressure_hPa: 1013.25 } } };
  assert.ok(Math.abs(airOf(cold).rho - 1.2922) < 0.001);
  const back = decodeState(encodeState(cold))!;
  assert.deepEqual(back.settings.airConditions, cold.settings.airConditions);
  const bad = decodeState(encodeState({ ...cold, settings: { ...cold.settings, airConditions: { temp_C: 900, humidity_pct: -5, pressure_hPa: "x" as never } } }))!;
  assert.deepEqual(bad.settings.airConditions, DEFAULT_STATE.settings.airConditions);
});
