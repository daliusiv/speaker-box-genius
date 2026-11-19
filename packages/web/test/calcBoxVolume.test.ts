import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_STATE, decodeStateAny, encodeStateShort, type AppState } from "../src/state.ts";
import { dimensionsFor, linkedDesign, solveWedgeFor, volumeFor, wedgeToVolume } from "../src/sim.ts";
import { boxVolume, BOX_DEFAULTS, formFromState, formFromVolume, kindOf, SHAPE_IDS, sizeFor, sizingFor, sizingOptions, stateOf, volumeOf, type BoxForm } from "../src/calculators/boxVolumeMath.ts";
import { SHAPE_FIELDS } from "../src/calculators/boxShapes.ts";
import { BOX_VOLUME_QUERY, isEstimate } from "../src/calculators/boxVolume.ts";
import { decodeQuery, encodeQuery } from "../src/calculators/query.ts";
import { EXAMPLES, SHAPED, SHAPED_START } from "../../../site/examples.ts";

/** One form per shape, with every kind of inside part between them. */
const FORMS: BoxForm[] = [
  BOX_DEFAULTS,
  { ...BOX_DEFAULTS, shape: "wedge", w: 80, h: 38, td: 25, bd: 40, lip: 10, sw: 36, pc: 0, np: 2, pd: 0.6, o: 0.5 },
  { ...BOX_DEFAULTS, shape: "cylinder", dia: 36.8, len: 98.5, wall: 6, cap: 38, br: 0, pt: "slot", pw: 20, ph: 4 },
  { ...BOX_DEFAULTS, shape: "sphere", dia: 60, wall: 15, br: 0, pc: 2, pdia: 7.5 },
  { ...BOX_DEFAULTS, shape: "frustum", bw: 50, bd: 50, tw: 30, td: 30, h: 60, n: 2, pc: 0 },
];

test("box volume page: for every shape the net volume is the app's Box card's, to the last digit", () => {
  for (const f of FORMS) {
    const s = stateOf(f);
    const app = volumeFor(s, linkedDesign(s));
    const page = boxVolume(f);
    assert.deepEqual(page.r, app, f.shape);
    assert.ok(page.r.net_l > 0, f.shape);
    // The design follows the box: its volume is the net.
    assert.equal(s.designs[0]!.vb_l, Math.round(app.net_l * 100) / 100, f.shape);
  }
  assert.deepEqual(new Set(FORMS.map((f) => f.shape)), new Set(SHAPE_IDS), "every shape checked");
});

test("box volume page: the mockup's numbers (box, car wedge, Sonotube)", () => {
  const near = (a: number, b: number, tol = 0.005) => assert.ok(Math.abs(a - b) < tol, `${a} vs ${b}`);
  const box = boxVolume(BOX_DEFAULTS);
  near(box.r.gross_l, 108.34);
  near(box.r.net_l, 98.07);
  near(box.parts_l, 10.28);
  assert.equal(box.longest_cm.toFixed(1), "56.4");
  assert.equal(Math.round(box.mode_hz), 304);
  const wedge = boxVolume({ ...BOX_DEFAULTS, shape: "wedge", w: 80, h: 38, td: 25, bd: 40, lip: 10, pc: 0, o: 0.5 });
  near(wedge.r.gross_l, 81.13);
  near(wedge.r.net_l, 75.19);
  assert.equal(wedge.slope_deg!.toFixed(1), "61.8");
  const tube = boxVolume(FORMS[2]!.pt === "slot" ? { ...FORMS[2]!, pt: "round" } : FORMS[2]!);
  near(tube.r.gross_l, 90.48);
  near(tube.r.net_l, 83.45);
  assert.equal(Math.round(tube.mode_hz), 189);
});

