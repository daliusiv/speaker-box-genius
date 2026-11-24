import type { Complex } from "./complex.ts";
import { gauss, spline } from "./edgeDiffraction.ts";

/**
 * On-axis sound of sources on the two big faces of a rigid slab (an open-baffle frame's outline ×
 * its depth), from edge diffraction summed to all orders.
 *
 * The slab is W × H × T: x ∈ [0, W], y ∈ [0, H], z ∈ [−T, 0], front face z = 0, the listener far
 * away on the front axis (+z). Its twelve edges are 90° wedges (wedge index ν = ⅔; Svensson, Fred &
 * Vanderkooy, JASA 106(5), 1999): four round the front face, four round the rear face, four along
 * the corners. An edge point re-radiates what reaches it; edge points light other edges that share a
 * face with theirs (each such hop grazes that face: ½), and so on until the next order is negligible.
 *
 *   F = direct + Σ paths  σ·Π_edges[−ν/4π · β]·Π_hops[½·e^{−jkd}/d]·e^{−jkm}/m·e^{+jk·z_last}·(listener weight)
 *
 * β = Σ_{φ = π ± θS ± θR} sin(νφ)/(cosh νη − cos νφ), θ measured at each edge from one face through
 * the air. The listener lies in the plane of the four side faces: a rear edge sends to it along its
 * side face, on the zone boundary of the front edge ahead (weight ½, and that front edge's boundary
 * terms, sin νφ = 0, drop out); corner edges point at it and send nothing directly.
 *
 * F is against a free point source of the same volume velocity, so a source on the front face alone
 * in an endless wall would give 2. Checked in Python (packages/engine/validation/bem/btm_thick.py)
 * against boundary-element runs of nine thick boards (rms ≤ 0.04 dB to 900 Hz, nothing fitted) and
 * four frames; this port is checked against that script (open-baffle-frame-bem.test.ts).
 */

export interface Slab {
  /** Outline (m). */
  w: number;
  h: number;
  /** Depth (m), front face to rear face. */
  t: number;
}

/** Sources on one face: points (m, on the face) with weights summing to 1, and the face. */
export interface FaceSources {
  face: "front" | "rear";
  x: number[];
  y: number[];
  wt: number[];
}

const FACES = ["F", "R", "L", "Rt", "B", "Tp"] as const;
type Face = (typeof FACES)[number];
const NORMAL: Record<Face, [number, number, number]> = { F: [0, 0, 1], R: [0, 0, -1], L: [-1, 0, 0], Rt: [1, 0, 0], B: [0, -1, 0], Tp: [0, 1, 0] };
const NU = 2 / 3;
const THW = 1.5 * Math.PI;
const TWO_PI = 2 * Math.PI;

interface Edge {
  p0: [number, number, number];
  t: [number, number, number];
  len: number;
  a: [number, number, number];
  nA: [number, number, number];
  faces: [Face, Face];
  corner: boolean;
}

function edges(s: Slab): Edge[] {
  const E: Edge[] = [];
  const add = (p0: [number, number, number], p1: [number, number, number], fA: Face, fB: Face, corner = false) => {
    const d = [p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]];
    const len = Math.hypot(d[0]!, d[1]!, d[2]!);
    const nB = NORMAL[fB];
    E.push({ p0, t: [d[0]! / len, d[1]! / len, d[2]! / len], len, a: [-nB[0], -nB[1], -nB[2]], nA: NORMAL[fA], faces: [fA, fB], corner });
  };
  const { w: W, h: H, t: T } = s;
  const sides: [Face, [number, number], [number, number]][] = [
    ["B", [0, 0], [W, 0]],
    ["Rt", [W, 0], [W, H]],
    ["Tp", [W, H], [0, H]],
    ["L", [0, H], [0, 0]],
  ];
  for (const [f, [x0, y0], [x1, y1]] of sides) {
    add([x0, y0, 0], [x1, y1, 0], f, "F");
    add([x0, y0, -T], [x1, y1, -T], "R", f);
  }
  const corners: [[number, number], Face, Face][] = [
    [[0, 0], "L", "B"],
    [[W, 0], "B", "Rt"],
    [[W, H], "Rt", "Tp"],
    [[0, H], "Tp", "L"],
  ];
  for (const [[x, y], f1, f2] of corners) add([x, y, 0], [x, y, -T], f1, f2, true);
  return E;
}

/** Snap an angle within 1e-9 of a multiple of π/2 onto it. */
function snap(th: number): number {
  const q = Math.round(th / (Math.PI / 2));
  return Math.abs(th - (q * Math.PI) / 2) < 1e-9 ? ((q * Math.PI) / 2) % TWO_PI : th;
}

/** Angle (from face A through the air), distance and along-coordinate of a point from an edge. */
function geom(e: Edge, px: number, py: number, pz: number): { th: number; r: number; c: number } {
  const rx = px - e.p0[0];
  const ry = py - e.p0[1];
  const rz = pz - e.p0[2];
  const c = rx * e.t[0] + ry * e.t[1] + rz * e.t[2];
  const vx = rx - c * e.t[0];
  const vy = ry - c * e.t[1];
  const vz = rz - c * e.t[2];
  const th = Math.atan2(vx * e.nA[0] + vy * e.nA[1] + vz * e.nA[2], vx * e.a[0] + vy * e.a[1] + vz * e.a[2]);
  return { th: snap(((th % TWO_PI) + TWO_PI) % TWO_PI), r: Math.hypot(vx, vy, vz), c };
}

