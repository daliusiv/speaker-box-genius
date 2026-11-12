import { test } from "node:test";
import assert from "node:assert/strict";
import { cutList } from "@sbg/engine";
import { DEFAULT_STATE, type AppState } from "../src/state.ts";
import { meshForState, partLabel, sceneSummary } from "../src/preview3d.ts";
import { HOME, PRESETS, clampView, frame, pick, prepareScene, svgOf } from "../src/render3d.ts";

const withVolume = (v: Partial<AppState["volume"]>, extra: Partial<AppState> = {}): AppState => ({ ...DEFAULT_STATE, ...extra, volume: { ...DEFAULT_STATE.volume, ...v } });
const shapes: [string, AppState][] = [
  ["box", withVolume({ shape: "box" })],
  ["wedge", withVolume({ shape: "wedge", width_cm: 80, height_cm: 38, depth_cm: 40, topDepth_cm: 25 })],
  ["wedge, sloped back, mitred", withVolume({ shape: "wedge", width_cm: 80, height_cm: 38, depth_cm: 40, topDepth_cm: 25, slope: "rear", joinery: "miter" })],
  ["cylinder", withVolume({ shape: "cylinder", diameter_cm: 32, height_cm: 100, wall_mm: 6, capWall_mm: 38 })],
  ["sphere", withVolume({ shape: "sphere", diameter_cm: 40, wall_mm: 12 })],
  ["tapered", withVolume({ shape: "frustum" })],
];

const bounds = (items: { pts: number[] }[]) => {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const it of items) for (let k = 0; k < it.pts.length; k += 2) {
    x0 = Math.min(x0, it.pts[k]!);
    x1 = Math.max(x1, it.pts[k]!);
    y0 = Math.min(y0, it.pts[k + 1]!);
    y1 = Math.max(y1, it.pts[k + 1]!);
  }
  return { x0, y0, x1, y1 };
};

for (const [name, s] of shapes) {
  test(`3D preview, ${name}: builds, stays in view at every preset when fully apart, with the driver`, () => {
    const mesh = meshForState(s);
    const scene = prepareScene(mesh);
    assert.ok(mesh.parts.some((p) => p.holes.some((h) => h.kind === "driver")), "the driver's cutout is drawn");
    for (const p of Object.values(PRESETS)) {
      for (const t of [0, 1]) {
        const items = frame(scene, { yaw: p.yaw, pitch: p.pitch, zoom: 1 }, t, 400, 300, { ghost: true });
        assert.ok(items.length > 0);
        // Few enough polygons to redraw every frame on a phone.
        assert.ok(items.length < 700, `${items.length} polygons`);
        const b = bounds(items);
        assert.ok(b.x0 >= 0 && b.y0 >= 0 && b.x1 <= 400 && b.y1 <= 300, JSON.stringify(b));
      }
    }
    assert.match(sceneSummary(s.volume.shape, mesh.parts), /^3D view of the .+: \d+ pieces \(.+\), \d+ holes? for drivers and ports\.$/);
  });
}

test("taking apart spreads the picture out steadily", () => {
  const scene = prepareScene(meshForState(shapes[1]![1]));
  let last = 0;
  for (const t of [0, 0.25, 0.5, 0.75, 1]) {
    const b = bounds(frame(scene, HOME, t, 400, 300));
    const area = (b.x1 - b.x0) * (b.y1 - b.y0);
    assert.ok(area > last, `t=${t}`);
    last = area;
  }
});

test("pieces are drawn back to front: from the front, the baffle is on top", () => {
  const mesh = meshForState(shapes[0]![1]);
  const scene = prepareScene(mesh);
  const baffle = mesh.parts.findIndex((p) => p.role === "baffle");
  const back = mesh.parts.findIndex((p) => p.role === "back");
  for (const t of [0, 0.6]) {
    const items = frame(scene, { yaw: 0, pitch: 0, zoom: 1 }, t, 400, 300);
    assert.equal(pick(items, 200, 150), baffle);
    const order = items.map((x) => x.part);
    if (order.includes(back)) assert.ok(order.lastIndexOf(back) < order.indexOf(baffle));
    // From behind, the back.
    assert.equal(pick(frame(scene, { yaw: 180, pitch: 0, zoom: 1 }, t, 400, 300), 200, 150), back);
  }
  // Nothing under a corner of the view.
  assert.equal(pick(frame(scene, HOME, 0, 400, 300), 2, 2), -1);
});

test("hovered piece lights up; the inside shows only when taken apart and asked for", () => {
  const scene = prepareScene(meshForState(shapes[0]![1]));
  const plain = frame(scene, HOME, 0.5, 400, 300);
  const lit = frame(scene, HOME, 0.5, 400, 300, { hover: 5 });
  assert.notDeepEqual(plain.filter((x) => x.part === 5).map((x) => x.fill), lit.filter((x) => x.part === 5).map((x) => x.fill));
  assert.ok(!frame(scene, HOME, 0, 400, 300, { ghost: true }).some((x) => x.part === -1));
  assert.ok(frame(scene, HOME, 0.5, 400, 300, { ghost: true }).some((x) => x.part === -1));
  assert.ok(!plain.some((x) => x.part === -1));
  assert.match(svgOf(plain, 400, 300), /^<svg[^>]*>.*<polygon points=/);
});

