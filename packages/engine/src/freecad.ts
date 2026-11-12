/**
 * FreeCAD macro export: a Python script (.FCMacro) that rebuilds the box in FreeCAD, one solid
 * per piece of wood plus the air inside, and checks its own volume against the app's.
 *
 * Panel tables (boxes and car wedges, see panels.ts) come out panel by panel: each side-view
 * polygon becomes a face extruded across the width, with the baffle holes cut as cylinders.
 * Cylinders, spheres and tapered boxes, which have no panel table, come out as FreeCAD
 * primitives (makeCylinder, makeSphere, a ruled loft between two rectangles).
 *
 * Axes: the app's frame (x depth, y height, z width from the left side seen from the front) is
 * left-handed; FreeCAD's is right-handed with Z up. x → X, y → Z, z → Y keeps the box the right
 * way round (not mirrored): seen from the front (+X) the left side is at Y = 0. Lengths in mm,
 * FreeCAD's own unit.
 *
 * The macro raises an error when FreeCAD's volume of the cavity differs from the app's inside
 * volume by more than one part in a million, and likewise for the pieces plus the cavity against
 * the outside: a check of the panel table, independent of the app's own arithmetic.
 */

import type { CutList } from "./cutlist.ts";
import { polygonArea, type BaffleHole, type PanelHole, type PanelInput, type PanelSet } from "./panels.ts";
import { frustumInside, grossVolume, type Shape } from "./volume.ts";
import { wedgeGeometry, type Vec2 } from "./wedge.ts";

export interface FreecadOptions {
  /** Design name: the document's and the box group's label. */
  name?: string;
  /** Extra comment lines for the top of the macro (things left out, …). */
  notes?: string[];
}

/** Relative volume error the macro tolerates before raising. */
export const FREECAD_TOLERANCE = 1e-6;

/** A number as a fixed-decimal Python float literal: no exponent, no locale, no "-0". */
export function pyNum(n: number, decimals = 6): string {
  if (!Number.isFinite(n)) throw new RangeError(`Not a finite number: ${n}`);
  const s = n.toFixed(decimals);
  return /^-0\.?0*$/.test(s) ? s.slice(1) : s;
}

/** A Python string literal for any text: ASCII only, with escapes for quotes, backslashes, control and non-ASCII characters. */
export function pyStr(s: string): string {
  let out = '"';
  for (const ch of s) {
    const c = ch.codePointAt(0)!;
    if (ch === "\\") out += "\\\\";
    else if (ch === '"') out += '\\"';
    else if (ch === "\n") out += "\\n";
    else if (ch === "\r") out += "\\r";
    else if (ch === "\t") out += "\\t";
    else if (c < 0x20 || c === 0x7f) out += "\\x" + c.toString(16).padStart(2, "0");
    else if (c > 0x7e) out += c > 0xffff ? "\\U" + c.toString(16).padStart(8, "0") : "\\u" + c.toString(16).padStart(4, "0");
    else out += ch;
  }
  return out + '"';
}

/** A FreeCAD object name (an identifier) from a panel id. */
export const pyIdent = (s: string) => {
  const id = s.replace(/[^A-Za-z0-9_]/g, "_");
  return /^[0-9]/.test(id) ? "_" + id : id || "_";
};

/** A comment line: printable ASCII only. */
const comment = (s: string) => "# " + s.replace(/[^\x20-\x7e]/g, "?");

const n = (x: number) => pyNum(x);
/** App (x, y, z) → FreeCAD Vector(X = x, Y = z, Z = y). */
const vec = (x: number, y: number, z: number) => `V(${n(x)}, ${n(z)}, ${n(y)})`;