function beta(thS: number, thR: number, chEta: number): number {
  const eta = Math.acosh(Math.max(chEta, 1));
  const C = Math.cosh(NU * eta);
  let b = 0;
  for (const s1 of [1, -1])
    for (const s2 of [1, -1]) {
      const phi = Math.PI + s1 * thS + s2 * thR;
      const sn = Math.sin(NU * phi);
      if (Math.abs(sn) < 1e-12) continue;
      b += sn / (C - Math.cos(NU * phi));
    }
  return b;
}

const faceAngle = (e: Edge, f: Face) => (e.faces[0] === f ? 0 : THW);

interface Kernels {
  n: number;
  d: Float64Array;
  /** ½/d for hops along a shared face, 0 otherwise. */
  invd: Float64Array;
  /** i → j → listener. */
  last: Float64Array;
  /** i → j → l, sparse: for pair q = i·n + j, entries start[q] … start[q + 1] − 1 of (l, value). */
  start: Int32Array;
  lIdx: Int32Array;
  val: Float32Array;
  /** Listener-side phase: z of each node. */
  z: Float64Array;
}

interface SourceKernels {
  ns: number;
  /** Source point → node distance [s][i]. */
  m: Float64Array;
  /** First order s → i → listener. */
  k1: Float64Array;
  /** s → i → j, flattened [s][i][j]. */
  first: Float64Array;
  direct: number;
}

function graded(len: number, n: number) {
  const g = gauss(n);
  const s = new Float64Array(n);
  const w = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const u = g.s[i]!;
    s[i] = u * u * (3 - 2 * u) * len;
    w[i] = g.w[i]! * 6 * u * (1 - u) * len;
  }
  return { s, w };
}

interface Built {
  E: Edge[];
  eid: Int32Array;
  px: Float64Array;
  py: Float64Array;
  pz: Float64Array;
  w: Float64Array;
  K: Kernels;
  fout: Float64Array;
  thRcv: Float64Array;
  wr: Float64Array;
  share: (Face | null)[][];
}

