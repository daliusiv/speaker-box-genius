import type { Complex } from "./complex.ts";

/**
 * On-axis response of a driver on a thin flat board (open baffle), from edge diffraction.
 *
 * The cone's front (+U) sits on the board's front face and its back (−U) on the rear face. The
 * listener is far away on the front axis. Each edge of the board re-radiates as a line of edge
 * sources (Biot–Tolstoy–Medwin; Svensson, Fred & Vanderkooy, JASA 106(5), 1999); a thin board is
 * a wedge with index ν = ½. Edge sources also light the other edges along the board's faces,
 * and so on: all orders are summed until the next one is negligible.
 *
 *   F = 2 + Σₙ Fₙ,   Fₙ = 2·(−1/2π)ⁿ ∫…∫ b₁…bₙ e^{−jkL} / (m·d₁₂…dₙ₋₁,ₙ)
 *
 * F is the pressure against a free point source of the same volume velocity (the sound of the
 * front alone in a wall would be 2). m: cone → first edge point; d: edge point → next edge point;
 * L: the whole path. b = 1/cosh(η/2) at each hop between edges along a face, and √(r(d + r))/d at
 * the last edge (the listener on axis); the first edge's own term is √(a(m + a))/m². The front and
 * rear faces, and the front and rear sources, add with the same sign, and each grazing hop
 * carries ½, so no other factor appears.
 *
 * The series alternates and converges slowly at low frequency (2 − 2.91 + 1.41 − 0.77 … for a
 * centred square), so a first- or second-order cut-off is badly wrong in the bass; the full sum
 * goes to zero at DC with the right slope (the board's low-frequency path D, F → jkD).
 * Checked against boundary-element solutions of ten boards (packages/engine/validation/bem):
 * within 0.1 dB rms to 900 Hz, the peak level within 0.05 dB, nothing fitted.
 *
 * The cone is a flat disc: its source terms are averaged over its face.
 */

export interface FlatBoard {
  /** Board width and height (m). */
  w: number;
  h: number;
  /** Cone centre from the left and bottom edges (m). */
  x: number;
  y: number;
  /** Cone radius (m); 0 for a point. */
  a: number;
}

/** Gauss–Legendre nodes and weights on [0, 1]. */
const glCache = new Map<number, { s: Float64Array; w: Float64Array }>();
export function gauss(n: number) {
  let g = glCache.get(n);
  if (g) return g;
  const s = new Float64Array(n);
  const w = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    let x = Math.cos((Math.PI * (i + 0.75)) / (n + 0.5));
    let dp = 0;
    for (let it = 0; it < 100; it++) {
      let p0 = 1;
      let p1 = x;
      for (let k = 2; k <= n; k++) {
        const p2 = ((2 * k - 1) * x * p1 - (k - 1) * p0) / k;
        p0 = p1;
        p1 = p2;
      }
      dp = (n * (x * p1 - p0)) / (x * x - 1);
      const dx = p1 / dp;
      x -= dx;
      if (Math.abs(dx) < 1e-15) break;
    }
    s[n - 1 - i] = (x + 1) / 2;
    w[n - 1 - i] = 1 / ((1 - x * x) * dp * dp);
  }
  g = { s, w };
  glCache.set(n, g);
  return g;
}

interface Edge {
  x0: number;
  y0: number;
  ux: number;
  uy: number;
}
/** Distance of (px, py) from an edge's line, and its coordinate along it. */
const perp = (e: Edge, px: number, py: number) => Math.abs((px - e.x0) * e.uy - (py - e.y0) * e.ux);
const along = (e: Edge, px: number, py: number) => (px - e.x0) * e.ux + (py - e.y0) * e.uy;

/** 1 / cosh(η/2) for edge point z between in-plane points A and B (0 when either lies on the edge's line). */
function bHop(e: Edge, ax: number, ay: number, zx: number, zy: number, bx: number, by: number): number {
  const rA = perp(e, ax, ay);
  const rB = perp(e, bx, by);
  if (rA * rB < 1e-300) return 0;
  const mA = Math.hypot(ax - zx, ay - zy);
  const mB = Math.hypot(bx - zx, by - zy);
  const cz = along(e, zx, zy);
  const ce = (mA * mB + (cz - along(e, ax, ay)) * (cz - along(e, bx, by))) / (rA * rB);
  return 1 / Math.sqrt((Math.max(ce, 1) + 1) / 2);
}

