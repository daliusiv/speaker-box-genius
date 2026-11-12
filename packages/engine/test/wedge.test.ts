import { readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildBoxPanels,
  buildWedgePanels,
  grossVolume,
  insideLongest_cm,
  polygonArea,
  prismVolume,
  solveWedge,
  topDepthForAngle,
  wedgeAngles,
  wedgeCutList,
  wedgeDriverClearance,
  wedgeFromInside,
  wedgeGeometry,
  wedgeIssues,
  wedgeVolume_l,
  type WedgeDims,
} from "../src/index.ts";

const near = (a: number, b: number, tol: number, what: string) => assert.ok(Math.abs(a - b) <= tol, `${what}: ${a} vs ${b}`);

/** The worked example from the spec. */
const EX: WedgeDims = { width: 800, height: 380, topDepth: 250, bottomDepth: 400, wall: 18 };

test("wedge: the worked example", () => {
  const g = wedgeGeometry(EX);
  near(g.theta, 68.459, 0.001, "θ");
  near(g.phi, 21.541, 0.001, "φ");
  near(g.insideBottomDepth, 355.543, 0.001, "inside bottom depth");
  near(g.insideTopDepth, 219.754, 0.001, "inside top depth");
  near(g.volume_l, 75.5986, 0.0001, "V");
  near(g.naiveVolume_l, 75.9538, 0.0001, "the (D_avg − 2T) shortcut");
  near(g.insideSlant, 369.83, 0.005, "baffle slant inside");
});

test("wedge: as the top depth reaches the bottom one it is a box", () => {
  const box = grossVolume({ kind: "box", width_cm: 80, height_cm: 38, depth_cm: 40 }, 18);
  near(wedgeVolume_l({ ...EX, topDepth: 400 }), box, 1e-9, "equal depths");
  near(wedgeVolume_l({ ...EX, topDepth: 400 - 1e-6 }), box, 1e-6, "limit");
  // A double baffle on a box is just a thicker front.
  near(wedgeVolume_l({ ...EX, topDepth: 400, slopeWall: 36 }), (764 * 344 * (400 - 18 - 36)) / 1e6, 1e-9, "double baffle box");
});

test("wedge: the inside closing before the top is clipped, not negative", () => {
  const d = { ...EX, topDepth: 10 };
  const g = wedgeGeometry(d);
  assert.ok(g.insideTopDepth < 0);
  // Triangle: inside depth falls from the bottom value to 0 where it closes.
  const a = g.insideBottomDepth, b = g.insideTopDepth;
  near(g.volume_l, (764 * (a * a) / (a - b) / 2 * 344) / 1e6, 1e-9, "clipped");
  assert.equal(wedgeVolume_l({ ...EX, width: 30 }), 0);
});

test("wedge: inside dimensions back to the outside", () => {
  for (const d of [EX, { ...EX, slopeWall: 36 }, { ...EX, topDepth: 120, wall: 25 }]) {
    const g = wedgeGeometry(d);
    const back = wedgeFromInside({ width: g.insideWidth, height: g.insideHeight, topDepth: g.insideTopDepth, bottomDepth: g.insideBottomDepth, wall: d.wall, slopeWall: d.slopeWall });
    near(back.width, d.width, 1e-9, "W");
    near(back.height, d.height, 1e-9, "H");
    near(back.topDepth, d.topDepth, 1e-9, "D1");
    near(back.bottomDepth, d.bottomDepth, 1e-9, "D2");
  }
  near(topDepthForAngle(400, 380, wedgeGeometry(EX).theta), 250, 1e-9, "D1 from θ");
});

