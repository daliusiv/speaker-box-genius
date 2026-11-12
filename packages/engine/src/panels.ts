/**
 * Panel table: every piece of wood in a box as a prism, plus the air inside. The one shared
 * description of how a box is built, for the cut list, CAD export and 3D previews.
 *
 * Coordinate frame (all lengths mm):
 *   x  depth, from the outside of the back towards the front
 *   y  height, from the outside of the bottom up
 *   z  width, from the outside of the left side (seen from the front) to the right
 * Origin at the outer bottom-back-left corner. Every panel is a side-view polygon (x, y),
 * counter-clockwise, extruded along z from z0 to z1. One entry per physical piece.
 *
 * Joinery: the two sides cover the whole outside profile (they "capture" everything); top,
 * bottom, back and baffle are W − 2T wide between them. Butt joints: top and bottom run to the
 * back's outside face, the back fits between them, the sloped baffle sits between top and
 * bottom with its top and bottom edges bevelled at φ (a parallelogram in section). Mitred:
 * every top/bottom/back/baffle joint runs from the outside corner to the inside corner.
 */

import { slopeWallOf, wedgeGeometry, type Vec2, type WedgeDims, type WedgeJoinery, type WedgeSlope } from "./wedge.ts";

export type Vec3 = [number, number, number];

export type PanelRole = "side" | "top" | "bottom" | "back" | "front" | "baffle";

export interface PanelHole {
  kind: "driver" | "port" | "pr";
  /** Centre of the hole on the panel's outside face (mm). */
  center: Vec3;
  /** Unit normal pointing out of the box. */
  normal: Vec3;
  diameter: number;
  /** A rectangular opening (a slot port) instead of a round one: width across the panel, height up it. */
  slot?: { width: number; height: number };
}

/** A cut edge that is not square to the face. */
export interface PanelBevel {
  /** Which edge, by where it is in the box ("front", "top", …). */
  edge: string;
  /** Saw tilt from square (°). */
  angle: number;
  /** Which face is the longer one at this edge. */
  longPoint: "outer" | "inner";
}

export interface SolidPanel {
  id: string;
  name: string;
  role: PanelRole;
  /** Side-view polygon (x = depth, y = height), counter-clockwise (mm). */
  profile: Vec2[];
  axis: "z";
  z0: number;
  z1: number;
  /** Thickness square to the faces (mm). */
  thickness: number;
  /**
   * Rectangle to cut it from, longer side first (mm): the longer of its two faces by its width.
   * A bevelled piece is cut to this and then bevelled; a parallelogram baffle nests as its face.
   */
  blank: { a: number; b: number };
  holes?: PanelHole[];
  bevels?: PanelBevel[];
}

export interface PanelSet {
  panels: SolidPanel[];
  /** The air inside, as a prism like the panels. */
  cavity: { profile: Vec2[]; z0: number; z1: number };
  /** The outside of the box in side view (counter-clockwise). */
  outer: Vec2[];
  /** Outside and inside volumes (mm³). */
  outerVolume: number;
  innerVolume: number;
  slope: WedgeSlope;
  joinery: WedgeJoinery;
}

/** A hole to put on the baffle. */
export interface BaffleHole {
  kind: PanelHole["kind"];
  diameter: number;
  /** Centre, mm along the baffle's inside face from its bottom inside edge (default: the middle). */
  at?: number;
  /** Centre across the width, mm from the outside of the left side (default: the middle). */
  z?: number;
  slot?: PanelHole["slot"];
}

export interface PanelInput extends WedgeDims {
  /** Which panel slopes (default front). Ignored for a box. */
  slope?: WedgeSlope;
  /** Default butt. */
  joinery?: WedgeJoinery;
  holes?: BaffleHole[];
}

/** Signed area of a polygon (mm²): positive when counter-clockwise. */
export function polygonArea(p: Vec2[]): number {
  let a = 0;
  for (let i = 0; i < p.length; i++) {
    const [x0, y0] = p[i]!;
    const [x1, y1] = p[(i + 1) % p.length]!;
    a += x0 * y1 - x1 * y0;
  }
  return a / 2;
}