interface Kernels {
  n: number;
  /** Node weights (m). */
  w: Float64Array;
  /** Node-to-node distance (m), its inverse (0 on the same edge), last-edge factor. */
  d: Float64Array;
  invd: Float64Array;
  last: Float64Array;
  /** Hop factor i → j → l, flattened [i][j][l] (null: orders ≤ 2 only). */
  mid: Float32Array | null;
  /** Source rows: cone point s → node i. */
  ns: number;
  m: Float64Array;
  k1: Float64Array;
  /** First hop s → i → j, flattened [s][i][j]. */
  first: Float64Array;
}

/** Area-uniform points on the cone (the parts on the board), weights summing to 1. */
function conePoints(b: FlatBoard, nr: number, nth: number) {
  if (!(b.a > 0)) return { x: [b.x], y: [b.y], w: [1] };
  const g = gauss(nr);
  const x: number[] = [];
  const y: number[] = [];
  const w: number[] = [];
  for (let i = 0; i < nr; i++) {
    const r = b.a * Math.sqrt(g.s[i]!);
    for (let j = 0; j < nth; j++) {
      const t = (2 * Math.PI * (j + 0.5)) / nth;
      const px = b.x + r * Math.cos(t);
      const py = b.y + r * Math.sin(t);
      if (px <= 0 || px >= b.w || py <= 0 || py >= b.h) continue;
      x.push(px);
      y.push(py);
      w.push(g.w[i]! / nth);
    }
  }
  const sum = w.reduce((s, v) => s + v, 0);
  return { x, y, w: w.map((v) => v / sum) };
}

/** Kernels for nodes about h apart along each edge (graded towards the corners). */
function kernels(b: FlatBoard, h: number, withMid: boolean, cone: { nr: number; nth: number } | null, firstHop = true): Kernels {
  const corners = [
    [0, 0],
    [b.w, 0],
    [b.w, b.h],
    [0, b.h],
  ] as const;
  const edges: Edge[] = [];
  const px: number[] = [];
  const py: number[] = [];
  const pw: number[] = [];
  const pe: number[] = [];
  for (let e = 0; e < 4; e++) {
    const [x0, y0] = corners[e]!;
    const [x1, y1] = corners[(e + 1) % 4]!;
    const L = Math.hypot(x1 - x0, y1 - y0);
    const ed: Edge = { x0, y0, ux: (x1 - x0) / L, uy: (y1 - y0) / L };
    edges.push(ed);
    // An edge near the driver is split at the driver's foot point, so the nodes crowd there too:
    // the first hop's kernel peaks over about the driver's distance from the edge (P60 with the
    // driver 7.5 cm from a side edge was 0.5 dB / 15° out in the bass with even nodes, #264).
    const dist = Math.abs((b.x - x0) * ed.uy - (b.y - y0) * ed.ux);
    const foot = Math.min(L, Math.max(0, (b.x - x0) * ed.ux + (b.y - y0) * ed.uy));
    const parts = dist < NEAR_EDGE * h && foot > 0.02 * L && foot < 0.98 * L ? [[0, foot], [foot, L]] : [[0, L]];
    for (const [s0, s1] of parts) {
      const len = s1! - s0!;
      const ne = Math.max(parts.length > 1 ? 4 : 6, Math.ceil(len / h));
      const g = gauss(ne);
      for (let i = 0; i < ne; i++) {
        const s = g.s[i]!;
        const t = s0! + s * s * (3 - 2 * s) * len;
        px.push(x0 + t * ed.ux);
        py.push(y0 + t * ed.uy);
        pw.push(g.w[i]! * 6 * s * (1 - s) * len);
        pe.push(e);
      }
    }
  }
  const n = px.length;
  const w = Float64Array.from(pw);
  const d = new Float64Array(n * n);
  const invd = new Float64Array(n * n);
  const last = new Float64Array(n * n);
  for (let i = 0; i < n; i++)
    for (let j = 0; j < n; j++) {
      if (pe[i] === pe[j]) continue;
      const dd = Math.hypot(px[i]! - px[j]!, py[i]! - py[j]!);
      const r = perp(edges[pe[j]!]!, px[i]!, py[i]!);
      d[i * n + j] = dd;
      invd[i * n + j] = 1 / dd;
      last[i * n + j] = Math.sqrt(r * (dd + r)) / (dd * dd);
    }
  let mid: Float32Array | null = null;
  if (withMid) {
    mid = new Float32Array(n * n * n);
    for (let i = 0; i < n; i++)
      for (let j = 0; j < n; j++) {
        if (pe[i] === pe[j]) continue;
        const e = edges[pe[j]!]!;
        const base = (i * n + j) * n;
        for (let l = 0; l < n; l++) if (pe[l] !== pe[j]) mid[base + l] = bHop(e, px[i]!, py[i]!, px[j]!, py[j]!, px[l]!, py[l]!);
      }
  }
  const cp = cone ? conePoints(b, cone.nr, cone.nth) : { x: [b.x], y: [b.y], w: [1] };
  const ns = cp.x.length;
  const m = new Float64Array(ns * n);
  const k1 = new Float64Array(ns * n);
  const first = new Float64Array(firstHop ? ns * n * n : 0);
  for (let s = 0; s < ns; s++) {
    const sx = cp.x[s]!;
    const sy = cp.y[s]!;
    for (let i = 0; i < n; i++) {
      const e = edges[pe[i]!]!;
      const mi = Math.hypot(px[i]! - sx, py[i]! - sy);
      const a = perp(e, sx, sy);
      m[s * n + i] = mi;
      k1[s * n + i] = (Math.sqrt(a * (mi + a)) / (mi * mi)) * w[i]! * cp.w[s]!;
      if (!firstHop) continue;
      const f = (cp.w[s]! * w[i]!) / mi;
      const base = (s * n + i) * n;
      for (let j = 0; j < n; j++) if (pe[j] !== pe[i]) first[base + j] = f * bHop(e, sx, sy, px[i]!, py[i]!, px[j]!, py[j]!);
    }
  }
  return { n, w, d, invd, last, mid, ns, m, k1, first };
}