const HEADER = (title: string, opts: FreecadOptions, about: string[]) => [
  "# -*- coding: utf-8 -*-",
  comment(`Speaker Box Genius: ${title}, as a FreeCAD macro.`),
  comment("Run it in FreeCAD (Macro > Macros... > Execute, or freecadcmd this-file.FCMacro)."),
  ...about.map(comment),
  comment("Lengths in mm. The macro checks FreeCAD's volumes against the app's and raises if they differ."),
  ...(opts.notes ?? []).map(comment),
  "",
  "import FreeCAD as App",
  "import Part",
  "",
  "V = App.Vector",
  `NAME = ${pyStr(opts.name?.trim() || "Speaker box")}`,
  `TOL = ${FREECAD_TOLERANCE.toExponential()}`,
  "",
  "",
  "def solid(shape):",
  "    # An extruded face can come out inside-out (negative volume); turn it the right way.",
  "    if shape.Volume < 0:",
  "        shape.reverse()",
  "    return shape",
  "",
  "",
  "def check(what, got, want):",
  "    err = abs(got - want) / want",
  '    print("%s: FreeCAD %.3f L, app %.3f L, relative error %.1e" % (what, got / 1e6, want / 1e6, err))',
  "    if err > TOL:",
  '        raise ValueError("%s volume is off by %.1e (more than %.0e): the model does not match the app" % (what, err, TOL))',
  "",
  "",
  'doc = App.newDocument("SpeakerBox")',
  "doc.Label = NAME",
  'box = doc.addObject("App::DocumentObjectGroup", "Box")',
  "box.Label = NAME",
  "",
  "",
  "def add(name, label, shape, visible=True):",
  '    obj = doc.addObject("Part::Feature", name)',
  "    obj.Label = label",
  "    obj.Shape = shape",
  "    box.addObject(obj)",
  "    if not visible:",
  "        obj.Visibility = False",
  "    return obj",
  "",
];

const FOOTER = [
  "doc.recompute()",
  "if App.GuiUp:",
  "    import FreeCADGui as Gui",
  "    Gui.activeDocument().activeView().viewIsometric()",
  '    Gui.SendMsgToActiveView("ViewFit")',
  "",
];

/** The side-view polygon (x, y) at z0, closed, extruded to z1. */
function prismLines(profile: Vec2[], z0: number, z1: number): string[] {
  const pts = [...profile, profile[0]!].map(([x, y]) => vec(x, y, z0));
  return [`shape = solid(Part.Face(Part.makePolygon([${pts.join(", ")}])).extrude(V(0, ${n(z1 - z0)}, 0)))`];
}

/** A round hole through a panel: from 1 mm outside the outside face, inwards through the thickness and 1 mm more. */
function holeLines(h: PanelHole, thickness: number): string[] {
  const [cx, cy, cz] = h.center;
  const [nx, ny, nz] = h.normal;
  return [
    comment(`${h.kind === "pr" ? "Passive radiator" : h.kind === "port" ? "Port" : "Driver"} hole, diameter ${+h.diameter.toFixed(2)} mm`),
    `shape = shape.cut(Part.makeCylinder(${n(h.diameter / 2)}, ${n(thickness + 2)}, ${vec(cx + nx, cy + ny, cz + nz)}, ${vec(-nx, -ny, -nz)}))`,
  ];
}

/**
 * FreeCAD macro for a panel table: one Part::Feature per piece (named by its id, labelled by
 * its name) with its holes cut, a hidden Cavity solid, all in a group labelled with the design
 * name, and the two volume checks.
 */
export function freecadMacro(set: PanelSet, opts: FreecadOptions = {}): string {
  // A wedge's outside fills less than its bounding rectangle.
  const xs = set.outer.map((q) => q[0]), ys = set.outer.map((q) => q[1]);
  const rectArea = (Math.max(...xs) - Math.min(...xs)) * (Math.max(...ys) - Math.min(...ys));
  const wedge = polygonArea(set.outer) < rectArea * (1 - 1e-9);
  const L: string[] = HEADER(wedge ? "car wedge" : "box", opts, [
    `${set.joinery === "miter" ? "Mitred" : "Butt"} joints${wedge ? `, the ${set.slope === "rear" ? "back" : "front"} slopes` : ""}; the sides cover the whole outside.`,
    "One solid per piece of wood in the group Box, plus the air inside (Cavity, hidden).",
  ]);
  L.push(`EXPECTED_INNER = ${n(set.innerVolume)}  # mm3, the app's inside volume`);
  L.push(`EXPECTED_OUTER = ${n(set.outerVolume)}  # mm3, the app's outside volume`);
  L.push("pieces = 0.0", "");
  for (const p of set.panels) {
    L.push(comment(`${p.id}: ${p.name}, ${+p.thickness.toFixed(2)} mm thick`));
    L.push(...prismLines(p.profile, p.z0, p.z1));
    L.push("pieces += shape.Volume");
    for (const h of p.holes ?? []) L.push(...holeLines(h, p.thickness));
    L.push(`add(${pyStr(pyIdent(p.id))}, ${pyStr(p.name)}, shape)`, "");
  }
  L.push(comment("The air inside"));
  L.push(...prismLines(set.cavity.profile, set.cavity.z0, set.cavity.z1));
  L.push('cavity = add("Cavity", "Cavity (air inside)", shape, visible=False)', "");
  L.push(...FOOTER.slice(0, 1));
  L.push('check("Cavity", cavity.Shape.Volume, EXPECTED_INNER)');
  L.push('check("Pieces + cavity", pieces + cavity.Shape.Volume, EXPECTED_OUTER)');
  L.push(...FOOTER.slice(1));
  return L.join("\n");
}