test("box volume page: the wedge lip case (40 × 50 cm, 45/30 cm deep, 15 cm lip, 18 mm) is 61.133 L inside, as FreeCAD gives it", () => {
  const f: BoxForm = { ...BOX_DEFAULTS, shape: "wedge", w: 40, h: 50, bd: 45, td: 30, lip: 15, wall: 18, sw: null, n: 1, dd: 0, pc: 0, br: 0, o: 0 };
  assert.ok(Math.abs(boxVolume(f).r.gross_l - 61.133) < 0.001);
  assert.ok(Math.abs(boxVolume(f).r.net_l - 61.133) < 0.001, "nothing inside");
});

test("box volume page: the shaped-cabinets guide's four cabinets come out at 83.5 L, as the app opens them", () => {
  for (const k of ["box", "tube", "sphere", "wedge"] as const) {
    const s = EXAMPLES[`shape-${k}`]!();
    const f = formFromState(s);
    assert.deepEqual(boxVolume(f).r, volumeFor(s, linkedDesign(s)), k);
    assert.ok(Math.abs(boxVolume(f).r.net_l - SHAPED.vb_l) < 0.15, `${k}: ${boxVolume(f).r.net_l}`);
  }
  // Sized here from the guide's starting tube and box, they land on the guide's sizes.
  const tube = formFromState(EXAMPLES["shape-tube"]!());
  assert.equal(sizeFor({ ...tube, len: 100 }, SHAPED.vb_l, "length")!.f.len, 98.5);
  const sb = SHAPED_START.box;
  const golden = sizeFor({ ...tube, shape: "box", w: sb.width_cm!, h: sb.height_cm!, d: sb.depth_cm!, wall: sb.wall_mm!, br: sb.bracing_pct!, cap: null }, SHAPED.vb_l, "golden")!;
  assert.deepEqual([golden.f.w, golden.f.h, golden.f.d], [49.3, 79.7, 30.4]);
});

test("box volume page: Box size for a net volume is the app's Size for a volume", () => {
  for (const f of FORMS) {
    for (const { value } of sizingOptions(f.shape)) {
      const s = stateOf(f);
      const d = linkedDesign(s);
      const page = sizeFor(f, 70, value);
      assert.ok(page, `${f.shape} ${value}`);
      let want: AppState["volume"];
      if (f.shape === "wedge" && value !== "keep") {
        const r = solveWedgeFor(s, d, value as never, 70)!;
        want = wedgeToVolume(s.volume, r.ok ? r.dims : r.nearest);
        assert.equal(page.ok, r.ok);
      } else {
        want = dimensionsFor(s, d, 70, value === "golden" || value === "length" ? value : "keep")!;
        assert.ok(page.ok);
      }
      assert.deepEqual(volumeOf(page.f), { ...volumeOf(formFromVolume(f, want)) }, `${f.shape} ${value}`);
      if (page.ok) assert.ok(Math.abs(page.net_l - 70) < 0.3, `${f.shape} ${value}: ${page.net_l}`);
    }
  }
  // A choice the shape doesn't offer falls back to its default.
  assert.equal(sizingFor("sphere", "golden"), "keep");
  assert.equal(sizingFor("cylinder", "golden"), "length");
  // Nothing can reach it (bracing takes the whole box): no size.
  assert.equal(sizeFor({ ...BOX_DEFAULTS, br: 100 }, 20, "keep"), null);
  assert.equal(sizeFor(BOX_DEFAULTS, 0, "keep"), null);
});

test("box volume page: the net never goes below 0, and says what took the space", () => {
  const walls = boxVolume({ ...BOX_DEFAULTS, w: 3, wall: 18 });
  assert.equal(walls.r.net_l, 0);
  assert.equal(walls.problem, "walls");
  const parts = boxVolume({ ...BOX_DEFAULTS, o: 500 });
  assert.equal(parts.r.net_l, 0);
  assert.equal(parts.problem, "parts");
  assert.equal(boxVolume(BOX_DEFAULTS).problem, null);
});