/** 2 + the first order alone. */
function firstOrder(K: Kernels, k: number): Complex {
  const c1 = -1 / Math.PI;
  let re = 2;
  let im = 0;
  for (let q = 0; q < K.ns * K.n; q++) {
    const ph = k * K.m[q]!;
    re += c1 * K.k1[q]! * Math.cos(ph);
    im -= c1 * K.k1[q]! * Math.sin(ph);
  }
  return { re, im };
}

/** F at wavenumber k, all orders (until a term is below tol) or orders ≤ 2. */
function evaluate(K: Kernels, k: number, tol = 1e-7, maxOrder = 200): Complex {
  const { n, ns } = K;
  const c1 = -1 / (2 * Math.PI);
  let re = 2;
  let im = 0;
  // Order 1 and the amplitudes arriving at the first hop (i → j).
  const emr = new Float64Array(ns * n);
  const emi = new Float64Array(ns * n);
  for (let q = 0; q < ns * n; q++) {
    const ph = k * K.m[q]!;
    emr[q] = Math.cos(ph);
    emi[q] = -Math.sin(ph);
    re += 2 * c1 * K.k1[q]! * emr[q]!;
    im += 2 * c1 * K.k1[q]! * emi[q]!;
  }
  // Hop factor j → l: e^{−jk·d}·w_l.
  const tr = new Float64Array(n * n);
  const ti = new Float64Array(n * n);
  for (let j = 0; j < n; j++)
    for (let l = 0; l < n; l++) {
      const q = j * n + l;
      if (K.invd[q] === 0) continue;
      const ph = k * K.d[q]!;
      tr[q] = Math.cos(ph) * K.w[l]!;
      ti[q] = -Math.sin(ph) * K.w[l]!;
    }
  let xr = new Float64Array(n * n);
  let xi = new Float64Array(n * n);
  for (let s = 0; s < ns; s++)
    for (let i = 0; i < n; i++) {
      const ar = emr[s * n + i]!;
      const ai = emi[s * n + i]!;
      const base = (s * n + i) * n;
      for (let j = 0; j < n; j++) {
        const f = K.first[base + j]!;
        if (f === 0) continue;
        xr[i * n + j] = xr[i * n + j]! + f * ar;
        xi[i * n + j] = xi[i * n + j]! + f * ai;
      }
    }
  for (let q = 0; q < n * n; q++) {
    const a = xr[q]!;
    const b = xi[q]!;
    xr[q] = a * tr[q]! - b * ti[q]!;
    xi[q] = a * ti[q]! + b * tr[q]!;
  }
  let coef = 2 * c1 * c1;
  let yr = new Float64Array(n * n);
  let yi = new Float64Array(n * n);
  for (let order = 2; ; order++) {
    let sr = 0;
    let si = 0;
    for (let q = 0; q < n * n; q++) {
      sr += xr[q]! * K.last[q]!;
      si += xi[q]! * K.last[q]!;
    }
    re += coef * sr;
    im += coef * si;
    if (order >= maxOrder || !K.mid || Math.hypot(coef * sr, coef * si) < tol) break;
    // Next hop: y[j, l] = Σᵢ x[i, j]/d_ij · b(i, j, l), then times e^{−jk·d_jl}·w_l.
    yr.fill(0);
    yi.fill(0);
    const mid = K.mid;
    for (let i = 0; i < n; i++)
      for (let j = 0; j < n; j++) {
        const q = i * n + j;
        const inv = K.invd[q]!;
        if (inv === 0) continue;
        const ar = xr[q]! * inv;
        const ai = xi[q]! * inv;
        if (ar === 0 && ai === 0) continue;
        const base = q * n;
        const row = j * n;
        for (let l = 0; l < n; l++) {
          const b = mid[base + l]!;
          yr[row + l] = yr[row + l]! + ar * b;
          yi[row + l] = yi[row + l]! + ai * b;
        }
      }
    for (let q = 0; q < n * n; q++) {
      const a = yr[q]!;
      const b = yi[q]!;
      yr[q] = a * tr[q]! - b * ti[q]!;
      yi[q] = a * ti[q]! + b * tr[q]!;
    }
    [xr, yr] = [yr, xr];
    [xi, yi] = [yi, xi];
    coef *= c1;
  }
  return { re, im };
}

