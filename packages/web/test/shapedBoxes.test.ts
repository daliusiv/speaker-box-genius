import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_STATE, decodeState, encodeState } from "../src/state.ts";
import { dimensionsFor, shapeOf, volumeFor } from "../src/sim.ts";

const tube = { ...DEFAULT_STATE, volume: { ...DEFAULT_STATE.volume, shape: "cylinder" as const, diameter_cm: 32, height_cm: 100, wall_mm: 6 } };

test("cylinder end caps follow the wall until set", () => {
  assert.equal(DEFAULT_STATE.volume.capWall_mm, null);
  assert.deepEqual(shapeOf(tube.volume), { kind: "cylinder", diameter_cm: 32, length_cm: 100 });
  const caps = { ...tube, volume: { ...tube.volume, capWall_mm: 38 } };
  assert.equal(volumeFor(tube, undefined).gross_l > volumeFor(caps, undefined).gross_l, true);
  assert.ok(Math.abs(volumeFor(caps, undefined).gross_l - (Math.PI * 15.4 ** 2 * 92.4) / 1000) < 1e-9);
});

test("end caps survive a link; an old link without them keeps caps = wall", async () => {
  const caps = { ...tube, volume: { ...tube.volume, capWall_mm: 38 } };
  const back = await decodeState(await encodeState(caps));
  assert.equal(back!.volume.capWall_mm, 38);
  const plain = await decodeState(await encodeState(tube));
  assert.equal(plain!.volume.capWall_mm, null);
});

test("sizing a tube can keep its diameter and change only its length", () => {
  const caps = { ...tube, volume: { ...tube.volume, capWall_mm: 38, bracing_pct: 0, driverDisp_l: 0 } };
  const dims = dimensionsFor(caps, undefined, 60, "length")!;
  assert.equal(dims.diameter_cm, 32);
  assert.ok(Math.abs(volumeFor({ ...caps, volume: dims }, undefined).net_l - 60) < 0.1);
  const scaled = dimensionsFor(caps, undefined, 60, "keep")!;
  assert.notEqual(scaled.diameter_cm, 32);
});
