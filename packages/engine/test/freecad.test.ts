import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  baffleHolesOf,
  buildBoxPanels,
  buildWedgePanels,
  freecadMacro,
  freecadShapeMacro,
  grossVolume,
  layoutBaffleHoles,
  pyNum,
  pyStr,
  wedgeCutList,
  type PanelInput,
  type PanelSet,
  type PrimitiveShape,
} from "../src/index.ts";

const EX = { width: 800, height: 380, topDepth: 250, bottomDepth: 400, wall: 18 };
const HOLES = [{ kind: "driver" as const, diameter: 282 }, { kind: "pr" as const, diameter: 282 }];

/** Every panel table the macro covers: wedge (both slopes × both joinery modes, with holes) and a box. */
function sets(): { what: string; set: PanelSet }[] {
  const out: { what: string; set: PanelSet }[] = [];
  for (const slope of ["front", "rear"] as const) {
    for (const joinery of ["butt", "miter"] as const) {
      const p: PanelInput = { ...EX, slope, joinery };
      out.push({ what: `wedge ${slope} ${joinery}`, set: buildWedgePanels({ ...p, holes: layoutBaffleHoles(p, HOLES) }) });
    }
  }
  out.push({ what: "wedge double baffle", set: buildWedgePanels({ ...EX, slopeWall: 36, holes: layoutBaffleHoles({ ...EX, slopeWall: 36 }, HOLES) }) });
  const box = { width: 300, height: 450, depth: 350, wall: 18 };
  out.push({ what: "box", set: buildBoxPanels({ ...box, holes: layoutBaffleHoles({ ...box, topDepth: 350, bottomDepth: 350 }, [HOLES[0]!]) }) });
  out.push({ what: "box mitred, no holes", set: buildBoxPanels({ ...box, joinery: "miter" }) });
  return out;
}

const count = (s: string, needle: string) => s.split(needle).length - 1;

/** The prisms the macro builds, read back from its text: (X, Z) polygon and extrusion along Y. */
function prisms(macro: string): { area: number; length: number; y0: number }[] {
  const out: { area: number; length: number; y0: number }[] = [];
  for (const line of macro.split("\n")) {
    const m = /Part\.makePolygon\(\[(.*)\]\)\)\.extrude\(V\(0, ([-\d.]+), 0\)\)/.exec(line);
    if (!m) continue;
    const pts = [...m[1]!.matchAll(/V\(([-\d.]+), ([-\d.]+), ([-\d.]+)\)/g)].map((v) => [Number(v[1]), Number(v[2]), Number(v[3])] as const);
    assert.deepEqual(pts[0], pts.at(-1), "closed polygon");
    let a = 0;
    for (let k = 0; k + 1 < pts.length; k++) a += pts[k]![0] * pts[k + 1]![2] - pts[k + 1]![0] * pts[k]![2];
    out.push({ area: Math.abs(a / 2), length: Number(m[2]), y0: pts[0]![1] });
  }
  return out;
}

test("freecad: one polygon per panel and the cavity, one cylinder per hole, the app's volumes as literals", () => {
  for (const { what, set } of sets()) {
    const m = freecadMacro(set, { name: "Test" });
    assert.equal(count(m, "Part.makePolygon("), set.panels.length + 1, what);
    const holes = set.panels.reduce((s, p) => s + (p.holes?.length ?? 0), 0);
    assert.equal(count(m, "Part.makeCylinder("), holes, what);
    for (const p of set.panels) assert.ok(m.includes(`add("${p.id.replace(/-/g, "_")}", ${pyStr(p.name)}, shape)`), `${what}: ${p.id}`);
    assert.ok(m.includes(`EXPECTED_INNER = ${pyNum(set.innerVolume)}  #`), what);
    assert.ok(m.includes(`EXPECTED_OUTER = ${pyNum(set.outerVolume)}  #`), what);
    assert.ok(m.includes('cavity = add("Cavity", "Cavity (air inside)", shape, visible=False)'), what);
    assert.ok(m.includes("if App.GuiUp:"), what);
    assert.ok(m.includes("raise ValueError"), what);
    assert.equal(freecadMacro(set, { name: "Test" }), m, `${what}: deterministic`);
    // Numbers: fixed decimals, never an exponent or a comma.
    for (const v of m.matchAll(/V\(([^()]*)\)/g)) for (const x of v[1]!.split(", ")) assert.match(x, /^(0|-?\d+\.\d{6})$/, `${what}: ${x}`);
  }
});

