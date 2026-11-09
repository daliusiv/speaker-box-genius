import { sealedVolumeForQtc } from "./sealed.ts";
import { qts as qtsOf } from "./ts.ts";

/**
 * Classic box alignments for a driver (or N identical drivers sharing a box,
 * which act like one driver with N × Vas and the same Qs).
 *
 * Vented alignments use the lossless 4th-order model (or Small's lossy one when QL is given).
 * Real boxes leak (WinISD assumes Ql = 10), so the simulated response with losses will sit a
 * little lower near Fb than the ideal shape. WinISD's own wizard sizes boxes differently, from
 * curves measured in winisdAlignments.ts.
 */

export interface AlignmentDriver {
  fs: number;
  qms: number;
  qes: number;
  vas_l: number;
  /**
   * The box's leakage Q (QL) the vented alignment allows for, as the simulation will use it.
   * Omitted or ∞: a lossless box (Thiele's original tables).
   */
  ql?: number;
  /** DC resistance of one driver's coil as wired (Ω): WinISD's alignments need it (winisdAlignments.ts). */
  re?: number;
  /** Which presets an app asks for: WinISD's curves or the textbook equations (these functions are the textbook ones). */
  style?: "winisd" | "textbook";
}

export interface VentedAlignment {
  name: string;
  vb_l: number;
  fb: number;
}

/** Sealed box volume for a target Qtc (0.5 = critically damped, 0.577 = Bessel, 0.707 = Butterworth). */
export function sealedVolumeForAlignment(d: AlignmentDriver, qtc: number, drivers = 1): number | null {
  try {
    return sealedVolumeForQtc({ qms: d.qms, qes: d.qes, vas_l: d.vas_l * drivers }, qtc);
  } catch {
    return null;
  }
}

/** Qts at which QB3 becomes the 4th-order Butterworth (B4) alignment. */
export const B4_QTS = 1 / Math.sqrt(4 + 2 * Math.SQRT2); // ≈ 0.3827 (B4 has a1 = a3 = √(4 + 2√2))

/**
 * QB3 ("quasi-Butterworth 3rd order", Thiele): the vented response whose
 * |G(jω)|² = ω⁸ / (ω⁸ + B·ω² + 1), i.e. the ω⁶ and ω⁴ terms are zero.
 * For Qts ≈ 0.383 it is exactly B4. Needs Qts below that; returns null above.
 *
 * With h = fb/fs and α = Vas/Vb, the lossless coefficients are
 *   a1 = 1/(Q√h), a2 = (α + 1 + h²)/h, a3 = √h/Q
 * Zero ω⁶ term: a1² = 2·a2. Zero ω⁴ term: a2² + 2 − 2·a1·a3 = 0, and a1·a3 = 1/Q².
 */
export function qb3Alignment(d: AlignmentDriver, drivers = 1): VentedAlignment | null {
  const q = qtsOf(d.qms, d.qes);
  const ql = d.ql ?? Infinity;
  if (Number.isFinite(ql) && ql > 0) return lossyQb3(d, q, ql, drivers);
  if (q > B4_QTS + 1e-6) return null;
  const a2 = Math.sqrt(2 / (q * q) - 2);
  const h = 1 / (2 * a2 * q * q);
  const alpha = a2 * h - 1 - h * h;
  if (!(alpha > 0)) return null;
  return {
    name: Math.abs(q - B4_QTS) < 0.005 ? "B4" : "QB3",
    vb_l: (d.vas_l * drivers) / alpha,
    fb: h * d.fs,
  };
}

/**
 * QB3 in a box with leakage QL (Small, "Vented-Box Loudspeaker Systems", JAES 1973): the same
 * two conditions (no ω⁶ or ω⁴ term in |G|²) on the lossy coefficients
 *   a1 = (QL + h·Qt)/(√h·QL·Qt), a2 = (h + (α + 1 + h²)·QL·Qt)/(h·QL·Qt), a3 = (h·QL + Qt)/(√h·QL·Qt).
 * The ω⁶ condition (a1² = 2·a2) gives α for each h; the ω⁴ one (a2² + 2 = 2·a1·a3) is then
 * solved for h. Leakage loses output near Fb, so the box comes out a little bigger and
 * tuned a little higher than the lossless one. Null where no such box exists or it would peak (Qts too high).
 */
