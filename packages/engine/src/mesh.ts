/**
 * Meshes for the 3D take-apart preview: every piece of an enclosure as a small closed solid of
 * flat faces, with the direction it moves in when the box is taken apart and its holes drawn as
 * outlines on its outside face. Dependency-free; a renderer only projects, sorts and fills.
 *
 * Frame and units as the panel table (panels.ts): mm, x depth (back → front), y height, z width,
 * origin at the outer bottom-back-left corner of the shape's bounding box. Every face is a flat,
 * convex polygon whose vertices run counter-clockwise seen from outside (its normal `n` points
 * out of the solid), so the divergence theorem gives each part's volume.
 *
 * Curved shapes are faceted with few segments (segmentsFor) so a phone can turn them smoothly;
 * a cylinder's or sphere's volume here is that of the faceted solid, not the round one.
 */

import { polygonArea, type PanelHole, type PanelRole, type PanelSet, type Vec3 } from "./panels.ts";
import { frustumInside } from "./volume.ts";
import type { Vec2 } from "./wedge.ts";

export type PartRole = PanelRole | "cap" | "tube" | "shell" | "cavity";

export interface MeshFace {
  /** Corners, counter-clockwise seen from outside. */
  v: Vec3[];
  /** Unit normal, out of the solid. */
  n: Vec3;
  /** Part of a faceted curved surface (a renderer leaves its edges unlined). */
  smooth?: boolean;
}

export interface MeshHole {
  kind: PanelHole["kind"];
  center: Vec3;
  /** Unit normal out of the box. */
  normal: Vec3;
  diameter: number;
  slot?: { width: number; height: number };
  /** The hole's rim on the outside surface, lifted a hair off it. */
  outline: Vec3[];
}

export interface MeshPart {
  id: string;
  name: string;
  role: PartRole;
  faces: MeshFace[];
  /** A convex solid: none of its faces hides another of its faces. */
  convex: boolean;
  /** Unit direction the part moves in when the box is taken apart (zero: it stays). */
  explode: Vec3;
  holes: MeshHole[];
  /** Thickness square to its faces (mm). */
  thickness?: number;
  /** Rectangle to cut it from, longer side first (mm), for flat pieces. */
  blank?: { a: number; b: number };
  /** Outside diameter (mm) of a round piece; a tube's length. */
  diameter?: number;
  length?: number;
}

export interface BoxMesh {
  parts: MeshPart[];
  /** The air inside, as one more solid (not a piece to cut). */
  cavity: MeshPart | null;
  /** Outside bounds (mm). */
  min: Vec3;
  max: Vec3;
  /** How far (mm) a piece moves at full take-apart. */
  gap: number;
}

/** A hole on a face, placed by its offsets (mm) from the middle of the face: u across, v up. */
export interface HoleSpec {
  kind: PanelHole["kind"];
  diameter: number;
  u?: number;
  v?: number;
  slot?: { width: number; height: number };
  /** Tapered box: the wall it goes in (default the front). */
  on?: TaperWall;
}

/** A tapered box's four walls. */
export type TaperWall = "front" | "back" | "left" | "right";

// ---------------------------------------------------------------------------
// Vectors
// ---------------------------------------------------------------------------

const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul = (a: Vec3, k: number): Vec3 => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const length = (a: Vec3) => Math.hypot(a[0], a[1], a[2]);
const unit = (a: Vec3): Vec3 => {
  const l = length(a);
  return l > 0 ? mul(a, 1 / l) : [0, 0, 0];
};
const mean = (ps: Vec3[]): Vec3 => mul(ps.reduce(add, [0, 0, 0] as Vec3), 1 / ps.length);

/** Newell's normal: its length is twice the polygon's area. */
function newell(v: Vec3[]): Vec3 {
  const n: Vec3 = [0, 0, 0];
  for (let i = 0; i < v.length; i++) {
    const a = v[i]!, b = v[(i + 1) % v.length]!;
    n[0] += (a[1] - b[1]) * (a[2] + b[2]);
    n[1] += (a[2] - b[2]) * (a[0] + b[0]);
    n[2] += (a[0] - b[0]) * (a[1] + b[1]);
  }
  return n;
}

/** Area of a planar polygon (mm²). */
export const faceArea = (f: MeshFace) => length(newell(f.v)) / 2;