test("freecad: the emitted prisms add up: pieces + cavity = outside, cavity = inside", () => {
  // 6-decimal coordinates: well inside the macro's own 1e-6 tolerance.
  for (const { what, set } of sets()) {
    const ps = prisms(freecadMacro(set));
    assert.equal(ps.length, set.panels.length + 1, what);
    const vols = ps.map((p) => p.area * p.length);
    const cavity = vols.at(-1)!;
    const total = vols.reduce((s, v) => s + v, 0);
    assert.ok(Math.abs(cavity / set.innerVolume - 1) < 1e-8, `${what}: cavity ${cavity} vs ${set.innerVolume}`);
    assert.ok(Math.abs(total / set.outerVolume - 1) < 1e-8, `${what}: total ${total} vs ${set.outerVolume}`);
    // Placed across the width where the panel table says (app z → FreeCAD Y).
    ps.slice(0, -1).forEach((p, k) => assert.equal(p.y0, Number(pyNum(set.panels[k]!.z0)), what));
  }
});

test("freecad: holes start 1 mm outside the outside face and go in through the panel", () => {
  const set = buildWedgePanels({ ...EX, holes: layoutBaffleHoles(EX, HOLES) });
  const baffle = set.panels.find((p) => p.id === "baffle")!;
  const m = freecadMacro(set);
  const cyl = [...m.matchAll(/Part\.makeCylinder\(([-\d.]+), ([-\d.]+), V\(([-\d.]+), ([-\d.]+), ([-\d.]+)\), V\(([-\d.]+), ([-\d.]+), ([-\d.]+)\)\)/g)];
  assert.equal(cyl.length, 2);
  cyl.forEach((c, k) => {
    const h = baffle.holes![k]!;
    assert.equal(Number(c[1]), 141);
    assert.equal(c[2], pyNum(baffle.thickness + 2));
    // base = centre + normal, in FreeCAD order (X, Y, Z) = (x, z, y); direction = −normal.
    assert.ok(Math.abs(Number(c[3]) - (h.center[0] + h.normal[0])) < 1e-6);
    assert.ok(Math.abs(Number(c[4]) - h.center[2]) < 1e-6);
    assert.ok(Math.abs(Number(c[5]) - (h.center[1] + h.normal[1])) < 1e-6);
    assert.ok(Math.abs(Number(c[6]) + h.normal[0]) < 1e-6 && Math.abs(Number(c[8]) + h.normal[1]) < 1e-6);
  });
});

test("freecad: baffle hole layout stays on the baffle, in a line, without overlaps when they fit", () => {
  // Tall front baffle: a column at mid width, the driver above the PR.
  const tall = { width: 300, height: 700, topDepth: 300, bottomDepth: 400, wall: 18 };
  const a = layoutBaffleHoles(tall, HOLES);
  assert.ok(a.every((h) => h.z === 150));
  assert.ok(a[0]!.at! > a[1]!.at!);
  assert.ok(a[0]!.at! - a[1]!.at! >= 282);
  // Wide: a row at mid height.
  const b = layoutBaffleHoles(EX, HOLES);
  assert.ok(b[0]!.z! < b[1]!.z! && b[1]!.z! - b[0]!.z! >= 282);
  assert.ok(b[0]!.z! - 141 > 18 && b[1]!.z! + 141 < 782);
  assert.deepEqual(layoutBaffleHoles(EX, []), []);
});

test("freecad: the cut list's baffle holes, and what the model leaves out", () => {
  const c = wedgeCutList({ ...EX, drivers: { count: 2, cutout: 282 }, ports: { count: 1, length: 200, slot: { width: 60, height: 300 } } });
  const r = baffleHolesOf(c);
  assert.deepEqual(r.holes, [{ kind: "driver", diameter: 282 }, { kind: "driver", diameter: 282 }]);
  assert.equal(r.skipped.length, 1);
  assert.match(r.skipped[0]!, /slot port opening/);
  const p = baffleHolesOf(wedgeCutList({ ...EX, drivers: { count: 1, cutout: 200 }, prs: { count: 1, cutout: 200 }, ports: { count: 1, length: 100, holeDiameter: 80 } }));
  assert.deepEqual(p.holes.map((h) => h.kind), ["driver", "pr", "port"]);
});