function kernels(s: Slab, h: number): Built {
  const E = edges(s);
  const px: number[] = [];
  const py: number[] = [];
  const pz: number[] = [];
  const ww: number[] = [];
  const ei: number[] = [];
  const hT = Math.min(h, Math.max(s.t, 1e-3) / 2);
  E.forEach((e, k) => {
    const n = Math.max(6, Math.ceil(e.len / (e.corner ? h : hT)));
    const g = graded(e.len, n);
    for (let i = 0; i < n; i++) {
      px.push(e.p0[0] + g.s[i]! * e.t[0]);
      py.push(e.p0[1] + g.s[i]! * e.t[1]);
      pz.push(e.p0[2] + g.s[i]! * e.t[2]);
      ww.push(g.w[i]!);
      ei.push(k);
    }
  });
  const n = px.length;
  const share: (Face | null)[][] = E.map((a, i) => E.map((b, j) => (i === j ? null : (a.faces.find((f) => b.faces.includes(f)) ?? null))));
  const eid = Int32Array.from(ei);
  const d = new Float64Array(n * n);
  const invd = new Float64Array(n * n);
  for (let i = 0; i < n; i++)
    for (let j = 0; j < n; j++) {
      const q = i * n + j;
      d[q] = Math.hypot(px[i]! - px[j]!, py[i]! - py[j]!, pz[i]! - pz[j]!);
      if (share[eid[i]!]![eid[j]!]) invd[q] = 0.5 / d[q]!;
    }
  // Every node seen from every node's edge: angle, distance and along-coordinate [j][p] (edge of j).
  const thE = new Float64Array(n * n);
  const rE = new Float64Array(n * n);
  const cE = new Float64Array(n * n);
  for (let j = 0; j < n; j++) {
    const e = E[eid[j]!]!;
    for (let p = 0; p < n; p++) {
      const g = geom(e, px[p]!, py[p]!, pz[p]!);
      thE[j * n + p] = g.th;
      rE[j * n + p] = g.r;
      cE[j * n + p] = g.c;
    }
  }
  const cSelf = new Float64Array(n);
  for (let i = 0; i < n; i++) cSelf[i] = cE[i * n + i]!;
  // Face angle at edge(j) of the face shared with edge(i) (incoming), and at edge(i) (outgoing).
  const fin = new Float64Array(n * n);
  const fout = new Float64Array(n * n);
  for (let i = 0; i < n; i++)
    for (let j = 0; j < n; j++) {
      const f = share[eid[i]!]![eid[j]!];
      if (!f) continue;
      fin[i * n + j] = faceAngle(E[eid[j]!]!, f);
      fout[i * n + j] = faceAngle(E[eid[i]!]!, f);
    }
  // The listener (+z, far away) from each edge.
  const thRcv = new Float64Array(n);
  const wr = new Float64Array(n);
  for (let j = 0; j < n; j++) {
    const e = E[eid[j]!]!;
    if (e.corner) continue;
    const th = snap(((Math.atan2(e.nA[2], e.a[2]) % TWO_PI) + TWO_PI) % TWO_PI);
    thRcv[j] = th;
    wr[j] = th === 0 || th === THW ? 0.5 : 1;
  }
  const c4 = -NU / (4 * Math.PI);
  const last = new Float64Array(n * n);
  for (let i = 0; i < n; i++)
    for (let j = 0; j < n; j++) {
      const q = i * n + j;
      if (invd[q] === 0 || wr[j] === 0) continue;
      const ch = d[q]! / rE[j * n + i]!;
      last[q] = c4 * beta(fin[q]!, thRcv[j]!, ch) * ww[j]! * wr[j]!;
    }
  // At node j, cosh η = cosh(αᵢ + αₗ) with α = asinh(along-offset / distance) of the previous and next
  // point (since m² = r² + offset²), so each entry is g(αᵢ + αₗ): one exp, with the sines and
  // cosines of β fixed by the two faces.
  const start = new Int32Array(n * n + 1);
  const lIdx: number[] = [];
  const val: number[] = [];
  const sc = new Map<number, Float64Array>();
  const terms = (thS: number, thR: number) => {
    const key = Math.round(thS * 1e6) * 1e7 + Math.round(thR * 1e6);
    let t = sc.get(key);
    if (!t) {
      const v: number[] = [];
      for (const s1 of [1, -1])
        for (const s2 of [1, -1]) {
          const phi = Math.PI + s1 * thS + s2 * thR;
          const sn = Math.sin(NU * phi);
          if (Math.abs(sn) >= 1e-12) v.push(sn, Math.cos(NU * phi));
        }
      t = Float64Array.from(v);
      sc.set(key, t);
    }
    return t;
  };
  const alphaOf = new Float64Array(n * n);
  for (let j = 0; j < n; j++)
    for (let p = 0; p < n; p++) {
      const r = rE[j * n + p]!;
      alphaOf[j * n + p] = r > 0 ? Math.asinh((cSelf[j]! - cE[j * n + p]!) / r) : 0;
    }
  for (let i = 0; i < n; i++)
    for (let j = 0; j < n; j++) {
      const q = i * n + j;
      start[q] = lIdx.length;
      if (invd[q] === 0) continue;
      const ai = alphaOf[j * n + i]!;
      const thS = fin[q]!;
      const wj = c4 * ww[j]!;
      for (let l = 0; l < n; l++) {
        if (invd[j * n + l] === 0) continue;
        const t = terms(thS, fout[j * n + l]!);
        if (t.length === 0) continue;
        const eta = Math.abs(ai + alphaOf[j * n + l]!);
        const e = Math.exp(NU * eta);
        const C = 0.5 * (e + 1 / e);
        let b = 0;
        for (let k = 0; k < t.length; k += 2) b += t[k]! / (C - t[k + 1]!);
        if (b === 0) continue;
        lIdx.push(l);
        val.push(wj * b);
      }
    }
  start[n * n] = lIdx.length;
  return {
    E,
    eid,
    px: Float64Array.from(px),
    py: Float64Array.from(py),
    pz: Float64Array.from(pz),
    w: Float64Array.from(ww),
    K: { n, d, invd, last, start, lIdx: Int32Array.from(lIdx), val: Float32Array.from(val), z: Float64Array.from(pz) },
    fout,
    thRcv,
    wr,
    share,
  };
}

/**
 * The slab's two mirrors (x → W − x, y → H − y) map nodes onto nodes. For sources that the mirrors
 * leave unchanged (a centred mouth or cone) the pair amplitudes repeat: x[g·i, g·j] = x[i, j]. Then
 * only pairs whose second node is an orbit representative are carried (about n/4 of them), which
 * makes each order about 4× cheaper. Exact: the same sums, regrouped.
 */
interface Sym {
  /** Representative nodes. */
  reps: Int32Array;
  /** For pair q = i·n + j: index of the stored pair (g·i, rep of j) in the reduced state [i][r]. */
  pairMap: Int32Array;
  /** Pair (i, j) → its l's that are representatives: CSR with the representative's index. */
  start: Int32Array;
  rIdx: Int32Array;
  val: Float32Array;
}