/**
 * A face from its corners, turned so its normal agrees with `hint` (a direction out of the
 * solid). Repeated corners (a quad that closes to a triangle at a pole) are dropped; null when
 * nothing is left.
 */
function face(v: Vec3[], hint: Vec3, smooth = false): MeshFace | null {
  const pts: Vec3[] = [];
  for (const p of v) {
    const last = pts[pts.length - 1];
    if (!last || length(sub(p, last)) > 1e-9) pts.push(p);
  }
  while (pts.length > 1 && length(sub(pts[0]!, pts[pts.length - 1]!)) <= 1e-9) pts.pop();
  if (pts.length < 3) return null;
  let n = newell(pts);
  if (length(n) < 1e-9) return null;
  if (dot(n, hint) < 0) {
    pts.reverse();
    n = mul(n, -1);
  }
  return { v: pts, n: unit(n), ...(smooth ? { smooth } : {}) };
}

const keep = (fs: (MeshFace | null)[]): MeshFace[] => fs.filter((f): f is MeshFace => f !== null);

/** Volume enclosed by closed faces (mm³), by the divergence theorem. */
export function meshVolume(faces: MeshFace[]): number {
  let v = 0;
  for (const f of faces) {
    const a = f.v[0]!;
    for (let i = 1; i + 1 < f.v.length; i++) v += dot(a, cross(f.v[i]!, f.v[i + 1]!));
  }
  return v / 6;
}

/** Centre of a part's corners (not its centre of mass; enough to sort and explode by). */
export const partCenter = (p: MeshPart): Vec3 => mean(p.faces.flatMap((f) => f.v));

/** Faces in a mesh, cavity included. */
export const faceCount = (m: BoxMesh) => m.parts.reduce((s, p) => s + p.faces.length, 0) + (m.cavity?.faces.length ?? 0);

/** Segments round a circle of this diameter (mm): 16 to 32, a multiple of 4. */
export const segmentsFor = (diameter: number) => Math.min(32, Math.max(16, 4 * Math.round(diameter / 60)));

/**
 * Offsets (mm, from the middle) to line up holes of these sizes along a run of `room` mm, with
 * `margin` between them: centred as a group, or spread evenly when they don't fit.
 */
export function lineUp(sizes: number[], room: number, margin = 15): number[] {
  const n = sizes.length;
  if (!n) return [];
  const total = sizes.reduce((s, d) => s + d, 0) + (n - 1) * margin;
  if (total > room) return sizes.map((_, k) => ((k + 0.5) / n - 0.5) * room);
  const out: number[] = [];
  let at = -total / 2;
  for (const d of sizes) {
    out.push(at + d / 2);
    at += d + margin;
  }
  return out;
}

/** Whether holes of these sizes line up along `room` mm with `margin` round and between them. */
export const lineFits = (sizes: number[], room: number, margin = 15) => sizes.reduce((s, d) => s + d + margin, margin) <= room;

/**
 * Offsets (mm along the slant, from the middle) for a column of holes on a tapering face: the
 * face is `bottom` mm wide at its lower edge and `top` mm at its upper edge, `slant` mm between
 * them (all inside usable sizes). Each hole needs `margin` round it at the narrower of its two
 * ends. The column is packed from the wide end and then centred as far as the widths allow.
 * Null when they don't fit.
 */
export function taperColumn(sizes: number[], bottom: number, top: number, slant: number, margin = 15): number[] | null {
  if (!sizes.length) return [];
  if (!(slant > 0)) return null;
  const width = (y: number) => bottom + ((top - bottom) * y) / slant;
  const flip = top > bottom; // pack from the wider end
  const room = (a: number, d: number) => Math.min(width(flip ? slant - a : a), width(flip ? slant - a - d : a + d));
  const starts: number[] = [];
  let at = margin;
  for (const d of sizes) {
    starts.push(at);
    at += d + margin;
  }
  if (at > slant) return null;
  const ok = (shift: number) => starts.every((a, k) => room(a + shift, sizes[k]!) >= sizes[k]! + 2 * margin);
  if (!ok(0)) return null;
  // Centre the column if the face is wide enough there, else move it as far up as it goes.
  let lo = 0, hi = (slant - at) / 2;
  if (!ok(hi)) for (let i = 0; i < 30; i++) { const m = (lo + hi) / 2; if (ok(m)) lo = m; else hi = m; }
  else lo = hi;
  return starts.map((a, k) => {
    const c = a + lo + sizes[k]! / 2;
    return (flip ? slant - c : c) - slant / 2;
  });
}