function lossyQb3(d: AlignmentDriver, q: number, ql: number, drivers: number): VentedAlignment | null {
  const coeffs = (h: number) => {
    const a1 = (ql + h * q) / (Math.sqrt(h) * ql * q);
    const a3 = (h * ql + q) / (Math.sqrt(h) * ql * q);
    const a2 = (a1 * a1) / 2;
    const alpha = (a2 * h * ql * q - h) / (ql * q) - 1 - h * h;
    // c: the ω² term. Positive for QB3, zero at B4; negative would be a peak (Qts too high).
    return { alpha, f: a2 * a2 + 2 - 2 * a1 * a3, c: a3 * a3 - 2 * a2 };
  };
  // Scan h for a sign change of the ω⁴ condition where α > 0, then bisect.
  const hs = Array.from({ length: 400 }, (_, i) => 0.2 * 40 ** (i / 399));
  for (let i = 1; i < hs.length; i++) {
    const [lo, hi] = [hs[i - 1]!, hs[i]!];
    const a = coeffs(lo);
    const b = coeffs(hi);
    if (!(a.alpha > 0 && b.alpha > 0) || Math.sign(a.f) === Math.sign(b.f)) continue;
    let [x0, x1, f0] = [lo, hi, a.f];
    for (let k = 0; k < 60; k++) {
      const m = (x0 + x1) / 2;
      const fm = coeffs(m).f;
      if (Math.sign(fm) === Math.sign(f0)) [x0, f0] = [m, fm];
      else x1 = m;
    }
    const h = (x0 + x1) / 2;
    const { alpha, c } = coeffs(h);
    // Past B4 (c < 0) the "flat" box peaks: Qts is too high for QB3 (Keele's alignment takes over).
    if (c < -0.05) return null;
    return { name: Math.abs(c) <= 0.05 ? "B4" : "QB3", vb_l: (d.vas_l * drivers) / alpha, fb: h * d.fs };
  }
  return null;
}

/**
 * Keele's vented alignment for drivers with Qts above the QB3/B4 range (about 0.2–0.6):
 * Vb = 15·Vas·Qts^2.87, Fb = 0.42·Fs·Qts^−0.9, giving a near-flat response with
 * F3 ≈ 0.26·Fs·Qts^−1.4 (D. B. Keele Jr., "A New Set of Sixth-Order Vented-Box Loudspeaker
 * System Alignments", JAES 1975, and his closed-form approximations).
 */
export function keeleAlignment(d: AlignmentDriver, drivers = 1): VentedAlignment | null {
  const q = qtsOf(d.qms, d.qes);
  if (!(q >= 0.2 && q <= 0.6)) return null;
  return {
    name: "Keele",
    vb_l: 15 * d.vas_l * drivers * q ** 2.87,
    fb: 0.42 * d.fs * q ** -0.9,
  };
}

/* ------------------------------------------------------------------------------------------ *
 * More vented alignment families (roadmap 15c). Each is a target shape for the normalized
 * 4th-order response G(s) = s⁴ / (s⁴ + a1·s³ + a2·s² + a3·s + 1), s = jω/ω0, ω0 = √(ωs·ωb).
 * A box gives (Small 1973; lossless when QL = ∞):
 *   a1 = (QL + h·Qt)/(√h·QL·Qt), a2 = (h + (α + 1 + h²)·QL·Qt)/(h·QL·Qt), a3 = (h·QL + Qt)/(√h·QL·Qt)
 * with h = fb/fs and α = Vas/Vb. Definitions as in R. M. Bullock III, "Thiele, Small and Vented
 * Loudspeaker Design" (Speaker Builder, 1980–81) and the Speakerbench documentation
 * (speakerbench.com/doc/alignment_theory.html), whose QL = 100 tables the tests check.
 * ------------------------------------------------------------------------------------------ */