test("box volume page: the box type follows the parts (ports → ported, PRs → PR box, else sealed)", () => {
  assert.equal(kindOf(BOX_DEFAULTS), "vented");
  assert.equal(kindOf({ ...BOX_DEFAULTS, pc: 0, np: 2 }), "pr");
  assert.equal(kindOf({ ...BOX_DEFAULTS, pc: 0, np: 0 }), "sealed");
  const v = stateOf(BOX_DEFAULTS).designs[0]!;
  assert.ok(v.kind === "vented" && v.diameter_cm === 10 && v.length_cm === 45.5 && v.count === 1 && v.flare_cm === 0);
  const pr = stateOf({ ...BOX_DEFAULTS, pc: 0, np: 2 }, DEFAULT_STATE, { id: "x/y", name: "X Y", params: { mms_g: 100, sd_cm2: 500, xmax_mm: 20, qms: 5, vas_l: 50 } }).designs[0]!;
  assert.ok(pr.kind === "pr" && pr.count === 2 && pr.prName === "X Y" && pr.params.mms_g === 100);
  // With ports and PRs both entered, the ports win and the PRs aren't taken off (as the app's ported box has it).
  const both = boxVolume({ ...BOX_DEFAULTS, np: 2, pd: 1 });
  assert.ok(both.prLeftOut && !both.r.deductions.some((d) => d.label.startsWith("Passive")));
});

test("box volume page: Open in the simulator opens the same net volume, linked to the box", async () => {
  for (const f of FORMS) {
    const s = stateOf(f, { ...DEFAULT_STATE, settings: { ...DEFAULT_STATE.settings, units: "metric" } });
    const opened = (await decodeStateAny(await encodeStateShort(s)))!;
    assert.ok(opened, f.shape);
    const d = linkedDesign(opened);
    assert.equal(d?.id, "d1", `${f.shape}: linked`);
    assert.equal(d?.kind, kindOf(f) === "pr" ? "pr" : kindOf(f));
    assert.ok(Math.abs(volumeFor(opened, d).net_l - boxVolume(f).r.net_l) < 1e-9, `${f.shape}: same net in the app`);
    assert.equal(opened.drivers, Math.max(1, Math.round(f.n)));
  }
});

test("box volume page: every shape's fields round-trip through the link; bad values keep the defaults", () => {
  const ids = Object.values(BOX_VOLUME_QUERY).map((q) => q.id);
  for (const fields of Object.values(SHAPE_FIELDS)) for (const { key } of fields) assert.ok(ids.includes(`bv-${key}`), key);
  assert.equal(new Set(ids).size, ids.length, "one key per field");
  const defaults = Object.fromEntries(Object.keys(BOX_VOLUME_QUERY).map((k) => [k, "1"]));
  const values = { ...defaults, s: "wedge", w: "80", h: "38", td: "25", bd: "40", lip: "10", sw: "36", t: "18", pt: "slot", d: "dayton-audio/rss315hf-4", m: "size", u: "in", r: "lip" };
  const q = encodeQuery(values, defaults, BOX_VOLUME_QUERY);
  assert.deepEqual({ ...defaults, ...decodeQuery(q, BOX_VOLUME_QUERY) }, values);
  assert.deepEqual(decodeQuery("?s=cube&w=abc&n=0&pc=-1&pt=triangle", BOX_VOLUME_QUERY), {}, "all dropped");
  assert.deepEqual(decodeQuery("?pc=0&np=0", BOX_VOLUME_QUERY), { pc: "0", np: "0" }, "no ports or PRs is allowed");
});

test("box volume page: a database displacement is marked as an estimate only when it's the cutout × depth one", () => {
  assert.equal(isEstimate({ displacement_l: 3.01, cutout_mm: 282, depth_mm: 146 }), true);
  assert.equal(isEstimate({ displacement_l: 2.4, cutout_mm: 282, depth_mm: 146 }), false);
  assert.equal(isEstimate({ displacement_l: 2.4 }), false);
  assert.equal(isEstimate({ cutout_mm: 282, depth_mm: 146 }), false);
});