// ---------------------------------------------------------------------------
// Prisms (the panel table's pieces)
// ---------------------------------------------------------------------------

function isConvex(p: Vec2[]): boolean {
  let sign = 0;
  for (let i = 0; i < p.length; i++) {
    const a = p[i]!, b = p[(i + 1) % p.length]!, c = p[(i + 2) % p.length]!;
    const z = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]);
    if (Math.abs(z) < 1e-9) continue;
    if (sign === 0) sign = Math.sign(z);
    else if (Math.sign(z) !== sign) return false;
  }
  return true;
}

/** Triangles (index triples) of a simple counter-clockwise polygon, by ear clipping. */
export function earClip(p: Vec2[]): [number, number, number][] {
  const idx = p.map((_, i) => i);
  const out: [number, number, number][] = [];
  const crossZ = (a: Vec2, b: Vec2, c: Vec2) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  const inside = (q: Vec2, a: Vec2, b: Vec2, c: Vec2) => crossZ(a, b, q) >= 0 && crossZ(b, c, q) >= 0 && crossZ(c, a, q) >= 0;
  let guard = 0;
  while (idx.length > 3 && guard++ < 10000) {
    let cut = false;
    for (let k = 0; k < idx.length; k++) {
      const i0 = idx[(k + idx.length - 1) % idx.length]!, i1 = idx[k]!, i2 = idx[(k + 1) % idx.length]!;
      const a = p[i0]!, b = p[i1]!, c = p[i2]!;
      if (crossZ(a, b, c) <= 1e-12) continue; // reflex or flat
      if (idx.some((j) => j !== i0 && j !== i1 && j !== i2 && inside(p[j]!, a, b, c))) continue;
      out.push([i0, i1, i2]);
      idx.splice(k, 1);
      cut = true;
      break;
    }
    if (!cut) break; // not simple: fan what is left
  }
  for (let k = 1; k + 1 < idx.length; k++) out.push([idx[0]!, idx[k]!, idx[k + 1]!]);
  return out;
}

/** Faces of a side-view profile (x, y) extruded along z from z0 to z1. */
export function prismFaces(profile: Vec2[], z0: number, z1: number): MeshFace[] {
  const p = polygonArea(profile) < 0 ? [...profile].reverse() : profile;
  const at = (q: Vec2, z: number): Vec3 => [q[0], q[1], z];
  const faces: (MeshFace | null)[] = [];
  const caps = isConvex(p) ? [p.map((_, i) => i)] : earClip(p);
  for (const c of caps) {
    faces.push(face(c.map((i) => at(p[i]!, z1)), [0, 0, 1]));
    faces.push(face(c.map((i) => at(p[i]!, z0)), [0, 0, -1]));
  }
  for (let i = 0; i < p.length; i++) {
    const a = p[i]!, b = p[(i + 1) % p.length]!;
    // Outward for a counter-clockwise profile: right of the edge.
    faces.push(face([at(a, z0), at(b, z0), at(b, z1), at(a, z1)], [b[1] - a[1], a[0] - b[0], 0]));
  }
  return keep(faces);
}

/** The face whose outward normal best points away from `from`, weighted by area: the way the part comes off. */
function explodeOf(faces: MeshFace[], center: Vec3, from: Vec3): Vec3 {
  const off = sub(center, from);
  let best: Vec3 = unit(off);
  let score = 1e-9;
  for (const f of faces) {
    const s = faceArea(f) * dot(f.n, off);
    if (s > score) {
      score = s;
      best = f.n;
    }
  }
  return best;
}