/** A vented alignment with what its response does, for a preset's tooltip. */
export interface ShapedAlignment extends VentedAlignment {
  /** How the response behaves above the roll-off: equal ripple, a peak, or flat. */
  shape: "flat" | "ripple" | "peak";
  /** The ripple's or peak's size in dB (0 when flat). */
  db: number;
}

/** The box (h, α) that gives target coefficients a1 and a3 (their ratio fixes h), with QL; null if none. */
function boxFor(t: { a1: number; a2: number; a3: number }, q: number, ql: number): { h: number; alpha: number } | null {
  const r = t.a3 / t.a1;
  const h = Number.isFinite(ql) ? (r * ql - q) / (ql - r * q) : r;
  if (!(h > 0)) return null;
  const alpha = Number.isFinite(ql) ? (t.a2 * h * ql * q - h) / (ql * q) - 1 - h * h : t.a2 * h - 1 - h * h;
  return alpha > 0 ? { h, alpha } : null;
}

/** a1 the box gives at tuning ratio h: the second condition the family's parameter must meet. */
const boxA1 = (h: number, q: number, ql: number) => (Number.isFinite(ql) ? (ql + h * q) / (Math.sqrt(h) * ql * q) : 1 / (q * Math.sqrt(h)));

/** The largest value of |G(jω)|² in dB for coefficients a (a peak above 0 dB, or 0). */
function peakDb(a: { a1: number; a2: number; a3: number }): number {
  let max = 0;
  for (let i = 0; i <= 2000; i++) {
    const w = 0.1 * 1000 ** (i / 2000);
    const re = w ** 4 - a.a2 * w * w + 1;
    const im = a.a3 * w - a.a1 * w ** 3;
    max = Math.max(max, w ** 8 / (re * re + im * im));
  }
  return 10 * Math.log10(max);
}

/** Chebyshev coefficients for Thiele's parameter k (k < 1 ripple, k = 1 B4, k > 1 sub-Chebyshev). */
export function chebyshevCoefficients(k: number): { a1: number; a2: number; a3: number } {
  const c0 = Math.sqrt(4 + Math.sqrt(8));
  const D = (k ** 4 + 6 * k * k + 1) / 8;
  return {
    a3: (c0 * k) / D ** 0.25,
    a2: (1 + k * k * (1 + Math.SQRT2)) / Math.sqrt(D),
    a1: ((c0 * k) / D ** 0.75) * (1 + (k * k - 1) / Math.sqrt(8)),
  };
}

/**
 * C4 / SC4 (Thiele's fourth-order Chebyshev family): for Qts above B4 an equal-ripple response
 * that reaches lower than B4 in a bigger box (C4, k < 1); below B4 a monotonic one, a little
 * bigger and lower than QB3 (SC4, k > 1). Solved for k by bisection. Ripple limited to 1.8 dB,
 * the most in Thiele's tables; null outside that.
 */
export function c4Alignment(d: AlignmentDriver, drivers = 1): ShapedAlignment | null {
  const q = qtsOf(d.qms, d.qes);
  const ql = d.ql ?? Infinity;
  // f(k): the box's a1 at the h the shape asks for, against the shape's a1.
  const f = (k: number) => {
    const t = chebyshevCoefficients(k);
    const b = boxFor(t, q, ql);
    return b ? boxA1(b.h, q, ql) - t.a1 : NaN;
  };
  const ks = Array.from({ length: 600 }, (_, i) => 0.05 * 400 ** (i / 599));
  for (let i = 1; i < ks.length; i++) {
    let [lo, hi] = [ks[i - 1]!, ks[i]!];
    let [flo, fhi] = [f(lo), f(hi)];
    if (!Number.isFinite(flo) || !Number.isFinite(fhi) || Math.sign(flo) === Math.sign(fhi)) continue;
    for (let n = 0; n < 80; n++) {
      const m = (lo + hi) / 2;
      const fm = f(m);
      if (Math.sign(fm) === Math.sign(flo)) [lo, flo] = [m, fm];
      else [hi, fhi] = [m, fm];
    }
    const k = (lo + hi) / 2;
    const t = chebyshevCoefficients(k);
    const b = boxFor(t, q, ql)!;
    // Ripple of the k < 1 shape: ε = 1/sinh(4·atanh k).
    const ripple = k < 1 ? 10 * Math.log10(1 + 1 / Math.sinh(4 * Math.atanh(k)) ** 2) : 0;
    if (ripple > 1.8) return null;
    const b4 = Math.abs(k - 1) < 0.01;
    return {
      name: b4 ? "B4" : k < 1 ? "C4" : "SC4",
      vb_l: (d.vas_l * drivers) / b.alpha,
      fb: b.h * d.fs,
      shape: k < 1 && !b4 ? "ripple" : "flat",
      db: b4 ? 0 : ripple,
    };
  }
  return null;
}

