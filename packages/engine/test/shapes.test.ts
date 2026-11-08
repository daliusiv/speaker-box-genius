import { test } from "node:test";
import assert from "node:assert/strict";
import { grossVolume, insideLongest_cm, lowestMode_hz, type Shape } from "../src/volume.ts";

const near = (a: number, b: number, tol: number, what: string) => assert.ok(Math.abs(a - b) <= tol, `${what}: ${a} vs ${b}`);

/** Inside volume of a tapered box by slicing (walls square to each face, evenly tapered). */
function sliced(w1: number, d1: number, w2: number, d2: number, h: number, t: number): number {
  const sw = (w1 - w2) / (2 * h), sd = (d1 - d2) / (2 * h);
  const ow = t * Math.hypot(1, sw), od = t * Math.hypot(1, sd);
  const n = 20000, dz = (h - 2 * t) / n;
  let v = 0;
  for (let i = 0; i < n; i++) {
    const z = t + (i + 0.5) * dz;
    v += Math.max(0, w1 - 2 * sw * z - 2 * ow) * Math.max(0, d1 - 2 * sd * z - 2 * od) * dz;
  }
  return v / 1000;
}

test("tapered box: sloping walls are thicker across, and a pyramid's inside closes below its apex", () => {
  const cases: [number, number, number, number, number][] = [
    [40, 45, 25, 30, 50], // gentle taper
    [60, 60, 60, 30, 50], // wedge
    [50, 50, 10, 10, 40], // steep
    [50, 50, 0, 0, 40], // pyramid
    [20, 20, 40, 40, 30], // wider at the top
    [30, 20, 30, 20, 50], // a plain box
  ];
  for (const [w1, d1, w2, d2, h] of cases) {
    const f: Shape = { kind: "frustum", bottomWidth_cm: w1, bottomDepth_cm: d1, topWidth_cm: w2, topDepth_cm: d2, height_cm: h };
    near(grossVolume(f, 18), sliced(w1, d1, w2, d2, h, 1.8), 0.002, `${w1}×${d1} → ${w2}×${d2}, ${h} tall`);
  }
  // Before the fix the walls came off as if they were upright: 19% too much for this pyramid.
  near(grossVolume({ kind: "frustum", bottomWidth_cm: 50, bottomDepth_cm: 50, topWidth_cm: 0, topDepth_cm: 0, height_cm: 40 }, 18), 21.96, 0.01, "pyramid");
  // A box entered as a frustum is still exactly a box.
  near(grossVolume({ kind: "frustum", bottomWidth_cm: 30, bottomDepth_cm: 20, topWidth_cm: 30, topDepth_cm: 20, height_cm: 50 }, 18), 26.4 * 16.4 * 46.4 / 1000, 1e-9, "box as frustum");
});

test("cylinder: end caps can be thicker than the tube", () => {
  const tube = { kind: "cylinder", diameter_cm: 32, length_cm: 100 } as const;
  near(grossVolume(tube, 6), (Math.PI * 15.4 ** 2 * 98.8) / 1000, 1e-9, "caps follow the wall");
  near(grossVolume({ ...tube, capWall_mm: 38 }, 6), (Math.PI * 15.4 ** 2 * 92.4) / 1000, 1e-9, "38 mm caps");
  near(insideLongest_cm({ ...tube, capWall_mm: 38 }, 6), 92.4, 1e-9, "inside length");
});

test("lowest standing wave: half a wavelength in a box, higher in round shapes", () => {
  near(lowestMode_hz({ kind: "box", width_cm: 40, height_cm: 50, depth_cm: 45 }, 18, 343), 343 / (2 * 0.464), 1e-9, "box");
  // Sphere: ka = 2.0816, so f = 2.0816 c / (π D).
  near(lowestMode_hz({ kind: "sphere", diameter_cm: 40 }, 18, 343), (2.0816 * 343) / (Math.PI * 0.364), 1e-9, "sphere");
  // A long tube: along its length; a short fat one: across, at ka = 1.8412.
  near(lowestMode_hz({ kind: "cylinder", diameter_cm: 32, length_cm: 100, capWall_mm: 38 }, 6, 343), 343 / (2 * 0.924), 1e-9, "long tube");
  near(lowestMode_hz({ kind: "cylinder", diameter_cm: 60, length_cm: 30 }, 0, 343), (1.8412 * 343) / (Math.PI * 0.6), 1e-9, "short tube");
});