function basis(n: Vec3): [Vec3, Vec3] {
  const a: Vec3 = Math.abs(n[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  // e2 runs "up" the face (towards +y where it can), e1 across it.
  const e1 = unit(cross(a, n));
  const e2 = cross(n, e1);
  return [e1, e2];
}

/**
 * A hole's rim on a flat face (or, with `sphere`, on a sphere's surface): round, or a slot's
 * rectangle (width across the face, height up it).
 */
function holeOf(h: { kind: PanelHole["kind"]; diameter: number; slot?: { width: number; height: number } }, center: Vec3, normal: Vec3, sphere?: { c: Vec3; r: number }): MeshHole {
  const [e1, e2] = basis(normal);
  const lift = 0.4;
  const at = (x: number, y: number) => {
    const p = add(center, add(mul(e1, x), mul(e2, y)));
    return sphere ? add(sphere.c, mul(unit(sub(p, sphere.c)), sphere.r + lift)) : add(p, mul(normal, lift));
  };
  const outline: Vec3[] = [];
  if (h.slot) {
    const w = h.slot.width / 2, t = h.slot.height / 2;
    outline.push(at(-w, -t), at(w, -t), at(w, t), at(-w, t));
  } else {
    const N = Math.min(32, Math.max(16, 4 * Math.round(h.diameter / 25)));
    for (let k = 0; k < N; k++) {
      const a = (2 * Math.PI * k) / N;
      outline.push(at((Math.cos(a) * h.diameter) / 2, (Math.sin(a) * h.diameter) / 2));
    }
  }
  return { kind: h.kind, center, normal, diameter: h.diameter, ...(h.slot ? { slot: h.slot } : {}), outline };
}

const tidyBlank = (a: number, b: number) => ({ a: Math.max(a, b), b: Math.min(a, b) });

/** Every panel of a panel table (buildWedgePanels, buildBoxCutPanels) as a solid, plus the inside. */
export function panelSetMesh(set: PanelSet): BoxMesh {
  const W = Math.max(...set.panels.map((p) => p.z1));
  const xs = set.outer.map((p) => p[0]);
  const ys = set.outer.map((p) => p[1]);
  const min: Vec3 = [Math.min(...xs), Math.min(...ys), 0];
  const max: Vec3 = [Math.max(...xs), Math.max(...ys), W];
  const mid = mul(add(min, max), 0.5);
  const parts: MeshPart[] = set.panels.map((p) => {
    const faces = prismFaces(p.profile, p.z0, p.z1);
    const part: MeshPart = {
      id: p.id,
      name: p.name,
      role: p.role,
      faces,
      convex: isConvex(p.profile),
      explode: [0, 0, 0],
      holes: (p.holes ?? []).map((h) => holeOf(h, h.center, h.normal)),
      thickness: p.thickness,
      blank: p.blank,
    };
    part.explode = explodeOf(faces, partCenter(part), mid);
    return part;
  });
  const cavity: MeshPart = {
    id: "cavity",
    name: "Inside (air)",
    role: "cavity",
    faces: prismFaces(set.cavity.profile, set.cavity.z0, set.cavity.z1),
    convex: isConvex(set.cavity.profile),
    explode: [0, 0, 0],
    holes: [],
  };
  return { parts, cavity, min, max, gap: 0.3 * Math.max(...sub(max, min)) };
}

// ---------------------------------------------------------------------------
// Cylinder (a tube with flat end caps)
// ---------------------------------------------------------------------------

/** Faces of a convex polygon in the x–z plane (points as [x, z]) extruded along y. */
function extrudeY(ring: Vec2[], y0: number, y1: number, smoothSides: boolean): MeshFace[] {
  const c = ring.reduce<Vec2>((s, p) => [s[0] + p[0] / ring.length, s[1] + p[1] / ring.length], [0, 0]);
  const at = (p: Vec2, y: number): Vec3 => [p[0], y, p[1]];
  const faces: (MeshFace | null)[] = [face(ring.map((p) => at(p, y1)), [0, 1, 0]), face(ring.map((p) => at(p, y0)), [0, -1, 0])];
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i]!, b = ring[(i + 1) % ring.length]!;
    faces.push(face([at(a, y0), at(b, y0), at(b, y1), at(a, y1)], [(a[0] + b[0]) / 2 - c[0], 0, (a[1] + b[1]) / 2 - c[1]], smoothSides));
  }
  return keep(faces);
}

const circle = (cx: number, cz: number, r: number, n: number): Vec2[] =>
  Array.from({ length: n }, (_, k) => [cx + r * Math.cos((2 * Math.PI * k) / n), cz + r * Math.sin((2 * Math.PI * k) / n)] as Vec2);

