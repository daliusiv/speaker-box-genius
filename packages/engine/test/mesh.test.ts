import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildBoxCutPanels,
  buildWedgePanels,
  cutList,
  cylinderMesh,
  earClip,
  faceArea,
  faceCount,
  frustumMesh,
  taperColumn,
  grossVolume,
  lineUp,
  meshVolume,
  panelSetMesh,
  partCenter,
  prismFaces,
  sphereMesh,
  type BoxMesh,
  type MeshPart,
} from "../src/index.ts";

const close = (a: number, b: number, rel = 1e-9) => assert.ok(Math.abs(a - b) <= rel * Math.max(1, Math.abs(b)), `${a} vs ${b}`);
const sum = (m: BoxMesh) => m.parts.reduce((s, p) => s + meshVolume(p.faces), 0) + meshVolume(m.cavity!.faces);

/** Every face's normal points out of its part: away from a point inside a convex part, and agrees with its winding. */
function assertOutward(p: MeshPart) {
  const c = partCenter(p);
  for (const f of p.faces) {
    assert.ok(faceArea(f) > 0);
    // Winding agrees with the stored normal.
    const a = f.v[0]!, b = f.v[1]!, d = f.v[2]!;
    const e1 = [b[0]! - a[0]!, b[1]! - a[1]!, b[2]! - a[2]!], e2 = [d[0]! - a[0]!, d[1]! - a[1]!, d[2]! - a[2]!];
    const n = [e1[1]! * e2[2]! - e1[2]! * e2[1]!, e1[2]! * e2[0]! - e1[0]! * e2[2]!, e1[0]! * e2[1]! - e1[1]! * e2[0]!];
    assert.ok(n[0]! * f.n[0] + n[1]! * f.n[1] + n[2]! * f.n[2] > 0, `${p.id}: winding against the normal`);
    if (p.convex) {
      const m = f.v.reduce((s, v) => [s[0]! + v[0] / f.v.length, s[1]! + v[1] / f.v.length, s[2]! + v[2] / f.v.length], [0, 0, 0]);
      const out = (m[0]! - c[0]) * f.n[0] + (m[1]! - c[1]) * f.n[1] + (m[2]! - c[2]) * f.n[2];
      assert.ok(out > 0, `${p.id}: a face points inwards`);
    }
  }
  assert.ok(meshVolume(p.faces) > 0, `${p.id}: closed and outward`);
}

test("a prism's mesh holds its profile area × width, convex or not", () => {
  const sq = prismFaces([[0, 0], [10, 0], [10, 5], [0, 5]], 0, 3);
  close(meshVolume(sq), 150);
  // An L-shaped (non-convex) profile, given clockwise: still outward and exact.
  const L: [number, number][] = [[0, 0], [0, 4], [1, 4], [1, 1], [3, 1], [3, 0]];
  close(meshVolume(prismFaces(L, 0, 2)), 2 * 6);
  const tris = earClip([...L].reverse());
  assert.equal(tris.length, 4);
});

for (const [name, set] of [
  ["butt wedge", buildWedgePanels({ width: 800, height: 380, topDepth: 250, bottomDepth: 400, wall: 18, holes: [{ kind: "driver", diameter: 282 }] })],
  ["mitred wedge, double baffle", buildWedgePanels({ width: 700, height: 400, topDepth: 200, bottomDepth: 420, wall: 18, slopeWall: 36, joinery: "miter" })],
  ["sloped-back wedge", buildWedgePanels({ width: 700, height: 400, topDepth: 200, bottomDepth: 420, wall: 18, slope: "rear", holes: [{ kind: "driver", diameter: 250 }] })],
  ["panel-table box", buildWedgePanels({ width: 400, height: 500, topDepth: 450, bottomDepth: 450, wall: 18 })],
  ["cut-list box", buildBoxCutPanels({ width: 400, height: 500, depth: 450, wall: 18, holes: [{ kind: "driver", diameter: 282 }, { kind: "port", diameter: 110, on: "back" }] })],
] as const) {
  test(`${name}: panels + inside fill the outside exactly, all normals out`, () => {
    const m = panelSetMesh(set);
    close(sum(m), set.outerVolume, 1e-9);
    close(meshVolume(m.cavity!.faces), set.innerVolume, 1e-9);
    for (const p of m.parts) assertOutward(p);
    assertOutward(m.cavity!);
    assert.equal(m.parts.length, 6);
    assert.ok(faceCount(m) <= 7 * 6);
    // Each panel comes off away from the middle.
    const mid = m.min.map((x, i) => (x + m.max[i]!) / 2);
    for (const p of m.parts) {
      const c = partCenter(p);
      assert.ok((c[0] - mid[0]!) * p.explode[0] + (c[1] - mid[1]!) * p.explode[1] + (c[2] - mid[2]!) * p.explode[2] > 0, p.id);
      assert.ok(Math.abs(Math.hypot(...p.explode) - 1) < 1e-9);
    }
  });
}