/** Volume of a panel or the cavity (mm³). */
export const prismVolume = (x: { profile: Vec2[]; z0: number; z1: number }) => polygonArea(x.profile) * (x.z1 - x.z0);

const DEG = 180 / Math.PI;
const sub = (a: Vec2, b: Vec2): Vec2 => [a[0] - b[0], a[1] - b[1]];
const dot = (a: Vec2, b: Vec2) => a[0] * b[0] + a[1] * b[1];
const len = (a: Vec2) => Math.hypot(a[0], a[1]);

/**
 * A top, bottom, back or baffle panel from its outside face edge a0 → a1 (counter-clockwise
 * round the box) and its inside face edge b0 → b1. Bevels come from the end joints a0–b0, a1–b1.
 */
function facePanel(id: string, name: string, role: PanelRole, a0: Vec2, a1: Vec2, b0: Vec2, b1: Vec2, ends: [string, string], z0: number, z1: number): SolidPanel {
  const e = sub(a1, a0);
  const L = len(e);
  const u: Vec2 = [e[0] / L, e[1] / L];
  const n: Vec2 = [-u[1], u[0]]; // inward (left of a counter-clockwise edge)
  const bevels: PanelBevel[] = [];
  for (const [k, a, b, sign] of [[0, a0, b0, 1], [1, a1, b1, -1]] as const) {
    const j = sub(b, a);
    const along = dot(j, u) * sign; // > 0: the inside face is shorter at this end
    const angle = Math.atan2(Math.abs(along), dot(j, n)) * DEG;
    if (angle > 1e-6) bevels.push({ edge: ends[k], angle, longPoint: along > 0 ? "outer" : "inner" });
  }
  const thickness = Math.abs(dot(sub(b0, a0), n));
  const face = Math.max(L, len(sub(b1, b0)));
  const w = z1 - z0;
  return {
    id,
    name,
    role,
    profile: [a0, a1, b1, b0],
    axis: "z",
    z0,
    z1,
    thickness,
    blank: { a: Math.max(face, w), b: Math.min(face, w) },
    ...(bevels.length ? { bevels } : {}),
  };
}

/**
 * Every panel of a single-slope wedge (or, with equal depths, a plain box) and its inside.
 * Throws a RangeError when the walls leave no inside or the top is deeper than the bottom.
 */