/**
 * An upright tube (outside diameter, outside length end cap to end cap, tube wall) with flat
 * end caps of the full outside diameter on both ends (the tube sits between them; the inside is
 * the tube's bore by the length less both caps, as volume.ts has it). Holes go on the top cap,
 * u across (z) and v front-back (x) from its middle. Taken apart, the caps lift off the ends.
 */
export function cylinderMesh(p: { diameter: number; length: number; wall: number; capWall?: number; holes?: HoleSpec[]; segments?: number }): BoxMesh {
  const D = p.diameter, L = p.length, t = p.wall, ct = p.capWall ?? p.wall;
  const R = D / 2, r = R - t;
  if (!(t > 0) || !(r > 0) || !(ct > 0) || !(L > 2 * ct)) throw new RangeError("The walls leave no inside: check the diameter, length and walls.");
  const N = p.segments ?? segmentsFor(D);
  const outer = circle(R, R, R, N);
  const inner = circle(R, R, r, N);
  const y0 = ct, y1 = L - ct;
  const tube: MeshFace[] = [];
  for (let i = 0; i < N; i++) {
    const j = (i + 1) % N;
    const o0 = outer[i]!, o1 = outer[j]!, i0 = inner[i]!, i1 = inner[j]!;
    const radial: Vec3 = [(o0[0] + o1[0]) / 2 - R, 0, (o0[1] + o1[1]) / 2 - R];
    tube.push(
      ...keep([
        face([[o0[0], y0, o0[1]], [o1[0], y0, o1[1]], [o1[0], y1, o1[1]], [o0[0], y1, o0[1]]], radial, true),
        face([[i0[0], y0, i0[1]], [i1[0], y0, i1[1]], [i1[0], y1, i1[1]], [i0[0], y1, i0[1]]], mul(radial, -1), true),
        face([[o0[0], y1, o0[1]], [o1[0], y1, o1[1]], [i1[0], y1, i1[1]], [i0[0], y1, i0[1]]], [0, 1, 0]),
        face([[o0[0], y0, o0[1]], [o1[0], y0, o1[1]], [i1[0], y0, i1[1]], [i0[0], y0, i0[1]]], [0, -1, 0]),
      ]),
    );
  }
  const holes = (p.holes ?? []).map((h) => holeOf(h, [R + (h.v ?? 0), L, R + (h.u ?? 0)], [0, 1, 0]));
  const parts: MeshPart[] = [
    { id: "cap-bottom", name: "End cap (bottom)", role: "cap", faces: extrudeY(outer, 0, ct, true), convex: true, explode: [0, -1, 0], holes: [], thickness: ct, diameter: D },
    { id: "tube", name: "Tube", role: "tube", faces: tube, convex: false, explode: [0, 0, 0], holes: [], thickness: t, diameter: D, length: L - 2 * ct },
    { id: "cap-top", name: "End cap (top)", role: "cap", faces: extrudeY(outer, y1, L, true), convex: true, explode: [0, 1, 0], holes, thickness: ct, diameter: D },
  ];
  const cavity: MeshPart = { id: "cavity", name: "Inside (air)", role: "cavity", faces: extrudeY(inner, y0, y1, true), convex: true, explode: [0, 0, 0], holes: [] };
  return { parts, cavity, min: [0, 0, 0], max: [D, L, D], gap: 0.3 * Math.max(D, L) };
}

// ---------------------------------------------------------------------------
// Sphere (two hemispherical shells)
// ---------------------------------------------------------------------------

/**
 * A sphere (outside diameter, wall) as two hemispherical shells split front and back. Holes go
 * on the front half: u is the distance (mm, round the outside) to the right of the front pole
 * along the equator, v up from it. Taken apart, the halves slide forward and back.
 */
