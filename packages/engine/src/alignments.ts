import { sealedVolumeForQtc } from "./sealed.ts";
import { qts as qtsOf } from "./ts.ts";

/**
 * Classic box alignments for a driver (or N identical drivers sharing a box,
 * which act like one driver with N × Vas and the same Qs).
 *
 * Vented alignments use the lossless 4th-order model. Real boxes leak
 * (WinISD assumes Ql = 10), so the simulated response with losses will sit a
 * little lower near Fb than the ideal shape.
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
