import type { BoxMesh, MeshPart, PartRole, Vec3 } from "@sbg/engine";

/** Take-apart amount above which the inside (the ghost) is drawn: assembled, the walls hide it. */
export const INSIDE_FROM = 0.02;

/**
 * A small renderer for the 3D take-apart preview, with no 3D library: the mesh is turned and
 * projected orthographically, pieces are put in back-to-front order (painter's algorithm, with
 * separating planes between pieces so touching panels never swap), each piece's front faces
 * are flat-shaded from a light fixed to the viewer and outlined. The result is a list of 2D
 * polygons that a canvas (or an SVG, for tests) fills in order.
 *
 * Render frame: X to the right as seen from the front (the panel table's z), Y up, Z towards
 * the viewer at the front (the panel table's x), centred on the box.
 */

export interface View {
  /** Turn about the vertical (°): 0 looks straight at the front, 90 at the left side. */
  yaw: number;
  /** Tilt (°): 0 level, 90 looking straight down. */
  pitch: number;
  /** 1 = the taken-apart box fits the view. */
  zoom: number;
}

export const PRESETS = {
  front: { yaw: 35, pitch: 22, label: "3/4" },
  side: { yaw: 90, pitch: 0, label: "Side" },
  top: { yaw: 0, pitch: 89, label: "Top" },
} as const;
export type Preset = keyof typeof PRESETS;
export const HOME: View = { yaw: PRESETS.front.yaw, pitch: PRESETS.front.pitch, zoom: 1 };

export const clampView = (v: View): View => ({
  yaw: ((((v.yaw + 180) % 360) + 360) % 360) - 180,
  pitch: Math.max(-60, Math.min(89, v.pitch)),
  zoom: Math.max(0.5, Math.min(4, v.zoom)),
});

interface Face {
  /** Corners, flat x, y, z. */
  v: number[];
  n: Vec3;
  c: Vec3;
  smooth: boolean;
}

interface Part {
  id: string;
  name: string;
  role: PartRole;
  faces: Face[];
  convex: boolean;
  dir: Vec3;
  holes: { kind: string; n: Vec3; v: number[]; c: Vec3 }[];
  /** Distinct corners, for the separating-plane test. */
  corners: Vec3[];
  center: Vec3;
  source: MeshPart;
}

export interface Scene {
  parts: Part[];
  cavity: Part | null;
  /** Fits the taken-apart box. */
  radius: number;
  gap: number;
  /** Separating planes for the last take-apart amount. */
  cache?: { explode: number; planes: Plane[] };
}

/** Piece j lies beyond plane (n, d) of piece i. */
interface Plane {
  i: number;
  j: number;
  n: Vec3;
}

/** Panel table (x depth, y up, z width) → render frame, centred. */
export function prepareScene(mesh: BoxMesh): Scene {
  const mid: Vec3 = [(mesh.min[0] + mesh.max[0]) / 2, (mesh.min[1] + mesh.max[1]) / 2, (mesh.min[2] + mesh.max[2]) / 2];
  const P = (p: Vec3): Vec3 => [p[2] - mid[2], p[1] - mid[1], p[0] - mid[0]];
  const N = (n: Vec3): Vec3 => [n[2], n[1], n[0]];
  const conv = (m: MeshPart): Part => {
    const faces = m.faces.map((f) => {
      const pts = f.v.map(P);
      const c: Vec3 = [0, 0, 0];
      for (const p of pts) for (let k = 0; k < 3; k++) c[k] = c[k]! + p[k]! / pts.length;
      return { v: pts.flat(), n: N(f.n), c, smooth: !!f.smooth };
    });
    const seen = new Map<string, Vec3>();
    for (const f of m.faces) for (const p of f.v) seen.set(p.map((x) => x.toFixed(3)).join(","), P(p));
    const corners = [...seen.values()];
    const center: Vec3 = [0, 0, 0];
    for (const p of corners) for (let k = 0; k < 3; k++) center[k] = center[k]! + p[k]! / corners.length;
    return {
      id: m.id,
      name: m.name,
      role: m.role,
      faces,
      convex: m.convex,
      dir: N(m.explode),
      holes: m.holes.map((h) => ({ kind: h.kind, n: N(h.normal), v: h.outline.map(P).flat(), c: P(h.center) })),
      corners,
      center,
      source: m,
    };
  };
  const parts = mesh.parts.map(conv);
  // The smallest ball round the centre that holds every piece when fully taken apart.
  let radius = 1;
  for (const p of parts) for (const c of p.corners) radius = Math.max(radius, Math.hypot(c[0] + p.dir[0] * mesh.gap, c[1] + p.dir[1] * mesh.gap, c[2] + p.dir[2] * mesh.gap));
  return { parts, cavity: mesh.cavity ? conv(mesh.cavity) : null, radius: radius * 1.04, gap: mesh.gap };
}

const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/** Where piece k is at take-apart amount t (0–1). */
const offsetOf = (p: Part, t: number, gap: number): Vec3 => [p.dir[0] * t * gap, p.dir[1] * t * gap, p.dir[2] * t * gap];

