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