/** Natural cubic spline through (x, y). */
export function spline(x: Float64Array, y: Float64Array): (t: number) => number {
  const n = x.length;
  const m = new Float64Array(n);
  if (n > 2) {
    const a = new Float64Array(n);
    const bb = new Float64Array(n);
    const c = new Float64Array(n);
    const r = new Float64Array(n);
    for (let i = 1; i < n - 1; i++) {
      const h0 = x[i]! - x[i - 1]!;
      const h1 = x[i + 1]! - x[i]!;
      a[i] = h0;
      bb[i] = 2 * (h0 + h1);
      c[i] = h1;
      r[i] = 6 * ((y[i + 1]! - y[i]!) / h1 - (y[i]! - y[i - 1]!) / h0);
    }
    for (let i = 2; i < n - 1; i++) {
      const f = a[i]! / bb[i - 1]!;
      bb[i] = bb[i]! - f * c[i - 1]!;
      r[i] = r[i]! - f * r[i - 1]!;
    }
    for (let i = n - 2; i >= 1; i--) m[i] = (r[i]! - c[i]! * m[i + 1]!) / bb[i]!;
  }
  return (t: number) => {
    let lo = 0;
    let hi = n - 1;
    if (t <= x[0]!) return y[0]!;
    if (t >= x[n - 1]!) return y[n - 1]!;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (x[mid]! > t) hi = mid;
      else lo = mid;
    }
    const h = x[hi]! - x[lo]!;
    const A = (x[hi]! - t) / h;
    const B = (t - x[lo]!) / h;
    return A * y[lo]! + B * y[hi]! + ((A * A * A - A) * m[lo]! + (B * B * B - B) * m[hi]!) * (h * h) / 6;
  };
}