function symmetry(B: Built, s: Slab): Sym | null {
  const { n } = B.K;
  const key = (x: number, y: number, z: number) => `${Math.round(x * 1e9)},${Math.round(y * 1e9)},${Math.round(z * 1e9)}`;
  const at = new Map<string, number>();
  for (let i = 0; i < n; i++) at.set(key(B.px[i]!, B.py[i]!, B.pz[i]!), i);
  const maps: ((x: number, y: number) => [number, number])[] = [(x, y) => [x, y], (x, y) => [s.w - x, y], (x, y) => [x, s.h - y], (x, y) => [s.w - x, s.h - y]];
  const perm: Int32Array[] = [];
  for (const m of maps) {
    const p = new Int32Array(n);
    for (let i = 0; i < n; i++) {
      const [x, y] = m(B.px[i]!, B.py[i]!);
      const t = at.get(key(x, y, B.pz[i]!));
      if (t === undefined) return null;
      p[i] = t;
    }
    perm.push(p);
  }
  // Orbit representative of each node (its lowest index) and the mirror that takes it there.
  const rep = new Int32Array(n);
  const gTo = new Int32Array(n);
  for (let i = 0; i < n; i++) {
    let best = i;
    let g = 0;
    perm.forEach((p, k) => {
      if (p[i]! < best) [best, g] = [p[i]!, k];
    });
    rep[i] = best;
    gTo[i] = g;
  }
  const repsList: number[] = [];
  const rIndex = new Int32Array(n).fill(-1);
  for (let i = 0; i < n; i++)
    if (rep[i] === i) {
      rIndex[i] = repsList.length;
      repsList.push(i);
    }
  const nr = repsList.length;
  const pairMap = new Int32Array(n * n);
  for (let i = 0; i < n; i++)
    for (let j = 0; j < n; j++) pairMap[i * n + j] = perm[gTo[j]!]![i]! * nr + rIndex[rep[j]!]!;
  // Hop tensor restricted to representative l's.
  const K = B.K;
  const start = new Int32Array(n * n + 1);
  const rIdx: number[] = [];
  const val: number[] = [];
  for (let q = 0; q < n * n; q++) {
    start[q] = rIdx.length;
    for (let e = K.start[q]!; e < K.start[q + 1]!; e++) {
      const r = rIndex[K.lIdx[e]!]!;
      if (r < 0) continue;
      rIdx.push(r);
      val.push(K.val[e]!);
    }
  }
  start[n * n] = rIdx.length;
  return { reps: Int32Array.from(repsList), pairMap, start, rIdx: Int32Array.from(rIdx), val: Float32Array.from(val) };
}

/** Whether both mirrors leave a source set unchanged (points and weights). */
function symmetric(src: FaceSources, s: Slab): boolean {
  const key = (x: number, y: number) => `${Math.round(x * 1e9)},${Math.round(y * 1e9)}`;
  const w = new Map<string, number>();
  src.x.forEach((x, q) => w.set(key(x, src.y[q]!), src.wt[q]!));
  return src.x.every((x, q) => {
    const y = src.y[q]!;
    const v = src.wt[q]!;
    return [key(s.w - x, y), key(x, s.h - y), key(s.w - x, s.h - y)].every((k) => Math.abs((w.get(k) ?? NaN) - v) < 1e-12);
  });
}

/**
 * Source rows. A source point close to an edge lights only a short stretch of it (about its
 * distance wide), much shorter than the edge nodes' spacing: then the first edge's integral is
 * taken over sub-points of the node's own stretch (product integration), with the phase at the
 * amplitude-weighted mean distance. This keeps each face's F → 1 at DC (a free point source).
 */
function sourceKernels(B: Built, s: Slab, src: FaceSources): SourceKernels {
  const { n } = B.K;
  const face: Face = src.face === "front" ? "F" : "R";
  const sz = src.face === "front" ? 0 : -s.t;
  const ns = src.x.length;
  const m = new Float64Array(ns * n);
  const k1 = new Float64Array(ns * n);
  const first = new Float64Array(ns * n * n);
  const c4 = -NU / (4 * Math.PI);
  // Each node's stretch of its edge: from the midpoint with the node before to the one after.
  const lo = new Float64Array(n);
  const hi = new Float64Array(n);
  const along = new Float64Array(n);
  for (let i = 0; i < n; i++) along[i] = geom(B.E[B.eid[i]!]!, B.px[i]!, B.py[i]!, B.pz[i]!).c;
  for (let i = 0; i < n; i++) {
    const e = B.eid[i]!;
    lo[i] = i > 0 && B.eid[i - 1] === e ? (along[i - 1]! + along[i]!) / 2 : 0;
    hi[i] = i + 1 < n && B.eid[i + 1] === e ? (along[i]! + along[i + 1]!) / 2 : B.E[e]!.len;
  }
  const gs = gauss(4);
  for (let q = 0; q < ns; q++) {
    const sx = src.x[q]!;
    const sy = src.y[q]!;
    const ws = src.wt[q]!;
    for (let i = 0; i < n; i++) {
      const e = B.E[B.eid[i]!]!;
      m[q * n + i] = Math.hypot(B.px[i]! - sx, B.py[i]! - sy, B.pz[i]! - sz);
      if (!e.faces.includes(face)) continue;
      const g = geom(e, sx, sy, sz);
      const thS = faceAngle(e, face);
      // Sub-points: 4-point Gauss panels, about one per source distance across the node's stretch.
      const len = hi[i]! - lo[i]!;
      const panels = Math.min(24, Math.max(1, Math.ceil(len / Math.max(g.r, 1e-6))));
      const zs: number[] = [];
      const wz: number[] = [];
      if (panels === 1) {
        zs.push(along[i]!);
        wz.push(B.w[i]!);
      } else
        for (let p = 0; p < panels; p++)
          for (let k = 0; k < 4; k++) {
            zs.push(lo[i]! + ((p + gs.s[k]!) * len) / panels);
            wz.push((gs.w[k]! * B.w[i]!) / panels); // scaled so the stretch carries the node's weight
          }
      let a1 = 0;
      let mw = 0;
      let aw = 0;
      const row = new Float64Array(n);
      for (let t = 0; t < zs.length; t++) {
        const z = zs[t]!;
        const off = z - g.c;
        const ms = Math.hypot(g.r, off);
        const px = e.p0[0] + z * e.t[0];
        const py = e.p0[1] + z * e.t[1];
        const pz = e.p0[2] + z * e.t[2];
        const amp = wz[t]! / ms;
        if (B.wr[i]! > 0) a1 += amp * beta(thS, B.thRcv[i]!, ms / g.r);
        mw += Math.abs(amp) * ms;
        aw += Math.abs(amp);
        for (let j = 0; j < n; j++) {
          if (B.K.invd[i * n + j] === 0) continue;
          const gj = geom(e, B.px[j]!, B.py[j]!, B.pz[j]!);
          const dj = Math.hypot(px - B.px[j]!, py - B.py[j]!, pz - B.pz[j]!);
          const ch = (ms * dj + off * (z - gj.c)) / (g.r * gj.r);
          row[j] = row[j]! + amp * beta(thS, B.fout[i * n + j]!, ch);
        }
      }
      m[q * n + i] = mw / aw;
      k1[q * n + i] = ws * c4 * a1 * B.wr[i]!;
      for (let j = 0; j < n; j++) if (row[j] !== 0) first[(q * n + i) * n + j] = ws * c4 * row[j]!;
    }
  }
  const direct = src.face === "front" ? 2 * src.wt.reduce((a, v) => a + v, 0) : 0;
  return { ns, m, k1, first, direct };
}