test("cut-list box: the panels' blanks are the box cut list's sizes", () => {
  const set = buildBoxCutPanels({ width: 400, height: 500, depth: 450, wall: 18 });
  const c = cutList({ width: 400, height: 500, depth: 450, wall: 18 });
  const sizes = (xs: { a: number; b: number }[]) => xs.map((x) => `${x.a}x${x.b}`).sort();
  const fromCut = c.panels.flatMap((p) => Array(p.qty).fill(p) as typeof p[]);
  assert.deepEqual(sizes(set.panels.map((p) => p.blank)), sizes(fromCut));
  const m = panelSetMesh(buildBoxCutPanels({ width: 400, height: 500, depth: 450, wall: 18, holes: [{ kind: "driver", diameter: 282 }, { kind: "port", diameter: 110, on: "back" }] }));
  const baffle = m.parts.find((p) => p.role === "baffle")!;
  assert.equal(baffle.holes.length, 1);
  assert.deepEqual(baffle.explode, [1, 0, 0]);
  assert.deepEqual(m.parts.find((p) => p.id === "back")!.holes[0]!.normal, [-1, 0, 0]);
  assert.throws(() => buildBoxCutPanels({ width: 30, height: 500, depth: 450, wall: 18 }), RangeError);
});

test("wedge holes sit on the sloped baffle's outside face", () => {
  const set = buildWedgePanels({ width: 800, height: 380, topDepth: 250, bottomDepth: 400, wall: 18, holes: [{ kind: "driver", diameter: 282 }] });
  const m = panelSetMesh(set);
  const baffle = m.parts.find((p) => p.role === "baffle")!;
  const h = baffle.holes[0]!;
  const out = baffle.faces.reduce((b, f) => (f.n[0] * h.normal[0] + f.n[1] * h.normal[1] > b.n[0] * h.normal[0] + b.n[1] * h.normal[1] ? f : b));
  // The rim is in the face's plane, lifted a hair.
  for (const p of h.outline) {
    const d = (p[0] - out.v[0]![0]) * out.n[0] + (p[1] - out.v[0]![1]) * out.n[1] + (p[2] - out.v[0]![2]) * out.n[2];
    assert.ok(d > 0 && d < 1, String(d));
  }
  assert.ok(Math.abs(baffle.explode[0] - h.normal[0]) < 1e-9 && Math.abs(baffle.explode[1] - h.normal[1]) < 1e-9);
});

test("cylinder: caps + tube + inside fill the faceted outside; caps lift off the ends", () => {
  const m = cylinderMesh({ diameter: 320, length: 1000, wall: 6, capWall: 38, holes: [{ kind: "driver", diameter: 230 }] });
  const N = 20;
  const poly = (r: number) => (N / 2) * r * r * Math.sin((2 * Math.PI) / N);
  close(sum(m), poly(160) * 1000, 1e-9);
  close(meshVolume(m.cavity!.faces), poly(154) * (1000 - 76), 1e-9);
  // Faceted inside vs the round one volume.ts uses: within 2 %.
  const round = grossVolume({ kind: "cylinder", diameter_cm: 32, length_cm: 100, capWall_mm: 38 }, 6) * 1e6;
  assert.ok(Math.abs(meshVolume(m.cavity!.faces) / round - 1) < 0.02);
  for (const p of [...m.parts, m.cavity!]) assertOutward(p);
  assert.deepEqual(m.parts.map((p) => p.explode[1]), [-1, 0, 1]);
  assert.equal(m.parts.find((p) => p.id === "cap-top")!.holes.length, 1);
  assert.throws(() => cylinderMesh({ diameter: 10, length: 100, wall: 6 }), RangeError);
});