/** Shapes the macro builds from primitives (no panel table). */
export type PrimitiveShape = Extract<Shape, { kind: "cylinder" | "sphere" | "frustum" }>;

/** Smallest inside or outside size (mm) a primitive may have before the solid is degenerate. */
const MIN = 1e-3;

/**
 * FreeCAD macro for a cylinder (standing on its end), a sphere or a tapered box (centred on the
 * Z axis, depth along X, width along Y): the wall as one solid (a tube and two end caps fitted
 * inside it for a cylinder), the hidden cavity, and the same checks. Throws a RangeError when
 * the inside or outside is empty or closes to a point or an edge.
 */
export function freecadShapeMacro(shape: PrimitiveShape, wall_mm: number, opts: FreecadOptions = {}): string {
  const t = wall_mm;
  const inner = grossVolume(shape, wall_mm) * 1e6;
  const L: string[] = [];
  let outer: number;
  let title: string;
  const body: string[] = [];
  switch (shape.kind) {
    case "cylinder": {
      const R = (shape.diameter_cm * 10) / 2;
      const len = shape.length_cm * 10;
      const cap = shape.capWall_mm ?? t;
      const Ri = R - t;
      if (!(Ri > MIN) || !(len - 2 * cap > MIN)) throw new RangeError("The walls leave no inside.");
      outer = Math.PI * R * R * len;
      title = "cylinder";
      body.push(
        comment("Tube: the full length, end caps fitted inside it"),
        `shape = Part.makeCylinder(${n(R)}, ${n(len)}).cut(Part.makeCylinder(${n(Ri)}, ${n(len)}))`,
        "pieces += shape.Volume",
        'add("tube", "Tube", shape)',
        `shape = Part.makeCylinder(${n(Ri)}, ${n(cap)})`,
        "pieces += shape.Volume",
        'add("cap_bottom", "End cap (bottom)", shape)',
        `shape = Part.makeCylinder(${n(Ri)}, ${n(cap)}, V(0, 0, ${n(len - cap)}))`,
        "pieces += shape.Volume",
        'add("cap_top", "End cap (top)", shape)',
        "",
        comment("The air inside"),
        `shape = Part.makeCylinder(${n(Ri)}, ${n(len - 2 * cap)}, V(0, 0, ${n(cap)}))`,
      );
      break;
    }
    case "sphere": {
      const R = (shape.diameter_cm * 10) / 2;
      const Ri = R - t;
      if (!(Ri > MIN)) throw new RangeError("The walls leave no inside.");
      outer = (4 / 3) * Math.PI * R ** 3;
      title = "sphere";
      body.push(
        `shape = Part.makeSphere(${n(R)}).cut(Part.makeSphere(${n(Ri)}))`,
        "pieces += shape.Volume",
        'add("shell", "Shell", shape)',
        "",
        comment("The air inside"),
        `shape = Part.makeSphere(${n(Ri)})`,
      );
      break;
    }
    case "frustum": {
      const H = shape.height_cm * 10;
      const bw = shape.bottomWidth_cm * 10, bd = shape.bottomDepth_cm * 10;
      const tw = shape.topWidth_cm * 10, td = shape.topDepth_cm * 10;
      if (!(Math.min(H, bw, bd, tw, td) > MIN)) throw new RangeError("The outside closes to a point or an edge.");
      const f = frustumInside(shape, t / 10);
      const w1 = f.w1 * 10, d1 = f.d1 * 10, w2 = f.w2 * 10, d2 = f.d2 * 10, h = f.h * 10, z0 = f.z0 * 10;
      if (!(Math.min(w1, d1, w2, d2, h) > MIN)) throw new RangeError("The inside closes to a point or an edge.");
      outer = (H / 6) * (bw * bd + (bw + tw) * (bd + td) + tw * td);
      title = "tapered box";
      // Rectangle at height z, depth along X, width along Y, centred.
      const rect = (z: number, w: number, d: number) => {
        const p = [vec(-d / 2, z, -w / 2), vec(d / 2, z, -w / 2), vec(d / 2, z, w / 2), vec(-d / 2, z, w / 2)];
        return `Part.makePolygon([${[...p, p[0]].join(", ")}])`;
      };
      body.push(
        "outside = Part.makeLoft([" + rect(0, bw, bd) + ", " + rect(H, tw, td) + "], True, True)",
        "inside = Part.makeLoft([" + rect(z0, w1, d1) + ", " + rect(z0 + h, w2, d2) + "], True, True)",
        "shape = solid(outside).cut(solid(inside))",
        "pieces += shape.Volume",
        'add("shell", "Shell", shape)',
        "",
        comment("The air inside"),
        "shape = solid(inside)",
      );
      break;
    }
  }
  L.push(...HEADER(title, opts, ["The wall as one solid in the group Box, plus the air inside (Cavity, hidden)."]));
  L.push(`EXPECTED_INNER = ${n(inner)}  # mm3, the app's inside volume`);
  L.push(`EXPECTED_OUTER = ${n(outer)}  # mm3, the outside volume`);
  L.push("pieces = 0.0", "");
  L.push(...body);
  L.push('cavity = add("Cavity", "Cavity (air inside)", shape, visible=False)', "");
  L.push(FOOTER[0]!);
  L.push('check("Cavity", cavity.Shape.Volume, EXPECTED_INNER)');
  L.push('check("Wall + cavity", pieces + cavity.Shape.Volume, EXPECTED_OUTER)');
  L.push(...FOOTER.slice(1));
  return L.join("\n");
}