/** F at wavenumber k for each face's sources, all orders until every term is below tol (or maxOrder). */
function evaluate(K: Kernels, SS: SourceKernels[], k: number, tol = 1e-7, maxOrder = 200, accelerate = true): Complex[] {
  const { n } = K;
  const nn = n * n;
  const zr = new Float64Array(n);
  const zi = new Float64Array(n);
  for (let j = 0; j < n; j++) {
    zr[j] = Math.cos(k * K.z[j]!);
    zi[j] = Math.sin(k * K.z[j]!);
  }
  // Hop factor i → j: ½·e^{−jk·d}/d; last factor with the listener's phase.
  const tr = new Float64Array(nn);
  const ti = new Float64Array(nn);
  const lr = new Float64Array(nn);
  const li = new Float64Array(nn);
  for (let q = 0; q < nn; q++) {
    if (K.invd[q] === 0) continue;
    const ph = k * K.d[q]!;
    tr[q] = Math.cos(ph) * K.invd[q]!;
    ti[q] = -Math.sin(ph) * K.invd[q]!;
    const j = q % n;
    lr[q] = K.last[q]! * zr[j]!;
    li[q] = K.last[q]! * zi[j]!;
  }
  const ns = SS.length;
  const out: Complex[] = [];
  // Amplitudes per source set, interleaved [pair][set][re, im].
  let x = new Float64Array(nn * ns * 2);
  let y = new Float64Array(nn * ns * 2);
  SS.forEach((S, si) => {
    let re = S.direct;
    let im = 0;
    for (let q = 0; q < S.ns; q++)
      for (let i = 0; i < n; i++) {
        const qi = q * n + i;
        const ph = k * S.m[qi]!;
        const er = Math.cos(ph);
        const ei = -Math.sin(ph);
        const a = S.k1[qi]!;
        if (a !== 0) {
          re += a * (er * zr[i]! - ei * zi[i]!);
          im += a * (er * zi[i]! + ei * zr[i]!);
        }
        const base = qi * n;
        for (let j = 0; j < n; j++) {
          const f = S.first[base + j]!;
          if (f === 0) continue;
          const o = ((i * n + j) * ns + si) * 2;
          x[o] = x[o]! + f * er;
          x[o + 1] = x[o + 1]! + f * ei;
        }
      }
    out.push({ re, im });
  });
  const hop = (a: Float64Array) => {
    for (let q = 0; q < nn; q++) {
      const cr = tr[q]!;
      const ci = ti[q]!;
      if (cr === 0 && ci === 0) continue;
      for (let si = 0; si < ns; si++) {
        const o = (q * ns + si) * 2;
        const ar = a[o]!;
        const ai = a[o + 1]!;
        a[o] = ar * cr - ai * ci;
        a[o + 1] = ar * ci + ai * cr;
      }
    }
  };
  hop(x);
  const sr = new Float64Array(ns);
  const sim = new Float64Array(ns);
  // Partial sums per source set, accelerated with Wynn's epsilon algorithm (the series alternates
  // and converges slowly in the bass; its partial sums are close to a few geometric modes).
  const sums: Complex[][] = SS.map(() => []);
  const est: (Complex | null)[] = SS.map(() => null);
  for (let order = 2; ; order++) {
    sr.fill(0);
    sim.fill(0);
    for (let q = 0; q < nn; q++) {
      const a = lr[q]!;
      const b = li[q]!;
      if (a === 0 && b === 0) continue;
      for (let si = 0; si < ns; si++) {
        const o = (q * ns + si) * 2;
        sr[si] = sr[si]! + x[o]! * a - x[o + 1]! * b;
        sim[si] = sim[si]! + x[o]! * b + x[o + 1]! * a;
      }
    }
    let big = 0;
    let moved = 0;
    for (let si = 0; si < ns; si++) {
      out[si]!.re += sr[si]!;
      out[si]!.im += sim[si]!;
      big = Math.max(big, Math.hypot(sr[si]!, sim[si]!));
      if (accelerate) {
        sums[si]!.push({ ...out[si]! });
        const e = wynn(sums[si]!);
        const prev = est[si];
        moved = Math.max(moved, prev ? Math.hypot(e.re - prev.re, e.im - prev.im) : Infinity);
        est[si] = e;
      }
    }
    if (order >= maxOrder || big < tol) break;
    if (accelerate && order >= 6 && moved < tol) {
      est.forEach((e, si) => (out[si] = e!));
      break;
    }
    y.fill(0);
    for (let i = 0; i < n; i++)
      for (let j = 0; j < n; j++) {
        const q = i * n + j;
        const s0 = K.start[q]!;
        const s1 = K.start[q + 1]!;
        if (s0 === s1) continue;
        for (let si = 0; si < ns; si++) {
          const o = (q * ns + si) * 2;
          const ar = x[o]!;
          const ai = x[o + 1]!;
          if (ar === 0 && ai === 0) continue;
          for (let e = s0; e < s1; e++) {
            const b = K.val[e]!;
            const t = ((j * n + K.lIdx[e]!) * ns + si) * 2;
            y[t] = y[t]! + ar * b;
            y[t + 1] = y[t + 1]! + ai * b;
          }
        }
      }
    hop(y);
    [x, y] = [y, x];
  }
  return out;
}

