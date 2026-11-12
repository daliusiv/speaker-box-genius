import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { grossVolume, wedgeVolume_l } from "../src/index.ts";

/** Cases rebuilt as CAD solids by fixtures/crosscheck/vol.py and wedge_check.py (FreeCAD). */
type Case = { id: string; expected_l: number; tol_l: number } & (
  | { shape: "wedge"; width: number; height: number; topDepth: number; bottomDepth: number; wall: number; slopeWall?: number }
  | { shape: "frustum"; bottomWidth: number; bottomDepth: number; topWidth: number; topDepth: number; height: number; wall: number }
);
const { cases } = JSON.parse(readFileSync(new URL("./fixtures/crosscheck/shapes.json", import.meta.url), "utf8")) as { cases: Case[] };

/** Shoelace area of a polygon. */
const shoelace = (p: [number, number][]) => Math.abs(p.reduce((a, [x, y], i) => a + x * p[(i + 1) % p.length]![1] - p[(i + 1) % p.length]![0] * y, 0)) / 2;

for (const c of cases) {
  test(`cross-check: ${c.id}`, () => {
    if (c.shape === "wedge") {
      const { width: W, height: H, topDepth: D1, bottomDepth: D2, wall: T } = c;
      const Tb = c.slopeWall ?? T;
      const s = (D2 - D1) / H, k = Math.hypot(1, s);
      // Independent: the inside polygon's area by the shoelace sum, times the inside width.
      const cavity: [number, number][] = [[T, T], [D2 - s * T - Tb * k, T], [D1 + s * T - Tb * k, H - T], [T, H - T]];
      const byShoelace = (shoelace(cavity) * (W - 2 * T)) / 1e6;
      assert.ok(Math.abs(byShoelace - c.expected_l) <= c.tol_l, `shoelace ${byShoelace} vs ${c.expected_l}`);
      const engine = wedgeVolume_l({ width: W, height: H, topDepth: D1, bottomDepth: D2, wall: T, slopeWall: Tb });
      assert.ok(Math.abs(engine - c.expected_l) <= c.tol_l, `engine ${engine} vs ${c.expected_l}`);
      // Exact now: no "known +x %" allowance for wedges.
      const viaShape = grossVolume({ kind: "wedge", width_cm: W / 10, height_cm: H / 10, topDepth_cm: D1 / 10, bottomDepth_cm: D2 / 10, slopeWall_mm: Tb }, T);
      assert.ok(Math.abs(viaShape - engine) < 1e-9);
    } else {
      // Tapered (all sides): its own model (every wall tapering evenly) stays as it was.
      const v = grossVolume(
        { kind: "frustum", bottomWidth_cm: c.bottomWidth / 10, bottomDepth_cm: c.bottomDepth / 10, topWidth_cm: c.topWidth / 10, topDepth_cm: c.topDepth / 10, height_cm: c.height / 10 },
        c.wall,
      );
      assert.ok(Math.abs(v - c.expected_l) <= c.tol_l, `frustum ${v} vs ${c.expected_l}`);
    }
  });
}