const PRIMS: { shape: PrimitiveShape; wall: number; call: string }[] = [
  { shape: { kind: "cylinder", diameter_cm: 30, length_cm: 60 }, wall: 10, call: "Part.makeCylinder(" },
  { shape: { kind: "cylinder", diameter_cm: 30, length_cm: 60, capWall_mm: 25 }, wall: 6, call: "Part.makeCylinder(" },
  { shape: { kind: "sphere", diameter_cm: 30 }, wall: 12, call: "Part.makeSphere(" },
  { shape: { kind: "frustum", bottomWidth_cm: 40, bottomDepth_cm: 30, topWidth_cm: 20, topDepth_cm: 30, height_cm: 50 }, wall: 18, call: "Part.makeLoft(" },
  { shape: { kind: "frustum", bottomWidth_cm: 30, bottomDepth_cm: 30, topWidth_cm: 45, topDepth_cm: 20, height_cm: 40 }, wall: 18, call: "Part.makeLoft(" },
];

test("freecad: cylinder, sphere and tapered box as primitives with the app's inside volume", () => {
  for (const { shape, wall, call } of PRIMS) {
    const m = freecadShapeMacro(shape, wall, { name: "Tube" });
    assert.ok(m.includes(call), shape.kind);
    assert.ok(m.includes(`EXPECTED_INNER = ${pyNum(grossVolume(shape, wall) * 1e6)}  #`), shape.kind);
    assert.ok(m.includes('cavity = add("Cavity"'), shape.kind);
    assert.ok(m.includes("if App.GuiUp:"), shape.kind);
  }
  // Tube + caps + cavity = the outside cylinder: the caps fit inside the tube.
  const m = freecadShapeMacro(PRIMS[1]!.shape, 6);
  assert.match(m, /EXPECTED_OUTER = 42411500\.823462/); // π · 150² · 600
  assert.match(m, /Part\.makeCylinder\(144\.000000, 550\.000000, V\(0, 0, 25\.000000\)\)/);
});

test("freecad: primitives with no inside (or a pointed one) are refused", () => {
  assert.throws(() => freecadShapeMacro({ kind: "sphere", diameter_cm: 2 }, 10), RangeError);
  assert.throws(() => freecadShapeMacro({ kind: "cylinder", diameter_cm: 30, length_cm: 2 }, 10), RangeError);
  assert.throws(() => freecadShapeMacro({ kind: "frustum", bottomWidth_cm: 40, bottomDepth_cm: 40, topWidth_cm: 0, topDepth_cm: 0, height_cm: 40 }, 18), RangeError);
  assert.throws(() => freecadShapeMacro({ kind: "frustum", bottomWidth_cm: 40, bottomDepth_cm: 40, topWidth_cm: 1, topDepth_cm: 1, height_cm: 40 }, 18), RangeError);
});

test("freecad: Python literals: numbers and escaped names", () => {
  assert.equal(pyNum(-0.0000001), "0.000000");
  assert.equal(pyNum(1e21 / 1e15), "1000000.000000");
  assert.equal(pyNum(-2.5), "-2.500000");
  assert.throws(() => pyNum(NaN), RangeError);
  assert.equal(pyStr('a "b" \\ c'), '"a \\"b\\" \\\\ c"');
  assert.equal(pyStr("é\n🎵"), '"\\u00e9\\n\\U0001f3b5"');
});

const python = spawnSync("python3", ["--version"]).status === 0;

test("freecad: the macros are valid Python, and the name comes through intact", { skip: python ? false : "python3 not installed" }, () => {
  const dir = mkdtempSync(join(tmpdir(), "sbg-fcmacro-"));
  try {
    const name = 'Sub "One" \\ ü 🎵\n# not a comment\'';
    const files: string[] = [];
    sets().forEach(({ set }, k) => {
      const f = join(dir, `p${k}.FCMacro`);
      writeFileSync(f, freecadMacro(set, { name, notes: ["note with ü\nand a newline"] }));
      files.push(f);
    });
    PRIMS.forEach(({ shape, wall }, k) => {
      const f = join(dir, `s${k}.FCMacro`);
      writeFileSync(f, freecadShapeMacro(shape, wall, { name }));
      files.push(f);
    });
    const script = [
      "import ast, json, sys",
      "out = []",
      "for f in sys.argv[1:]:",
      "    tree = ast.parse(open(f, encoding='ascii').read())",
      "    names = [n.value.value for n in tree.body if isinstance(n, ast.Assign) and getattr(n.targets[0], 'id', '') == 'NAME']",
      "    out.append(names[0])",
      "print(json.dumps(out))",
    ].join("\n");
    const r = spawnSync("python3", ["-I", "-c", script, ...files], { encoding: "utf8" });
    assert.equal(r.status, 0, r.stderr);
    const names = JSON.parse(r.stdout) as string[];
    assert.equal(names.length, files.length);
    for (const x of names) assert.equal(x, name);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