test("panels: every panel plus the inside fills the outside exactly", () => {
  const cases: WedgeDims[] = [EX, { ...EX, slopeWall: 36 }, { ...EX, topDepth: 400 }, { width: 500, height: 300, topDepth: 120, bottomDepth: 450, wall: 25, slopeWall: 19 }];
  for (const d of cases) {
    for (const slope of ["front", "rear"] as const) {
      for (const joinery of ["butt", "miter"] as const) {
        const set = buildWedgePanels({ ...d, slope, joinery });
        const what = `${JSON.stringify(d)} ${slope} ${joinery}`;
        const sum = set.panels.reduce((a, p) => a + prismVolume(p), 0) + prismVolume(set.cavity);
        near(sum, set.outerVolume, 1e-6 * set.outerVolume, `${what}: panels + inside`);
        near(set.innerVolume / 1e6, wedgeVolume_l(d), 1e-9, `${what}: inside = closed form`);
        near(set.outerVolume, ((d.topDepth + d.bottomDepth) / 2) * d.height * d.width, 1e-6, `${what}: outside`);
        for (const p of set.panels) assert.ok(polygonArea(p.profile) > 0, `${what}: ${p.id} counter-clockwise`);
        assert.ok(polygonArea(set.cavity.profile) > 0);
        assert.equal(set.panels.length, 6);
        assert.deepEqual(set.panels.map((p) => p.role).sort(), ["back", "baffle", "bottom", "side", "side", "top"]);
      }
    }
  }
});

test("panels: butt joints follow the spec's profiles and bevels", () => {
  const set = buildWedgePanels(EX);
  const g = wedgeGeometry(EX);
  const { s, k } = g;
  const by = (id: string) => set.panels.find((p) => p.id === id)!;
  assert.deepEqual(by("bottom").profile, [[0, 0], [400, 0], [400 - s * 18, 18], [0, 18]]);
  assert.deepEqual(by("back").profile, [[0, 362], [0, 18], [18, 18], [18, 362]]);
  const baffle = by("baffle");
  near(baffle.thickness, 18, 1e-9, "baffle thickness");
  near(baffle.blank.b, (380 - 36) * k, 1e-9, "baffle face (H − 2T)/sin θ");
  assert.equal(baffle.blank.a, 764);
  assert.deepEqual(baffle.bevels!.map((b) => [b.edge, b.longPoint]), [["bottom", "outer"], ["top", "inner"]]);
  for (const b of baffle.bevels!) near(b.angle, g.phi, 1e-9, "baffle bevel");
  assert.deepEqual(by("bottom").bevels!.map((b) => [b.edge, b.longPoint]), [["front", "outer"]]);
  assert.deepEqual(by("top").bevels!.map((b) => [b.edge, b.longPoint]), [["front", "inner"]]);
  near(by("top").blank.b, 250 + s * 18, 1e-9, "top inner face is the long one");
  assert.deepEqual([by("side-left").z0, by("side-left").z1, by("side-right").z0, by("side-right").z1], [0, 18, 782, 800]);
  assert.deepEqual([baffle.z0, baffle.z1], [18, 782]);
});

test("panels: mitred corners have the textbook saw tilts", () => {
  const set = buildWedgePanels({ ...EX, joinery: "miter" });
  const th = wedgeGeometry(EX).theta;
  const by = (id: string) => set.panels.find((p) => p.id === id)!;
  const tilt = (id: string, edge: string) => by(id).bevels!.find((b) => b.edge === edge)!.angle;
  near(tilt("back", "top"), 45, 1e-9, "back corner");
  near(tilt("bottom", "front"), 90 - th / 2, 1e-9, "bottom–baffle");
  near(tilt("baffle", "bottom"), 90 - th / 2, 1e-9, "baffle–bottom");
  near(tilt("top", "front"), th / 2, 1e-9, "top–baffle");
  // Long-point sizes: top D1, bottom D2, back H, baffle H/sin θ.
  near(by("top").blank.b, 250, 1e-9, "top");
  near(by("bottom").blank.b, 400, 1e-9, "bottom");
  near(by("back").blank.b, 380, 1e-9, "back");
  near(by("baffle").blank.b, wedgeGeometry(EX).outsideSlant, 1e-9, "baffle");
  const a = wedgeAngles(EX);
  near(a.miter.bottom[0], 90 - th / 2, 1e-9, "angles: bottom");
  near(a.miter.top[1], th / 2, 1e-9, "angles: top");
});

