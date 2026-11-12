import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_STATE, decodeState, decodeStateAny, encodeState, encodeStateShort } from "../src/state.ts";
import { dimensionsFor, grossForNet, shapeOf, solveWedgeFor, volumeFor, wedgeToVolume } from "../src/sim.ts";

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

const wedge = {
  ...DEFAULT_STATE,
  volume: { ...DEFAULT_STATE.volume, shape: "wedge" as const, width_cm: 80, height_cm: 38, depth_cm: 40, topDepth_cm: 25, wall_mm: 18, bracing_pct: 0, driverDisp_l: 0, other_l: 0 },
};

test("car wedge: the calculator's shape is the exact wedge", () => {
  assert.deepEqual(shapeOf(wedge.volume), { kind: "wedge", width_cm: 80, height_cm: 38, topDepth_cm: 25, bottomDepth_cm: 40 });
  assert.ok(Math.abs(volumeFor(wedge, undefined).gross_l - 75.5986) < 1e-4);
  const doubled = { ...wedge, volume: { ...wedge.volume, slopeWall_mm: 36 } };
  assert.equal((shapeOf(doubled.volume) as { slopeWall_mm?: number }).slopeWall_mm, 36);
  assert.ok(volumeFor(doubled, undefined).gross_l < volumeFor(wedge, undefined).gross_l);
});

test("car wedge: its fields survive both link forms; old links get the defaults", async () => {
  const s = { ...wedge, volume: { ...wedge.volume, slopeWall_mm: 36, slope: "rear" as const, joinery: "miter" as const, driverDepth_mm: 140, driverAt_mm: 120 } };
  for (const back of [decodeState(encodeState(s)), await decodeStateAny(await encodeStateShort(s))]) {
    assert.equal(back!.volume.shape, "wedge");
    assert.equal(back!.volume.slopeWall_mm, 36);
    assert.equal(back!.volume.slope, "rear");
    assert.equal(back!.volume.joinery, "miter");
    assert.equal(back!.volume.driverDepth_mm, 140);
    assert.equal(back!.volume.driverAt_mm, 120);
    assert.equal(back!.volume.topDepth_cm, 25);
  }
  const plain = decodeState(encodeState(wedge))!;
  assert.deepEqual([plain.volume.slopeWall_mm, plain.volume.slope, plain.volume.joinery, plain.volume.driverAt_mm], [null, "front", "butt", null]);
});

test("an old truncated-pyramid link (before the wedge fields) still opens as the tapered shape", () => {
  const { slopeWall_mm: _a, slope: _b, joinery: _c, driverDepth_mm: _d, driverAt_mm: _e, ...oldVolume } = DEFAULT_STATE.volume;
  const old = { ...DEFAULT_STATE, volume: { ...oldVolume, shape: "frustum", topWidth_cm: 30, topDepth_cm: 20 } };
  const hash = "s=" + Buffer.from(JSON.stringify(old)).toString("base64url");
  const s = decodeState(hash)!;
  assert.equal(s.volume.shape, "frustum");
  assert.equal(s.volume.topWidth_cm, 30);
  assert.equal(s.volume.slope, "front");
  assert.equal(s.volume.joinery, "butt");
  assert.equal(s.volume.slopeWall_mm, null);
  assert.equal(shapeOf(s.volume).kind, "frustum");
  // Unknown choices from a hand-edited link fall back.
  const odd = decodeState("s=" + Buffer.from(JSON.stringify({ ...old, volume: { ...old.volume, shape: "blob", slope: "up", joinery: "glue" } })).toString("base64url"))!;
  assert.deepEqual([odd.volume.shape, odd.volume.slope, odd.volume.joinery], ["box", "front", "butt"]);
});

test("car wedge: solving one dimension for a net volume, deductions included", () => {
  const s = { ...wedge, volume: { ...wedge.volume, bracing_pct: 5, driverDisp_l: 2 } };
  assert.ok(Math.abs(grossForNet(s, undefined, 60)! - 62 / 0.95) < 1e-12);
  for (const field of ["width", "height", "topDepth", "bottomDepth"] as const) {
    const r = solveWedgeFor(s, undefined, field, 60)!;
    assert.ok(r.ok, field);
    const net = volumeFor({ ...s, volume: wedgeToVolume(s.volume, r.dims) }, undefined).net_l;
    assert.ok(Math.abs(net - 60) < 0.02, `${field}: ${net}`);
  }
  const no = solveWedgeFor(s, undefined, "topDepth", 200)!;
  assert.equal(no.ok, false);
  // Keeping the proportions scales all four together: the slope stays.
  const dims = dimensionsFor(s, undefined, 60, "keep")!;
  const theta = (v: typeof s.volume) => Math.atan2(v.height_cm, v.depth_cm - v.topDepth_cm);
  assert.ok(Math.abs(theta(dims) - theta(s.volume)) < 0.005);
  assert.equal(dims.shape, "wedge");
});