/** As evaluate, for source sets the mirrors leave unchanged (see Sym). */
function evaluateSym(K: Kernels, Y: Sym, SS: SourceKernels[], k: number, tol = 1e-7, maxOrder = 200): Complex[] {
  const { n } = K;
  const nn = n * n;
  const nr = Y.reps.length;
  const nred = n * nr;
  const zr = new Float64Array(n);
  const zi = new Float64Array(n);
  for (let j = 0; j < n; j++) {
    zr[j] = Math.cos(k * K.z[j]!);
    zi[j] = Math.sin(k * K.z[j]!);
  }
  // Hop factor on the stored pairs (i, rep r) and the last factor on every pair.
  const tr = new Float64Array(nred);
  const ti = new Float64Array(nred);
  for (let i = 0; i < n; i++)
    for (let r = 0; r < nr; r++) {
      const q = i * n + Y.reps[r]!;
      if (K.invd[q] === 0) continue;
      const ph = k * K.d[q]!;
      tr[i * nr + r] = Math.cos(ph) * K.invd[q]!;
      ti[i * nr + r] = -Math.sin(ph) * K.invd[q]!;
    }
  const lr = new Float64Array(nn);
  const li = new Float64Array(nn);
  for (let q = 0; q < nn; q++) {
    if (K.last[q] === 0) continue;
    const j = q % n;
    lr[q] = K.last[q]! * zr[j]!;
    li[q] = K.last[q]! * zi[j]!;
  }
  const ns = SS.length;
  const out: Complex[] = [];
  let x = new Float64Array(nred * ns * 2);
  let y = new Float64Array(nred * ns * 2);
  SS.forEach((S, si) => {
    let re = S.direct;
    let im = 0;
    for (let q = 0; q < S.ns; q++)
      for (let i = 0; i < n; i++) {
        const qi = q * n + i;
        const ph = k * S.m[qi]!;
        const er = Math.cos(ph);
        const ei = -Math.sin(ph);
        const a = S.k1[qi]!;
        if (a !== 0) {
          re += a * (er * zr[i]! - ei * zi[i]!);
          im += a * (er * zi[i]! + ei * zr[i]!);
        }
        const base = qi * n;
        for (let r = 0; r < nr; r++) {
          const f = S.first[base + Y.reps[r]!]!;
          if (f === 0) continue;
          const o = ((i * nr + r) * ns + si) * 2;
          x[o] = x[o]! + f * er;
          x[o + 1] = x[o + 1]! + f * ei;
        }
      }
    out.push({ re, im });
  });
  const hop = (a: Float64Array) => {
    for (let p = 0; p < nred; p++) {
      const cr = tr[p]!;
      const ci = ti[p]!;
      for (let si = 0; si < ns; si++) {
        const o = (p * ns + si) * 2;
        const ar = a[o]!;
        const ai = a[o + 1]!;
        a[o] = ar * cr - ai * ci;
        a[o + 1] = ar * ci + ai * cr;
      }
    }
  };
  hop(x);
  const sr = new Float64Array(ns);
  const sim = new Float64Array(ns);
  const sums: Complex[][] = SS.map(() => []);
  const est: (Complex | null)[] = SS.map(() => null);
  for (let order = 2; ; order++) {
    sr.fill(0);
    sim.fill(0);
    for (let q = 0; q < nn; q++) {
      const a = lr[q]!;
      const b = li[q]!;
      if (a === 0 && b === 0) continue;
      const p = Y.pairMap[q]!;
      for (let si = 0; si < ns; si++) {
        const o = (p * ns + si) * 2;
        sr[si] = sr[si]! + x[o]! * a - x[o + 1]! * b;
        sim[si] = sim[si]! + x[o]! * b + x[o + 1]! * a;
      }
    }
    let big = 0;
    let moved = 0;
    for (let si = 0; si < ns; si++) {
      out[si]!.re += sr[si]!;
      out[si]!.im += sim[si]!;
      big = Math.max(big, Math.hypot(sr[si]!, sim[si]!));
      sums[si]!.push({ ...out[si]! });
      const e = wynn(sums[si]!);
      const prev = est[si];
      moved = Math.max(moved, prev ? Math.hypot(e.re - prev.re, e.im - prev.im) : Infinity);
      est[si] = e;
    }
    if (order >= maxOrder || big < tol) break;
    if (order >= 6 && moved < tol) {
      est.forEach((e, si) => (out[si] = e!));
      break;
    }
    // y[j, r] = Σᵢ x[i, j]·mid[i, j, rep r]; x[i, j] is the stored (g·i, rep of j).
    y.fill(0);
    for (let i = 0; i < n; i++)
      for (let j = 0; j < n; j++) {
        const q = i * n + j;
        const s0 = Y.start[q]!;
        const s1 = Y.start[q + 1]!;
        if (s0 === s1) continue;
        const p = Y.pairMap[q]!;
        for (let si = 0; si < ns; si++) {
          const o = (p * ns + si) * 2;
          const ar = x[o]!;
          const ai = x[o + 1]!;
          if (ar === 0 && ai === 0) continue;
          for (let e = s0; e < s1; e++) {
            const b = Y.val[e]!;
            const t = ((j * nr + Y.rIdx[e]!) * ns + si) * 2;
            y[t] = y[t]! + ar * b;
            y[t + 1] = y[t + 1]! + ai * b;
          }
        }
      }
    hop(y);
    [x, y] = [y, x];
  }
  return out;
}