export function sphereMesh(p: { diameter: number; wall: number; holes?: HoleSpec[]; segments?: number }): BoxMesh {
  const R = p.diameter / 2, t = p.wall, r = R - t;
  if (!(t > 0) || !(r > 0)) throw new RangeError("The walls leave no inside: check the diameter and wall.");
  // Fewer round a sphere: it has segments both ways.
  const N = p.segments ?? Math.min(24, segmentsFor(p.diameter));
  const M = Math.max(2, Math.round(N / 4));
  const c: Vec3 = [R, R, R];
  const half = (front: boolean) => {
    const a: Vec3 = front ? [1, 0, 0] : [-1, 0, 0];
    const u: Vec3 = [0, 1, 0];
    const w: Vec3 = front ? [0, 0, 1] : [0, 0, -1];
    const P = (i: number, j: number, rad: number): Vec3 => {
      const th = (i / M) * (Math.PI / 2), ph = (j / N) * 2 * Math.PI;
      return add(c, mul(add(mul(a, Math.cos(th)), mul(add(mul(u, Math.cos(ph)), mul(w, Math.sin(ph))), Math.sin(th))), rad));
    };
    const shell: (MeshFace | null)[] = [];
    const ball: (MeshFace | null)[] = [];
    for (let i = 0; i < M; i++) {
      for (let j = 0; j < N; j++) {
        const o = [P(i, j, R), P(i + 1, j, R), P(i + 1, j + 1, R), P(i, j + 1, R)];
        const n = [P(i, j, r), P(i + 1, j, r), P(i + 1, j + 1, r), P(i, j + 1, r)];
        shell.push(face(o, sub(mean(o), c), true), face(n, sub(c, mean(n)), true));
        ball.push(face(n, sub(mean(n), c), true));
      }
    }
    for (let j = 0; j < N; j++) shell.push(face([P(M, j, R), P(M, j + 1, R), P(M, j + 1, r), P(M, j, r)], mul(a, -1)));
    return { shell: keep(shell), ball: keep(ball) };
  };
  const f = half(true), b = half(false);
  // Holes round the front: u along the equator, v up a meridian.
  const holes = (p.holes ?? []).map((h) => {
    const yaw = (h.u ?? 0) / R, pitch = (h.v ?? 0) / R;
    const n: Vec3 = [Math.cos(pitch) * Math.cos(yaw), Math.sin(pitch), Math.cos(pitch) * Math.sin(yaw)];
    return holeOf(h, add(c, mul(n, R)), n, { c, r: R });
  });
  const parts: MeshPart[] = [
    { id: "half-back", name: "Back half", role: "shell", faces: b.shell, convex: false, explode: [-1, 0, 0], holes: [], thickness: t, diameter: p.diameter },
    { id: "half-front", name: "Front half", role: "shell", faces: f.shell, convex: false, explode: [1, 0, 0], holes, thickness: t, diameter: p.diameter },
  ];
  const cavity: MeshPart = { id: "cavity", name: "Inside (air)", role: "cavity", faces: [...f.ball, ...b.ball], convex: true, explode: [0, 0, 0], holes: [] };
  return { parts, cavity, min: [0, 0, 0], max: [2 * R, 2 * R, 2 * R], gap: 0.3 * 2 * R };
}

// ---------------------------------------------------------------------------
// Tapered box (rectangular truncated pyramid)
// ---------------------------------------------------------------------------

/** Faces of a convex solid between two quads (corners in the same order). */
function hexa(bottom: Vec3[], top: Vec3[]): MeshFace[] {
  const all = [...bottom, ...top];
  const mid = mean(all);
  const quads = [bottom, top, ...bottom.map((_, i) => [bottom[i]!, bottom[(i + 1) % 4]!, top[(i + 1) % 4]!, top[i]!])];
  return keep(quads.map((q) => face(q, sub(mean(q), mid))));
}

/**
 * A tapered box (outside bottom width × depth, top width × depth, height; top centred over the
 * bottom) built from a bottom and a top slab and four walls mitred at the corners, the walls
 * thickness square to their faces, as volume.ts reckons its inside. Holes go on the front wall,
 * u across and v up the slope from its middle. Taken apart, every piece moves out square to
 * its outside face.
 */