test("box: the pieces are the box cut list's, with its sizes in the label", () => {
  const s = shapes[0]![1];
  const v = s.volume;
  const mesh = meshForState(s);
  const cut = cutList({ width: v.width_cm * 10, height: v.height_cm * 10, depth: v.depth_cm * 10, wall: v.wall_mm });
  const side = mesh.parts.find((p) => p.role === "side")!;
  const sides = cut.panels.find((p) => p.name === "Sides")!;
  assert.equal(partLabel(side, (x) => `${Math.round(x)}`), `Side: cut ${sides.a} × ${sides.b}, ${v.wall_mm} thick`);
  const baffle = mesh.parts.find((p) => p.role === "baffle")!;
  assert.match(partLabel(baffle, (x) => `${Math.round(x)}`), /^Front \(baffle\): cut 500 × 400, 18 thick; 1 driver cutout$/);
});

test("the linked design's ports and passive radiators get their holes", () => {
  const ported = withVolume({ shape: "box", link: "d2" });
  const holes = meshForState(ported).parts.flatMap((p) => p.holes.map((h) => h.kind));
  assert.deepEqual(holes.sort(), ["driver", "port"]);
  const slot = { ...ported, designs: ported.designs.map((d) => (d.kind === "vented" ? { ...d, shape: "slot" as const, count: 2 } : d)) };
  const slots = meshForState(slot).parts.flatMap((p) => p.holes).filter((h) => h.kind === "port");
  assert.equal(slots.length, 2);
  assert.ok(slots.every((h) => h.slot && h.outline.length === 4));
  const pr = withVolume({ shape: "wedge", width_cm: 80, height_cm: 38, depth_cm: 40, topDepth_cm: 25, link: "d3" });
  const kinds = meshForState(pr).parts.flatMap((p) => p.holes.map((h) => h.kind));
  assert.deepEqual(kinds.sort(), ["driver", "pr", "pr"]);
  const tube = withVolume({ shape: "cylinder", diameter_cm: 32, height_cm: 100, wall_mm: 6, link: "d3" });
  const cap = meshForState(tube).parts.find((p) => p.id === "cap-top")!;
  assert.equal(cap.holes.length, 3);
  assert.match(partLabel(cap, (x) => `${Math.round(x)}`), /^End cap \(top\): ⌀ 320 disc, 6 thick; 1 driver cutout, 2 passive radiator cutouts$/);
});

test("a shape that can't be built says why; no wall still draws", () => {
  assert.throws(() => meshForState(withVolume({ shape: "box", width_cm: 3 })), RangeError);
  assert.ok(meshForState(withVolume({ shape: "box", wall_mm: 0 })).parts.length === 6);
  assert.ok(meshForState(withVolume({ shape: "sphere", wall_mm: 0 })).parts.length === 2);
});

test("views stay in range", () => {
  assert.deepEqual(clampView({ yaw: 370, pitch: 120, zoom: 10 }), { yaw: 10, pitch: 89, zoom: 4 });
  assert.deepEqual(clampView({ yaw: -190, pitch: -90, zoom: 0.1 }), { yaw: 170, pitch: -60, zoom: 0.5 });
});

test("tapered box: PRs that don't fit with the driver go on the back, none overlap; a misfit is named", () => {
  // From a user's link: 45.6×51.3 cm base, 28.6×34.2 top, 57 high, driver and 2 PRs of 230 mm.
  const s = withVolume({ shape: "frustum", width_cm: 45.6, depth_cm: 51.3, topWidth_cm: 28.6, topDepth_cm: 34.2, height_cm: 57, wall_mm: 18, link: "d3", driverCutout_mm: 230, prCutout_mm: 230 });
  const m = meshForState(s);
  const on = Object.fromEntries(m.parts.filter((p) => p.holes.length).map((p) => [p.id, p.holes.map((h) => h.kind)]));
  assert.deepEqual(on, { "wall-front": ["driver"], "wall-back": ["pr", "pr"] });
  for (const p of m.parts) for (let i = 0; i < p.holes.length; i++) for (let j = i + 1; j < p.holes.length; j++) {
    const a = p.holes[i]!, b = p.holes[j]!;
    assert.ok(Math.hypot(...a.center.map((x, k) => x - b.center[k]!)) >= (a.diameter + b.diameter) / 2 + 15, `${p.id} holes overlap`);
  }
  assert.deepEqual(m.notes, []);
  const small = meshForState({ ...s, volume: { ...s.volume, width_cm: 30, depth_cm: 30, topWidth_cm: 20, topDepth_cm: 20, height_cm: 40 } });
  assert.ok(small.notes.some((n) => /passive radiators don't fit on any wall/.test(n)), small.notes.join(" | "));
});

test("\"Show the inside\" ticked with the box assembled takes it half apart; otherwise the slider stays", async () => {
  const { explodeForInside } = await import("../src/preview3d.ts");
  assert.equal(explodeForInside(true, 0), 0.5);
  assert.equal(explodeForInside(true, 0.8), 0.8);
  assert.equal(explodeForInside(false, 0), 0);
});