test("panels: a box is the wedge with equal depths", () => {
  const set = buildBoxPanels({ width: 400, height: 500, depth: 450, wall: 18 });
  near(set.innerVolume / 1e6, grossVolume({ kind: "box", width_cm: 40, height_cm: 50, depth_cm: 45 }, 18), 1e-9, "inside");
  assert.ok(set.panels.every((p) => !p.bevels), "all square");
  const miter = buildBoxPanels({ width: 400, height: 500, depth: 450, wall: 18, joinery: "miter" });
  assert.ok(miter.panels.filter((p) => p.role !== "side").every((p) => p.bevels!.every((b) => Math.abs(b.angle - 45) < 1e-9)));
});

test("panels: driver holes sit on the baffle's outside face", () => {
  const set = buildWedgePanels({ ...EX, holes: [{ kind: "driver", diameter: 280 }] });
  const h = set.panels.find((p) => p.role === "baffle")!.holes![0]!;
  const th = (wedgeGeometry(EX).theta * Math.PI) / 180;
  // On the outside face: x = D2 − y·cot θ.
  near(h.center[0], 400 - h.center[1] / Math.tan(th), 1e-9, "on the face");
  near(h.center[2], 400, 1e-9, "centred across");
  near(Math.hypot(h.normal[0], h.normal[1]), 1, 1e-12, "unit normal");
  const rear = buildWedgePanels({ ...EX, slope: "rear", holes: [{ kind: "driver", diameter: 280 }] });
  assert.deepEqual(rear.panels.find((p) => p.role === "baffle")!.holes![0]!.center, [400, 190, 400]);
});

test("solver: each field round-trips", () => {
  const d: WedgeDims = { ...EX, slopeWall: 25 };
  const v = wedgeVolume_l(d);
  for (const field of ["width", "height", "topDepth", "bottomDepth"] as const) {
    const moved = { ...d, [field]: d[field] * (field === "topDepth" ? 0.8 : 1.15) };
    const r = solveWedge(moved, field, v);
    assert.ok(r.ok, field);
    near(r.dims[field], d[field], 0.02, field);
    near(r.volume_l, v, 0.001, `${field} volume`);
  }
  const no = solveWedge(EX, "topDepth", 500);
  assert.equal(no.ok, false);
  if (!no.ok) {
    assert.match(no.message, /not reachable/);
    assert.equal(no.nearest.topDepth, 400);
  }
  assert.equal(solveWedge(EX, "height", 1e6).ok, false);
});

test("driver clearance: hand-worked case at θ = 60°", () => {
  const H = 400, T = 20, D2 = 500;
  const d: WedgeDims = { width: 600, height: H, bottomDepth: D2, topDepth: topDepthForAngle(D2, H, 60), wall: T };
  const m = wedgeDriverClearance(d, "front", { cutout: 120, depth: 150, motorDiameter: 120, xmax: 10 }, 200);
  // Inside face bottom B = (500 − 20·cot60 − 20/sin60, 20) = (465.359, 20); P = B + 200·(−cos60, sin60).
  near(m.center[0], 365.359, 0.001, "P x");
  near(m.center[1], 193.205, 0.001, "P y");
  // Back of the motor P + 150·(−sin60, −cos60); corners ± 60·u.
  near(m.rear[0], 235.455, 0.001, "rear x");
  near(m.rear[1], 118.205, 0.001, "rear y");
  near(m.corners[0][0], 205.455, 0.001, "Q+ x");
  near(m.corners[0][1], 170.167, 0.001, "Q+ y");
  near(m.corners[1][1], 66.244, 0.001, "Q− y");
  // Gap 10 + Xmax 10: the lower corner is 66.244 − (20 + 20) above the limit.
  near(m.margin, 26.244, 0.001, "margin");
  near(m.availableDepth, 346.410, 0.001, "depth to the bottom along the axis");
  assert.equal(m.ok, true);
  assert.equal(m.motorEstimated, false);
  assert.ok(m.best.margin >= m.margin);
  // A deep motor low on the baffle hits the bottom.
  const low = wedgeDriverClearance(d, "front", { cutout: 120, depth: 250, motorDiameter: 120, xmax: 10 }, 80);
  assert.equal(low.ok, false);
  assert.ok(low.best.margin > low.margin);
  // Slope rear: a level axis; the back leans in, so higher is tighter.
  const r = wedgeDriverClearance(d, "rear", { cutout: 120, depth: 150, motorDiameter: 120 }, 180);
  near(r.availableDepth, D2 - T - (Math.tan(Math.PI / 6) * 200 + T / Math.sin(Math.PI / 3)), 1e-9, "rear depth");
  assert.ok(r.best.at <= r.at);
});