/** Wynn's epsilon algorithm: the best even-column estimate of a sequence's limit. */
function wynn(S: Complex[]): Complex {
  const n = S.length;
  if (n < 3) return S[n - 1]!;
  let prev: Complex[] = S.map(() => ({ re: 0, im: 0 }));
  let cur: Complex[] = S.slice();
  let best = S[n - 1]!;
  for (let k = 1; cur.length > 1; k++) {
    const next: Complex[] = [];
    for (let i = 0; i + 1 < cur.length; i++) {
      const dr = cur[i + 1]!.re - cur[i]!.re;
      const di = cur[i + 1]!.im - cur[i]!.im;
      const m2 = dr * dr + di * di;
      if (m2 < 1e-300) return best;
      next.push({ re: prev[i + 1]!.re + dr / m2, im: prev[i + 1]!.im - di / m2 });
    }
    prev = cur;
    cur = next;
    if (k % 2 === 0 && cur.length) best = cur[cur.length - 1]!;
  }
  return best;
}

/** Up to here the full series on a precomputed grid; above it orders ≤ 2 (within 0.07 dB of the full series to 1 kHz on two frames). */
export const SLAB_TOP_HZ = 600;
/** Orders ≤ 2 are splined up to here (charts with an open baffle stop at 1 kHz); beyond it they're worked out at each frequency. */
const HF_TOP_HZ = 2400;
const NODE_SPACING_M = 0.05;

export interface SlabModel {
  /** F at f (Hz) for unit outward volume velocity spread over the face's sources. */
  at(f: number): Complex;
}