/**
 * For every pair of pieces, a face plane of one with the whole other piece outside it, when
 * there is one (always, for panels that only touch). Depends on the take-apart amount, not on
 * the view, so it is worked out once per slider move.
 */
function planesFor(scene: Scene, t: number): Plane[] {
  if (scene.cache && scene.cache.explode === t) return scene.cache.planes;
  const all = scene.cavity ? [...scene.parts, scene.cavity] : scene.parts;
  const offs = all.map((p) => offsetOf(p, t, scene.gap));
  const eps = 1e-3 * scene.radius;
  const beyond = (i: number, j: number): Vec3 | null => {
    const a = all[i]!, b = all[j]!, oa = offs[i]!, ob = offs[j]!;
    for (const f of a.faces) {
      const d = f.v[0]! * f.n[0] + f.v[1]! * f.n[1] + f.v[2]! * f.n[2] + dot(oa, f.n);
      let ok = true;
      for (const p of b.corners) {
        if (p[0] * f.n[0] + p[1] * f.n[1] + p[2] * f.n[2] + dot(ob, f.n) < d - eps) {
          ok = false;
          break;
        }
      }
      if (ok) return f.n;
    }
    return null;
  };
  const planes: Plane[] = [];
  for (let i = 0; i < all.length; i++) {
    for (let j = i + 1; j < all.length; j++) {
      const n = beyond(i, j);
      if (n) planes.push({ i, j, n });
      else {
        const m = beyond(j, i);
        if (m) planes.push({ i: j, j: i, n: m });
      }
    }
  }
  scene.cache = { explode: t, planes };
  return planes;
}

export interface DrawItem {
  /** Screen points, flat x, y. */
  pts: number[];
  fill: string;
  stroke: string | null;
  /** Index into scene.parts, or −1 for the inside. */
  part: number;
}

type RGB = [number, number, number];
/** Wood-like tones by role, dark enough for the dark theme. */
const TONE: Record<PartRole, RGB> = {
  side: [176, 138, 98],
  top: [190, 152, 108],
  bottom: [150, 116, 82],
  back: [140, 108, 76],
  front: [160, 122, 86],
  baffle: [124, 96, 72],
  cap: [176, 138, 98],
  tube: [150, 140, 124],
  shell: [176, 138, 98],
  cavity: [120, 170, 230],
};
const ACCENT: RGB = [251, 146, 60];
const LIGHT: Vec3 = (() => {
  const l: Vec3 = [-0.35, 0.6, 0.72];
  const k = Math.hypot(...l);
  return [l[0] / k, l[1] / k, l[2] / k];
})();

const rgb = (c: RGB, a = 1) => (a >= 1 ? `rgb(${c.map((x) => Math.round(Math.max(0, Math.min(255, x)))).join(",")})` : `rgba(${c.map((x) => Math.round(Math.max(0, Math.min(255, x)))).join(",")},${a.toFixed(3)})`);
const mix = (a: RGB, b: RGB, k: number): RGB => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
const shade = (c: RGB, k: number): RGB => [c[0] * k, c[1] * k, c[2] * k];

export interface FrameOptions {
  /** Index of the piece to light up. */
  hover?: number;
  /** Show the inside as a ghost when taken apart. */
  ghost?: boolean;
}