test("checks: swap, use box, closed top, shallow and upright slopes, cutout", () => {
  const codes = (d: WedgeDims, o = {}) => wedgeIssues(d, o).map((x) => x.code);
  assert.deepEqual(wedgeIssues({ ...EX, topDepth: 450 }).find((x) => x.code === "slope-reversed")?.action, "swap");
  assert.deepEqual(wedgeIssues({ ...EX, topDepth: 400 }).find((x) => x.code === "no-slope")?.action, "use-box");
  assert.ok(codes({ ...EX, topDepth: 10 }).includes("top-closed"));
  assert.ok(codes({ ...EX, topDepth: topDepthForAngle(400, 380, 68) }).length === 0);
  const g = wedgeGeometry({ ...EX, topDepth: 40 });
  assert.ok(g.insideTopDepth > 0 && g.insideTopDepth < 25);
  assert.ok(codes({ ...EX, topDepth: 40 }).includes("top-shallow"));
  assert.ok(codes({ width: 800, height: 200, topDepth: 100, bottomDepth: 600, wall: 18 }).includes("shallow-slope"));
  assert.ok(codes({ ...EX, topDepth: 395 }).includes("near-upright"));
  assert.ok(codes(EX, { joinery: "miter" }).includes("miter-tilt"));
  assert.ok(!codes(EX, { joinery: "butt" }).includes("miter-tilt"));
  assert.ok(codes(EX, { cutout: 350 }).includes("cutout-too-big"));
  assert.ok(codes(EX, { flange: 420 }).includes("flange-too-big"));
  assert.ok(codes({ ...EX, width: 30 }).includes("too-narrow"));
});

test("wedge shape in the volume calculator: longest run and cut list", () => {
  const shape = { kind: "wedge", width_cm: 80, height_cm: 38, topDepth_cm: 25, bottomDepth_cm: 40 } as const;
  near(grossVolume(shape, 18), 75.5986, 0.0001, "gross");
  near(insideLongest_cm(shape, 18), 76.4, 1e-9, "longest = inside width");
  const c = wedgeCutList({ ...EX, drivers: { count: 1, cutout: 280 } });
  const names = c.panels.map((p) => `${p.qty}× ${p.name}`);
  assert.deepEqual(names, ["2× Sides", "1× Top", "1× Bottom", "1× Back", "1× Baffle (sloped)"]);
  assert.match(c.panels.find((p) => p.name === "Baffle (sloped)")!.note!, /parallelogram/);
  assert.equal(c.panels.find((p) => p.name === "Back")!.note, undefined);
  assert.equal(c.holes[0]!.where, "Baffle (sloped)");
  const m = wedgeCutList({ ...EX, joinery: "miter" });
  assert.ok(m.warnings.some((w) => /saw tilt/.test(w)));
});

test("wedge: inside volumes equal FreeCAD's boolean cuts (fixtures/crosscheck/freecad-wedge.json)", () => {
  // dims = [width, height, top depth, bottom depth, wall, sloped panel] in mm.
  const { cases } = JSON.parse(readFileSync(new URL("./fixtures/crosscheck/freecad-wedge.json", import.meta.url), "utf8")) as {
    cases: Record<string, { dims: [number, number, number, number, number, number]; inside_l: number }>;
  };
  for (const [id, c] of Object.entries(cases)) {
    const [width, height, topDepth, bottomDepth, wall, slopeWall] = c.dims;
    const v = wedgeVolume_l({ width, height, topDepth, bottomDepth, wall, slopeWall });
    assert.ok(Math.abs(v - c.inside_l) < 2e-6, `${id}: ${v} vs FreeCAD ${c.inside_l}`);
  }
});