test("sphere: two shells + inside fill the faceted ball; the halves part front and back", () => {
  const m = sphereMesh({ diameter: 400, wall: 12, holes: [{ kind: "driver", diameter: 200 }, { kind: "port", diameter: 70, u: 150 }] });
  for (const p of [...m.parts, m.cavity!]) assertOutward(p);
  const outerBall = sphereMesh({ diameter: 400, wall: 0.000001 }).cavity!;
  close(sum(m), meshVolume(outerBall.faces), 1e-5);
  const round = grossVolume({ kind: "sphere", diameter_cm: 40 }, 12) * 1e6;
  assert.ok(Math.abs(meshVolume(m.cavity!.faces) / round - 1) < 0.05);
  assert.deepEqual(m.parts.map((p) => p.explode[0]), [-1, 1]);
  const front = m.parts.find((p) => p.id === "half-front")!;
  assert.equal(front.holes.length, 2);
  // Hole rims lie on the sphere.
  for (const p of front.holes[1]!.outline) close(Math.hypot(p[0] - 200, p[1] - 200, p[2] - 200), 200.4, 1e-9);
});

test("tapered box: slabs + mitred walls + inside fill the outside; the inside matches volume.ts", () => {
  const shape = { kind: "frustum" as const, bottomWidth_cm: 50, bottomDepth_cm: 45, topWidth_cm: 30, topDepth_cm: 25, height_cm: 60 };
  const m = frustumMesh({ bottomWidth: 500, bottomDepth: 450, topWidth: 300, topDepth: 250, height: 600, wall: 18, holes: [{ kind: "driver", diameter: 200 }] });
  const outer = (600 / 6) * (500 * 450 + 4 * 400 * 350 + 300 * 250);
  close(sum(m), outer, 1e-9);
  close(meshVolume(m.cavity!.faces), grossVolume(shape, 18) * 1e6, 1e-9);
  for (const p of [...m.parts, m.cavity!]) assertOutward(p);
  assert.equal(m.parts.length, 6);
  assert.equal(m.parts.find((p) => p.id === "wall-front")!.holes.length, 1);
  // A pyramid closing to a point: the inside stops where it closes, the solid tip above it.
  const pyr = frustumMesh({ bottomWidth: 500, bottomDepth: 500, topWidth: 0, topDepth: 0, height: 500, wall: 18 });
  close(sum(pyr), (500 * 500 * 500) / 3, 1e-9);
  close(meshVolume(pyr.cavity!.faces), grossVolume({ ...shape, bottomWidth_cm: 50, bottomDepth_cm: 50, topWidth_cm: 0, topDepth_cm: 0, height_cm: 50 }, 18) * 1e6, 1e-9);
  // Top wider than the bottom.
  const inv = frustumMesh({ bottomWidth: 300, bottomDepth: 250, topWidth: 500, topDepth: 450, height: 600, wall: 18 });
  close(sum(inv), (600 / 6) * (300 * 250 + 4 * 400 * 350 + 500 * 450), 1e-9);
});

test("face counts stay small enough for a phone", () => {
  assert.ok(faceCount(cylinderMesh({ diameter: 2000, length: 1000, wall: 6 })) <= 260);
  assert.ok(faceCount(sphereMesh({ diameter: 2000, wall: 12 })) <= 1000);
  assert.ok(faceCount(sphereMesh({ diameter: 200, wall: 12 })) < faceCount(sphereMesh({ diameter: 2000, wall: 12 })));
});

test("holes line up centred, or spread when they don't fit", () => {
  assert.deepEqual(lineUp([100], 500), [0]);
  const two = lineUp([100, 100], 500, 20);
  assert.deepEqual(two, [-60, 60]);
  const tight = lineUp([300, 300], 400);
  assert.deepEqual(tight, [-100, 100]);
});

test("taperColumn: packs from the wide end, checks the width where each hole sits, centres when it can", () => {
  // 400 wide at the bottom, 200 at the top, 600 up the slant.
  const two = taperColumn([200, 200], 400, 200, 600, 15)!;
  assert.equal(two.length, 2);
  assert.ok(two[0]! < two[1]!, "bottom first");
  assert.ok(two[1]! - two[0]! >= 215 - 1e-9, "no overlap");
  // Three don't fit up 600 mm (3·200 + 4·15 = 660).
  assert.equal(taperColumn([200, 200, 200], 400, 200, 600, 15), null);
  // 230 mm needs 260 wide: fits low on a face that narrows to 240, not high on one that narrows to 150.
  assert.ok(taperColumn([230], 420, 240, 540, 15));
  assert.equal(taperColumn([230, 230], 420, 150, 540, 15), null);
  // Upside down (wider at the top): packs from the top.
  const inv = taperColumn([250], 200, 400, 600, 15)!; // needs 280 wide: only near the (wide) top
  assert.ok(inv[0]! > 0);
  assert.deepEqual(taperColumn([], 1, 1, 1), []);
});