/** The polygons to fill, back to front, for one view of the scene in a w × h viewport. */
export function frame(scene: Scene, view: View, t: number, w: number, h: number, opt: FrameOptions = {}): DrawItem[] {
  const cy = Math.cos((view.yaw * Math.PI) / 180), sy = Math.sin((view.yaw * Math.PI) / 180);
  const cp = Math.cos((view.pitch * Math.PI) / 180), sp = Math.sin((view.pitch * Math.PI) / 180);
  const rot = (x: number, y: number, z: number): Vec3 => {
    const x1 = x * cy + z * sy, z1 = -x * sy + z * cy;
    return [x1, y * cp - z1 * sp, y * sp + z1 * cp];
  };
  const s = (view.zoom * Math.min(w, h)) / (2 * scene.radius);
  const ox = w / 2, oy = h / 2;
  const showCavity = !!(opt.ghost && scene.cavity && t > INSIDE_FROM);
  const all = showCavity ? [...scene.parts, scene.cavity!] : scene.parts;
  const offs = all.map((p) => offsetOf(p, t, scene.gap));
  const depth = all.map((p, k) => rot(p.center[0] + offs[k]![0], p.center[1] + offs[k]![1], p.center[2] + offs[k]![2])[2]);

  // Back-to-front order of the pieces: "i before j" from each separating plane, then a
  // topological sort, farthest first among the free ones.
  const before: number[][] = all.map(() => []);
  const indeg = all.map(() => 0);
  for (const pl of planesFor(scene, t)) {
    if (pl.i >= all.length || pl.j >= all.length) continue;
    const nz = rot(pl.n[0], pl.n[1], pl.n[2])[2];
    if (Math.abs(nz) < 1e-9) continue;
    const [a, b] = nz > 0 ? [pl.i, pl.j] : [pl.j, pl.i];
    before[a]!.push(b);
    indeg[b]!++;
  }
  const order: number[] = [];
  const done = all.map(() => false);
  while (order.length < all.length) {
    let pick = -1;
    for (let k = 0; k < all.length; k++) if (!done[k] && indeg[k] === 0 && (pick < 0 || depth[k]! < depth[pick]!)) pick = k;
    if (pick < 0) for (let k = 0; k < all.length; k++) if (!done[k] && (pick < 0 || depth[k]! < depth[pick]!)) pick = k; // a cycle: farthest first
    done[pick] = true;
    order.push(pick);
    for (const b of before[pick]!) indeg[b]!--;
  }

  const out: DrawItem[] = [];
  const project = (v: number[], o: Vec3) => {
    const pts: number[] = [];
    for (let k = 0; k < v.length; k += 3) {
      const r = rot(v[k]! + o[0], v[k + 1]! + o[1], v[k + 2]! + o[2]);
      pts.push(ox + r[0] * s, oy - r[1] * s);
    }
    return pts;
  };
  for (const k of order) {
    const p = all[k]!;
    const o = offs[k]!;
    const cavity = p === scene.cavity;
    const index = cavity ? -1 : k;
    const hot = index >= 0 && index === opt.hover;
    let base = TONE[p.role];
    if (hot) base = mix(base, ACCENT, 0.45);
    const faces: { f: Face; nz: number; n: Vec3; z: number }[] = [];
    for (const f of p.faces) {
      const n = rot(f.n[0], f.n[1], f.n[2]);
      if (n[2] <= 1e-6) continue;
      faces.push({ f, nz: n[2], n, z: p.convex ? 0 : rot(f.c[0] + o[0], f.c[1] + o[1], f.c[2] + o[2])[2] });
    }
    if (!p.convex) faces.sort((a, b) => a.z - b.z);
    for (const { f, n } of faces) {
      const light = 0.42 + 0.58 * Math.max(0, dot(n, LIGHT));
      const c = shade(base, light);
      if (cavity) {
        out.push({ pts: project(f.v, o), fill: rgb(base, 0.16 * t), stroke: null, part: -1 });
        continue;
      }
      // Faceted curves: edges in the face's own colour, to close the seams.
      out.push({ pts: project(f.v, o), fill: rgb(c), stroke: f.smooth ? rgb(c) : hot ? rgb(ACCENT) : rgb(shade(c, 0.45)), part: index });
    }
    for (const hole of p.holes) {
      const nz = rot(hole.n[0], hole.n[1], hole.n[2])[2];
      if (nz < 0.08) continue;
      const rim = project(hole.v, o);
      out.push({ pts: rim, fill: hole.kind === "port" ? "rgb(8,8,10)" : "rgb(24,24,28)", stroke: hot ? rgb(ACCENT) : "rgb(70,70,78)", part: index });
      if (hole.kind !== "port") {
        // The cone (or PR diaphragm): a smaller disc inside the cutout.
        const c = rot(hole.c[0] + o[0], hole.c[1] + o[1], hole.c[2] + o[2]);
        const cx = ox + c[0] * s, cyy = oy - c[1] * s;
        const k2 = hole.kind === "pr" ? 0.8 : 0.62;
        out.push({ pts: rim.map((x, i) => (i % 2 ? cyy + (x - cyy) * k2 : cx + (x - cx) * k2)), fill: hole.kind === "pr" ? "rgb(58,58,64)" : "rgb(40,40,46)", stroke: "rgb(90,90,98)", part: index });
      }
    }
  }
  return out;
}

/** The topmost piece under a screen point (−1: none). */
export function pick(items: DrawItem[], x: number, y: number): number {
  for (let k = items.length - 1; k >= 0; k--) {
    const it = items[k]!;
    if (it.part < 0) continue;
    const p = it.pts;
    let inside = false;
    for (let i = 0, j = p.length - 2; i < p.length; j = i, i += 2) {
      const xi = p[i]!, yi = p[i + 1]!, xj = p[j]!, yj = p[j + 1]!;
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
    if (inside) return it.part;
  }
  return -1;
}

/** The same picture as an SVG document (for tests and checking the drawing without a browser). */
export function svgOf(items: DrawItem[], w: number, h: number, background = "#1a1e26"): string {
  const polys = items.map((it) => {
    const pts = [];
    for (let k = 0; k < it.pts.length; k += 2) pts.push(`${it.pts[k]!.toFixed(1)},${it.pts[k + 1]!.toFixed(1)}`);
    return `<polygon points="${pts.join(" ")}" fill="${it.fill}"${it.stroke ? ` stroke="${it.stroke}" stroke-width="0.8" stroke-linejoin="round"` : ""}/>`;
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><rect width="${w}" height="${h}" fill="${background}"/>${polys.join("")}</svg>`;
}