export function buildWedgePanels(p: PanelInput): PanelSet {
  const { width: W, height: H, topDepth: D1, bottomDepth: D2, wall: T } = p;
  const Tb = slopeWallOf(p);
  const g = wedgeGeometry(p);
  if (!(W > 2 * T) || !(H > 2 * T)) throw new RangeError("The walls leave no inside: check the width, height and wall.");
  if (D1 > D2) throw new RangeError("The top is deeper than the bottom.");
  if (!(g.insideTopDepth > 0)) throw new RangeError("The inside closes before the top.");
  const slope: WedgeSlope = p.slope ?? "front";
  const joinery: WedgeJoinery = p.joinery ?? "butt";
  const { s, k } = g;
  const zi0 = T, zi1 = W - T;

  // Built with the slope at the front, then mirrored (x → D2 − x) for a sloped back.
  const outerF: Vec2[] = [[0, 0], [D2, 0], [D1, H], [0, H]];
  const innerF: Vec2[] = [[T, T], [D2 - s * T - Tb * k, T], [D1 + s * T - Tb * k, H - T], [T, H - T]];
  type Quad = { id: string; role: PanelRole; a0: Vec2; a1: Vec2; b0: Vec2; b1: Vec2; ends: [string, string] };
  let quads: Quad[];
  if (joinery === "miter") {
    const [o0, o1, o2, o3] = outerF as [Vec2, Vec2, Vec2, Vec2];
    const [i0, i1, i2, i3] = innerF as [Vec2, Vec2, Vec2, Vec2];
    quads = [
      { id: "bottom", role: "bottom", a0: o0, a1: o1, b0: i0, b1: i1, ends: ["back", "front"] },
      { id: "baffle", role: "baffle", a0: o1, a1: o2, b0: i1, b1: i2, ends: ["bottom", "top"] },
      { id: "top", role: "top", a0: o2, a1: o3, b0: i2, b1: i3, ends: ["front", "back"] },
      { id: "back", role: "back", a0: o3, a1: o0, b0: i3, b1: i0, ends: ["top", "bottom"] },
    ];
  } else {
    quads = [
      { id: "bottom", role: "bottom", a0: [0, 0], a1: [D2, 0], b0: [0, T], b1: [D2 - s * T, T], ends: ["back", "front"] },
      { id: "baffle", role: "baffle", a0: [D2 - s * T, T], a1: [D1 + s * T, H - T], b0: [D2 - s * T - Tb * k, T], b1: [D1 + s * T - Tb * k, H - T], ends: ["bottom", "top"] },
      { id: "top", role: "top", a0: [D1, H], a1: [0, H], b0: [D1 + s * T, H - T], b1: [0, H - T], ends: ["front", "back"] },
      { id: "back", role: "back", a0: [0, H - T], a1: [0, T], b0: [T, H - T], b1: [T, T], ends: ["top", "bottom"] },
    ];
  }

  const rear = slope === "rear" && D1 < D2;
  const mx = (v: Vec2): Vec2 => (rear ? [D2 - v[0], v[1]] : v);
  // Mirroring flips the winding; reversing the edge (a1 → a0) restores counter-clockwise.
  const swapEnds = (e: [string, string]): [string, string] => [e[1], e[0]];
  const boxLike = D1 === D2;
  const names: Record<string, [string, PanelRole]> = rear
    ? { baffle: ["Back (sloped)", "back"], back: ["Baffle", "baffle"] }
    : { baffle: [boxLike ? "Baffle" : "Baffle (sloped)", "baffle"], back: ["Back", "back"] };
  const panels: SolidPanel[] = [];
  const outer = rear ? [...outerF].reverse().map(mx) : outerF;
  panels.push(sidePanel("side-left", "Side", outer, 0, T, D2, H));
  panels.push(sidePanel("side-right", "Side", outer, W - T, W, D2, H));
  for (const q of quads) {
    const [name, role] = names[q.id] ?? [q.id === "top" ? "Top" : "Bottom", q.role];
    // In a sloped-back box the old "front"/"back" ends swap places.
    const ends = rear ? (q.ends.map((e) => (e === "front" ? "back" : e === "back" ? "front" : e)) as [string, string]) : q.ends;
    const panel = rear
      ? facePanel(name === "Baffle" ? "baffle" : q.id === "baffle" ? "back" : q.id, name, role, mx(q.a1), mx(q.a0), mx(q.b1), mx(q.b0), swapEnds(ends), zi0, zi1)
      : facePanel(q.id, name, role, q.a0, q.a1, q.b0, q.b1, ends, zi0, zi1);
    panels.push(panel);
  }
  const order = ["side-left", "side-right", "top", "bottom", "back", "baffle"];
  panels.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));

  // Holes on the baffle's outside face.
  const baffle = panels.find((x) => x.role === "baffle")!;
  if (p.holes?.length) {
    const th = g.theta / DEG;
    baffle.holes = p.holes.map((h): PanelHole => {
      const z = h.z ?? W / 2;
      const slot = h.slot ? { slot: h.slot } : {};
      if (rear) {
        const at = h.at ?? g.insideHeight / 2;
        return { kind: h.kind, diameter: h.diameter, center: [D2, T + at, z], normal: [1, 0, 0], ...slot };
      }
      const at = h.at ?? g.insideSlant / 2;
      // Inside face bottom edge, up the slope by `at`, then out through the panel.
      const ix = D2 - s * T - Tb * k - at * Math.cos(th);
      const iy = T + at * Math.sin(th);
      const nx = Math.sin(th), ny = Math.cos(th);
      return { kind: h.kind, diameter: h.diameter, center: [ix + Tb * nx, iy + Tb * ny, z], normal: [nx, ny, 0], ...slot };
    });
  }

  const cavityProfile = rear ? [...innerF].reverse().map(mx) : innerF;
  const cavity = { profile: cavityProfile, z0: zi0, z1: zi1 };
  return {
    panels,
    cavity,
    outer,
    outerVolume: polygonArea(outer) * W,
    innerVolume: prismVolume(cavity),
    slope: rear ? "rear" : "front",
    joinery,
  };
}