/** A round hole for the baffle. */
export interface MacroHole {
  kind: PanelHole["kind"];
  diameter: number;
}

/**
 * The round holes a cut list puts on the baffle, one per hole, drivers first; and what it
 * leaves out of a model (holes moved to the back or sides, slot openings) in plain words.
 */
export function baffleHolesOf(c: CutList): { holes: MacroHole[]; skipped: string[] } {
  const holes: MacroHole[] = [];
  const skipped: string[] = [];
  for (const h of c.holes) {
    const kind: MacroHole["kind"] = /^passive/i.test(h.name) ? "pr" : /^port/i.test(h.name) ? "port" : "driver";
    if (h.diameter === undefined) skipped.push(`${h.qty} x ${h.name.toLowerCase()} (rectangular): not cut in the model`);
    else if (/^back/i.test(h.where)) skipped.push(`${h.qty} x ${h.name.toLowerCase()}: on the back or sides, not cut in the model`);
    else for (let k = 0; k < h.qty; k++) holes.push({ kind, diameter: h.diameter });
  }
  return { holes, skipped };
}

/**
 * Where the holes go on the baffle: in a line along its longer inside dimension, the first
 * at the top (or the left), with equal gaps between them and to the inside edges. Overlapping
 * when they don't fit (the cut list warns about that).
 */
export function layoutBaffleHoles(p: PanelInput, holes: MacroHole[]): BaffleHole[] {
  if (holes.length === 0) return [];
  const g = wedgeGeometry(p);
  const rear = (p.slope ?? "front") === "rear" && p.topDepth < p.bottomDepth;
  const along = rear ? g.insideHeight : g.insideSlant;
  const across = g.insideWidth;
  const sum = holes.reduce((s, h) => s + h.diameter, 0);
  if (along >= across) {
    const gap = (along - sum) / (holes.length + 1);
    let top = along;
    return holes.map((h) => {
      top -= gap;
      const at = top - h.diameter / 2;
      top -= h.diameter;
      return { kind: h.kind, diameter: h.diameter, at, z: p.width / 2 };
    });
  }
  const gap = (across - sum) / (holes.length + 1);
  let left = p.wall;
  return holes.map((h) => {
    left += gap;
    const z = left + h.diameter / 2;
    left += h.diameter;
    return { kind: h.kind, diameter: h.diameter, at: along / 2, z };
  });
}