function build(s: Slab, srcs: FaceSources[], c: number): SlabModel[] {
  const B = kernels(s, NODE_SPACING_M);
  const S = srcs.map((src) => sourceKernels(B, s, src));
  // Grid: even in x = f + f1·ln f (log-like below f1, linear above, where the response ripples
  // with period ~c/size), from 1 Hz to a step past the top so the spline's ends lie outside its use.
  const size = Math.max(s.w, s.h) + s.t;
  const f1 = Math.min(200, Math.max(20, c / (6 * size)));
  const X = (f: number) => f + f1 * Math.log(f);
  const df = c / (10 * size);
  const top = SLAB_TOP_HZ + df;
  const nGrid = 12 + Math.ceil((top - f1) / df);
  const fs: number[] = [];
  for (let q = 0; q < nGrid; q++) {
    const x = X(1) + ((X(top) - X(1)) * q) / (nGrid - 1);
    let f = Math.max(1, x - f1 * Math.log(Math.max(x, 1)));
    for (let it = 0; it < 50; it++) f -= (X(f) - x) / (1 + f1 / f);
    fs.push(f);
  }
  const Y = symmetry(B, s);
  const symSet = srcs.map((src) => Y !== null && symmetric(src, s));
  const symIdx = S.flatMap((_, i) => (symSet[i] ? [i] : []));
  const fullIdx = S.flatMap((_, i) => (symSet[i] ? [] : [i]));
  const grid = fs.map((f) => {
    const k = (2 * Math.PI * f) / c;
    const out: Complex[] = new Array(S.length);
    if (symIdx.length) evaluateSym(B.K, Y!, symIdx.map((i) => S[i]!), k).forEach((v, q) => (out[symIdx[q]!] = v));
    if (fullIdx.length) evaluate(B.K, fullIdx.map((i) => S[i]!), k).forEach((v, q) => (out[fullIdx[q]!] = v));
    return out;
  });
  const xs = Float64Array.from(fs, X);
  // Above the full series' top: orders ≤ 2 on a linear grid to HF_TOP_HZ, built on first use.
  let hf: { sr: (f: number) => number; si: (f: number) => number }[] | null = null;
  const hfGrid = () => {
    const step = c / (8 * size);
    const n = Math.max(2, Math.ceil((HF_TOP_HZ - SLAB_TOP_HZ) / step) + 1);
    const f = Float64Array.from({ length: n }, (_, q) => SLAB_TOP_HZ + ((HF_TOP_HZ - SLAB_TOP_HZ) * q) / (n - 1));
    const v = Array.from(f, (fq) => evaluate(B.K, S, (2 * Math.PI * fq) / c, 0, 2, false));
    return S.map((_, si) => ({ sr: spline(f, Float64Array.from(v, (x) => x[si]!.re)), si: spline(f, Float64Array.from(v, (x) => x[si]!.im)) }));
  };
  // Either face's sources alone go to a free point source (F → 1) at DC: smooth, splined as is.
  return S.map((Sk, si) => {
    const sr = spline(xs, Float64Array.from(grid, (g) => g[si]!.re));
    const sim = spline(xs, Float64Array.from(grid, (g) => g[si]!.im));
    return {
      at(f: number): Complex {
        if (f > HF_TOP_HZ) return evaluate(B.K, [Sk], (2 * Math.PI * f) / c, 0, 2, false)[0]!;
        if (f > SLAB_TOP_HZ) {
          hf ??= hfGrid();
          const h = { re: hf[si]!.sr(f), im: hf[si]!.si(f) };
          // Blend over the full grid's last step (it runs to SLAB_TOP_HZ + df), so the hand-over is continuous.
          const u = (f - SLAB_TOP_HZ) / df;
          if (u >= 1) return h;
          const x = X(f);
          return { re: (1 - u) * sr(x) + u * h.re, im: (1 - u) * sim(x) + u * h.im };
        }
        const x = X(Math.max(f, 1));
        return { re: sr(x), im: sim(x) };
      },
    };
  });
}

const cache = new Map<string, SlabModel[]>();
/** Models for each face's sources on a slab, cached (building takes a moment; evaluating is cheap). */
export function slabModels(s: Slab, srcs: FaceSources[], c: number): SlabModel[] {
  const key = JSON.stringify([s.w, s.h, s.t, c, srcs.map((x) => [x.face, x.x, x.y, x.wt])]);
  let m = cache.get(key);
  if (!m) {
    m = build(s, srcs, c);
    if (cache.size >= 16) cache.delete(cache.keys().next().value!);
    cache.set(key, m);
  }
  return m;
}

/** Gauss points over a rectangle [x0, x0 + w] × [y0, y0 + h] (a mouth), weights summing to 1. */
export function rectSources(face: "front" | "rear", x0: number, y0: number, w: number, h: number, n = 8): FaceSources {
  const g = gauss(n);
  const x: number[] = [];
  const y: number[] = [];
  const wt: number[] = [];
  for (let i = 0; i < n; i++)
    for (let j = 0; j < n; j++) {
      x.push(x0 + g.s[i]! * w);
      y.push(y0 + g.s[j]! * h);
      wt.push(g.w[i]! * g.w[j]!);
    }
  return { face, x, y, wt };
}

/** Area-uniform points over a disc (a cone) on a face, weights summing to 1. */
export function discSources(face: "front" | "rear", cx0: number, cy0: number, a: number, nr = 4, nth = 12): FaceSources {
  if (!(a > 0)) return { face, x: [cx0], y: [cy0], wt: [1] };
  const g = gauss(nr);
  const x: number[] = [];
  const y: number[] = [];
  const wt: number[] = [];
  for (let i = 0; i < nr; i++) {
    const r = a * Math.sqrt(g.s[i]!);
    for (let j = 0; j < nth; j++) {
      const t = (2 * Math.PI * (j + 0.5)) / nth;
      x.push(cx0 + r * Math.cos(t));
      y.push(cy0 + r * Math.sin(t));
      wt.push(g.w[i]! / nth);
    }
  }
  return { face, x, y, wt };
}