/** Up to here the full series on a precomputed grid (nodes 5 cm apart are within 0.03 dB). */
export const FULL_MODEL_TOP_HZ = 1200;
const NODE_SPACING_M = 0.05;
const CONE = { nr: 4, nth: 12 };
const MAX_NODES = 400;
/** An edge closer to the driver than this many node spacings gets nodes crowded at the driver's foot point. */
const NEAR_EDGE = 3;

export interface FlatBaffleModel {
  /** F at f (Hz): pressure on the front axis against a free point source of the same volume velocity. */
  at(f: number): Complex;
  /** Low-frequency path D (m): F → jkD as f → 0. */
  d_m: number;
}

function build(b: FlatBoard, c: number): FlatBaffleModel {
  const K = kernels(b, NODE_SPACING_M, true, CONE);
  // Grid: log-spaced up to 200 Hz, then linear (the ripple above the peak is periodic in f).
  const f1 = 200;
  const fs: number[] = [];
  const nLog = 20; // log points below f1 (f1 itself starts the linear part)
  for (let i = 0; i < nLog; i++) fs.push(Math.pow(f1, i / nLog));
  const df = c / (10 * Math.max(b.w, b.h));
  const nLin = Math.max(2, Math.ceil((FULL_MODEL_TOP_HZ - f1) / df) + 1);
  for (let i = 0; i < nLin; i++) fs.push(f1 + ((FULL_MODEL_TOP_HZ - f1) * i) / (nLin - 1));
  // G = F / jk is smooth and finite at DC.
  const gr = new Float64Array(fs.length);
  const gi = new Float64Array(fs.length);
  fs.forEach((f, q) => {
    const k = (2 * Math.PI * f) / c;
    const F = evaluate(K, k);
    gr[q] = F.im / k;
    gi[q] = -F.re / k;
  });
  const xLog = Float64Array.from(fs.slice(0, nLog + 1), Math.log);
  const xLin = Float64Array.from(fs.slice(nLog));
  const sLog = [spline(xLog, gr.slice(0, nLog + 1)), spline(xLog, gi.slice(0, nLog + 1))];
  const sLin = [spline(xLin, gr.slice(nLog)), spline(xLin, gi.slice(nLog))];
  // Above the grid: orders ≤ 2 (within ~0.2 dB there), nodes λ/6 apart, built per octave.
  const hf = new Map<number, { point: Kernels; cone: Kernels }>();
  const perim = 2 * (b.w + b.h);
  return {
    d_m: gr[0]!,
    at(f: number): Complex {
      const k = (2 * Math.PI * f) / c;
      if (f <= FULL_MODEL_TOP_HZ) {
        const [r, i] = f <= f1 ? sLog.map((s) => s(Math.log(Math.max(f, 1)))) : sLin.map((s) => s(f));
        return { re: -k * i!, im: k * r! };
      }
      const band = Math.ceil(Math.log2(f / FULL_MODEL_TOP_HZ));
      let K2 = hf.get(band);
      if (!K2) {
        const top = FULL_MODEL_TOP_HZ * 2 ** band;
        const h = Math.max(c / (6 * top), perim / MAX_NODES);
        const nr = Math.max(CONE.nr, Math.ceil(k * b.a) + 2);
        K2 = { point: kernels(b, h, false, null), cone: kernels(b, h, false, { nr, nth: 3 * nr }, false) };
        hf.set(band, K2);
      }
      // The first order averaged over the cone; the second from the cone's centre.
      const both = evaluate(K2.point, k, 0, 2);
      const p1 = firstOrder(K2.point, k);
      const c1 = firstOrder(K2.cone, k);
      return { re: both.re - p1.re + c1.re, im: both.im - p1.im + c1.im };
    },
  };
}

const cache = new Map<string, FlatBaffleModel>();
/** The model for a board, cached (building it takes a moment; evaluating it is cheap). */
export function flatBaffleModel(b: FlatBoard, c: number): FlatBaffleModel {
  const key = [b.w, b.h, b.x, b.y, b.a, c].map((v) => v.toPrecision(10)).join(",");
  let m = cache.get(key);
  if (!m) {
    m = build(b, c);
    if (cache.size >= 16) cache.delete(cache.keys().next().value!);
    cache.set(key, m);
  }
  return m;
}
