import { test } from "node:test";
import assert from "node:assert/strict";
import { portLengthForFb, portTubeDisplacement, ventedFb } from "@sbg/engine";
import { portCalc, portInputOf, type PortCalcInput } from "../src/calculators/portMath.ts";
import { DEFAULT_STATE } from "../src/state.ts";
import { airOf } from "../src/sim.ts";

const AIR = airOf(DEFAULT_STATE);
const base: PortCalcInput = { vb_l: 75, fb: 25, shape: "round", diameter_cm: 10, width_cm: 30, height_cm: 5, count: 1, flare_cm: 0, ends: "flanged", subtractPort: false, wall_mm: 3 };

test("port calculator: the engine's length, tuning back to the target, for every kind of port", () => {
  for (const i of [
    base,
    { ...base, ends: "both" as const },
    { ...base, ends: "free" as const },
    { ...base, count: 2, diameter_cm: 7.5 },
    { ...base, flare_cm: 2 },
    { ...base, shape: "slot" as const, ends: "flanged" as const },
    { ...base, shape: "slot" as const, ends: "wall" as const },
  ]) {
    const r = portCalc(i, AIR)!;
    assert.ok(r, JSON.stringify(i));
    assert.ok(Math.abs(r.length_cm - portLengthForFb(i.vb_l, portInputOf(i), i.fb, i.count, r.k, AIR)) < 1e-9);
    assert.ok(Math.abs(ventedFb(i.vb_l, portInputOf(i, r.length_cm), i.count, r.k, AIR) - i.fb) < 1e-6);
  }
  // WinISD's three end corrections, and the wall slot's middle value.
  assert.deepEqual(
    (["flanged", "both", "free"] as const).map((ends) => portCalc({ ...base, ends }, AIR)!.k),
    [0.732, 0.85, 0.613],
  );
  assert.equal(portCalc({ ...base, shape: "slot", ends: "wall" }, AIR)!.k, 1.2);
});

test("port calculator: taking the port's own volume off settles length and volume together", () => {
  const r = portCalc({ ...base, subtractPort: true }, AIR)!;
  const plain = portCalc(base, AIR)!;
  assert.ok(r.length_cm > plain.length_cm);
  assert.ok(Math.abs(r.portDisp_l - portTubeDisplacement(10, r.length_cm, 3)) < 1e-9);
  assert.ok(Math.abs(r.tunedVb_l + r.portDisp_l - 75) < 1e-3);
  assert.ok(Math.abs(ventedFb(r.tunedVb_l, portInputOf(base, r.length_cm), 1, r.k, AIR) - 25) < 0.01);
});

test("port calculator: fit, wall-slot range, pipe resonance, and inputs that can't make a port", () => {
  const small = portCalc({ ...base, diameter_cm: 7.5 }, AIR)!;
  assert.ok(small.fits && small.length_cm < small.room_cm);
  assert.equal(portCalc(base, AIR)!.fits, false); // 42.7 cm in a 75 L cube
  assert.equal(portCalc({ ...base, inside_cm: 80 }, AIR)!.fits, true);
  const wall = portCalc({ ...base, shape: "slot", ends: "wall" }, AIR)!;
  assert.ok(wall.wallRange!.low < 25 && wall.wallRange!.high > 25);
  assert.equal(portCalc({ ...base, shape: "slot", ends: "flanged" }, AIR)!.wallRange, undefined);
  assert.ok(Math.abs(small.pipe_hz - AIR.c / (2 * (small.effective_cm / 100))) < 1e-6);
  assert.equal(portCalc({ ...base, vb_l: 0 }, AIR), null);
  assert.equal(portCalc({ ...base, diameter_cm: 0 }, AIR), null);
  assert.equal(portCalc({ ...base, vb_l: 2000, fb: 60, diameter_cm: 3 }, AIR), null); // would need a negative length
});

test("port calculator: WinISD's \"1st port resonance\" is the pipe resonance without end corrections", () => {
  // WinISD 0.7.0.950, Vents tab: a 30 × 5 cm vent in 60 L at 32.395 Hz, its own air → 61.16 cm, 280.97 Hz.
  const air = { c: 343.684120962, rho: 1.20095217715 };
  const r = portCalc({ ...base, vb_l: 60, fb: 32.3950083886, shape: "slot" }, air)!;
  assert.ok(Math.abs(r.length_cm - 61.16) < 0.006, `${r.length_cm}`);
  assert.ok(Math.abs(r.pipeNoEnds_hz - 280.97) < 0.03, `${r.pipeNoEnds_hz}`);
  assert.ok(r.pipe_hz < r.pipeNoEnds_hz);
});