export function frustumMesh(p: { bottomWidth: number; bottomDepth: number; topWidth: number; topDepth: number; height: number; wall: number; holes?: HoleSpec[] }): BoxMesh {
  const { bottomWidth: W1, bottomDepth: D1, topWidth: W2, topDepth: D2, height: H, wall: t } = p;
  if (!(t > 0) || !(H > 0) || !(W1 > 0) || !(D1 > 0) || W2 < 0 || D2 < 0) throw new RangeError("Check the tapered box's size and wall.");
  const f = frustumInside({ kind: "frustum", bottomWidth_cm: W1 / 10, bottomDepth_cm: D1 / 10, topWidth_cm: W2 / 10, topDepth_cm: D2 / 10, height_cm: H / 10 }, t / 10);
  if (!(f.h > 0)) throw new RangeError("The walls leave no inside: check the tapered box's size and wall.");
  const y0 = f.z0 * 10, y1 = y0 + f.h * 10;
  const Wm = Math.max(W1, W2), Dm = Math.max(D1, D2);
  const cx = Dm / 2, cz = Wm / 2;
  const rect = (y: number, w: number, d: number): Vec3[] => [
    [cx - d / 2, y, cz - w / 2],
    [cx + d / 2, y, cz - w / 2],
    [cx + d / 2, y, cz + w / 2],
    [cx - d / 2, y, cz + w / 2],
  ];
  const O = (y: number) => rect(y, W1 + ((W2 - W1) * y) / H, D1 + ((D2 - D1) * y) / H);
  const I = (y: number) => {
    const k = (y - y0) / (y1 - y0);
    return rect(y, (f.w1 + (f.w2 - f.w1) * k) * 10, (f.d1 + (f.d2 - f.d1) * k) * 10);
  };
  const Ob = O(y0), Ot = O(y1), Ib = I(y0), It = I(y1);
  const mid: Vec3 = [cx, H / 2, cz];
  // Walls between corners k and k + 1: 0→1 left (z−), 1→2 front (x+), 2→3 right (z+), 3→0 back (x−).
  const walls: [string, string, PanelRole][] = [
    ["wall-left", "Left wall", "side"],
    ["wall-front", "Front wall (baffle)", "baffle"],
    ["wall-right", "Right wall", "side"],
    ["wall-back", "Back wall", "back"],
  ];
  const parts: MeshPart[] = [];
  // A slab is cut to its larger face.
  const slabBlank = (a: Vec3[], b: Vec3[]) => tidyBlank(Math.max(a[1]![0] - a[0]![0], b[1]![0] - b[0]![0]), Math.max(a[3]![2] - a[0]![2], b[3]![2] - b[0]![2]));
  const bottom = hexa(O(0), Ob);
  parts.push({ id: "bottom", name: "Bottom", role: "bottom", faces: bottom, convex: true, explode: [0, -1, 0], holes: [], thickness: y0, blank: slabBlank(O(0), Ob) });
  walls.forEach(([id, name, role], k) => {
    const j = (k + 1) % 4;
    const faces = hexa([Ob[k]!, Ob[j]!, Ib[j]!, Ib[k]!], [Ot[k]!, Ot[j]!, It[j]!, It[k]!]);
    const outside = [Ob[k]!, Ob[j]!, Ot[j]!, Ot[k]!];
    const n = unit(sub(mean(outside), mid));
    const outFace = faces.reduce((b, x) => (dot(x.n, n) > dot(b.n, n) ? x : b));
    const across = Math.max(length(sub(Ob[j]!, Ob[k]!)), length(sub(Ot[j]!, Ot[k]!)));
    const slant = length(sub(mean([Ot[k]!, Ot[j]!]), mean([Ob[k]!, Ob[j]!])));
    const part: MeshPart = { id, name, role, faces, convex: true, explode: outFace.n, holes: [], thickness: t, blank: tidyBlank(across, slant) };
    const mine = (p.holes ?? []).filter((h) => `wall-${h.on ?? "front"}` === id);
    if (mine.length) {
      const c = mean(outside);
      const ua = unit(sub(Ob[j]!, Ob[k]!));
      const va = unit(sub(mean([Ot[k]!, Ot[j]!]), mean([Ob[k]!, Ob[j]!])));
      part.holes = mine.map((h) => holeOf(h, add(c, add(mul(ua, h.u ?? 0), mul(va, h.v ?? 0))), outFace.n));
    }
    parts.push(part);
  });
  const top = hexa(Ot, O(H));
  if (top.length) parts.push({ id: "top", name: "Top", role: "top", faces: top, convex: true, explode: [0, 1, 0], holes: [], thickness: H - y1, blank: slabBlank(Ot, O(H)) });
  const cavity: MeshPart = { id: "cavity", name: "Inside (air)", role: "cavity", faces: hexa(Ib, It), convex: true, explode: [0, 0, 0], holes: [] };
  return { parts, cavity, min: [0, 0, 0], max: [Dm, H, Wm], gap: 0.3 * Math.max(Dm, H, Wm) };
}