function sidePanel(id: string, name: string, outer: Vec2[], z0: number, z1: number, D: number, H: number): SolidPanel {
  return { id, name, role: "side", profile: outer, axis: "z", z0, z1, thickness: z1 - z0, blank: { a: Math.max(D, H), b: Math.min(D, H) } };
}

/** A plain box (outside width × height × depth) as a panel table: the wedge with equal depths. */
export function buildBoxPanels(p: { width: number; height: number; depth: number; wall: number; joinery?: WedgeJoinery; holes?: BaffleHole[] }): PanelSet {
  return buildWedgePanels({ width: p.width, height: p.height, topDepth: p.depth, bottomDepth: p.depth, wall: p.wall, joinery: p.joinery, holes: p.holes });
}

/** A hole in a plain box built as the box cut list says (centre in outside coordinates, mm). */
export interface BoxHole {
  kind: PanelHole["kind"];
  diameter: number;
  /** Which panel (default the baffle). */
  on?: "baffle" | "back";
  /** Centre height from the outside bottom, and across from the outside of the left side (default: the middle). */
  y?: number;
  z?: number;
  slot?: PanelHole["slot"];
}

/**
 * A plain box as the box cut list (cutList) builds it: front (baffle) and back cover the full
 * outside width × height, top and bottom fit between them (full width), the sides fit inside
 * all four. Same frame and table as buildWedgePanels, so the 3D preview shows what the box's
 * build sheet tells you to cut. Throws a RangeError when the walls leave no inside.
 */
export function buildBoxCutPanels(p: { width: number; height: number; depth: number; wall: number; holes?: BoxHole[] }): PanelSet {
  const { width: W, height: H, depth: D, wall: T } = p;
  if (!(W > 2 * T) || !(H > 2 * T) || !(D > 2 * T) || !(T > 0)) throw new RangeError("The walls leave no inside: check the width, height, depth and wall.");
  const rect = (x0: number, y0: number, x1: number, y1: number): Vec2[] => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
  const blank = (x: number, y: number) => ({ a: Math.max(x, y), b: Math.min(x, y) });
  const panels: SolidPanel[] = [
    { id: "side-left", name: "Side", role: "side", profile: rect(T, T, D - T, H - T), axis: "z", z0: 0, z1: T, thickness: T, blank: blank(H - 2 * T, D - 2 * T) },
    { id: "side-right", name: "Side", role: "side", profile: rect(T, T, D - T, H - T), axis: "z", z0: W - T, z1: W, thickness: T, blank: blank(H - 2 * T, D - 2 * T) },
    { id: "top", name: "Top", role: "top", profile: rect(T, H - T, D - T, H), axis: "z", z0: 0, z1: W, thickness: T, blank: blank(W, D - 2 * T) },
    { id: "bottom", name: "Bottom", role: "bottom", profile: rect(T, 0, D - T, T), axis: "z", z0: 0, z1: W, thickness: T, blank: blank(W, D - 2 * T) },
    { id: "back", name: "Back", role: "back", profile: rect(0, 0, T, H), axis: "z", z0: 0, z1: W, thickness: T, blank: blank(W, H) },
    { id: "baffle", name: "Front (baffle)", role: "baffle", profile: rect(D - T, 0, D, H), axis: "z", z0: 0, z1: W, thickness: T, blank: blank(W, H) },
  ];
  for (const h of p.holes ?? []) {
    const back = h.on === "back";
    const panel = panels.find((x) => x.id === (back ? "back" : "baffle"))!;
    (panel.holes ??= []).push({ kind: h.kind, diameter: h.diameter, center: [back ? 0 : D, h.y ?? H / 2, h.z ?? W / 2], normal: [back ? -1 : 1, 0, 0], ...(h.slot ? { slot: h.slot } : {}) });
  }
  const outer = rect(0, 0, D, H);
  const cavity = { profile: rect(T, T, D - T, H - T), z0: T, z1: W - T };
  return { panels, cavity, outer, outerVolume: W * H * D, innerVolume: prismVolume(cavity), slope: "front", joinery: "butt" };
}