/**
 * BB4 / SBB4 (Hoge's "boom box", extended by Bullock): two identical second-order high-passes,
 * G = s⁴/(s² + 2ζs + 1)², with the port tuned to Fs (h = 1). Then ζ = ¼(1/Qt + 1/QL) and
 * α = ¼(1/Qt − 1/QL)². Below Qt ≈ 0.354 (ζ > 1/√2) the response is flat and falls gently,
 * good for transients (SBB4); above it peaks before rolling off (BB4). Offered for 0.2–0.72.
 */
export function bb4Alignment(d: AlignmentDriver, drivers = 1): ShapedAlignment | null {
  const q = qtsOf(d.qms, d.qes);
  const ql = d.ql ?? Infinity;
  if (!(q >= 0.2 && q <= 0.72)) return null;
  const zeta = 0.25 * (1 / q + (Number.isFinite(ql) ? 1 / ql : 0));
  const alpha = 0.25 * (1 / q - (Number.isFinite(ql) ? 1 / ql : 0)) ** 2;
  // Each second-order section peaks by 1/(2ζ√(1 − ζ²)) when ζ < 1/√2; two of them double it in dB.
  const peak = zeta < Math.SQRT1_2 ? 2 * 20 * Math.log10(1 / (2 * zeta * Math.sqrt(1 - zeta * zeta))) : 0;
  return {
    name: peak > 0.05 ? "BB4" : "SBB4",
    vb_l: (d.vas_l * drivers) / alpha,
    fb: d.fs,
    shape: peak > 0.05 ? "peak" : "flat",
    db: peak > 0.05 ? peak : 0,
  };
}

/**
 * SQB3 (Bullock's "super QB3"): QB3's equations (no ω⁶ or ω⁴ term in |G|²) carried past B4.
 * The ω² term turns negative, so the response peaks before rolling off. Lossless, like the
 * app's other presets: about +2 dB at Qts 0.46 and +6 dB at 0.5, then it runs away (a 70 × Vas
 * box peaking 33 dB at 0.56; Bullock's tables, which go to 0.56 with +11.6 dB, assume a leaky
 * box, QL = 7). So it's offered while the peak stays within 6 dB; null otherwise.
 */
export function sqb3Alignment(d: AlignmentDriver, drivers = 1): ShapedAlignment | null {
  const q = qtsOf(d.qms, d.qes);
  if (!(q > B4_QTS + 0.005 && q <= 0.56)) return null;
  const a2 = Math.sqrt(2 / (q * q) - 2);
  const h = 1 / (2 * a2 * q * q);
  const alpha = a2 * h - 1 - h * h;
  if (!(alpha > 0)) return null;
  const a1 = 1 / (q * Math.sqrt(h));
  const a3 = Math.sqrt(h) / q;
  const db = peakDb({ a1, a2, a3 });
  if (db > 6.05) return null;
  return { name: "SQB3", vb_l: (d.vas_l * drivers) / alpha, fb: h * d.fs, shape: "peak", db };
}

/**
 * Every extra family that suits this driver, besides the flat preset (QB3 / B4 / Keele): C4 or
 * SC4, BB4 or SBB4, and SQB3 above B4. Bessel (BL4) is a single point (Qts ≈ 0.316), not a family, so it's not here.
 */
export function moreVentedAlignments(d: AlignmentDriver, drivers = 1): ShapedAlignment[] {
  return [c4Alignment(d, drivers), bb4Alignment(d, drivers), sqb3Alignment(d, drivers)].filter(
    (a): a is ShapedAlignment => a !== null && a.name !== "B4",
  );
}
