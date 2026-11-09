import type { ShapedAlignment, VentedAlignment } from "./alignments.ts";

/**
 * WinISD's vented alignments (QB3, BB4/SBB4, C4/SC4), as its new-project wizard sizes them.
 *
 * WinISD 0.7.0.950 doesn't use the textbook (lossless) equations: each alignment is one curve of
 * box size (Vb/Vas) and tuning (Fb/Fs) against the driver's Qts, measured here from WinISD itself
 * (9 Nov 2026). Its Qts includes the amplifier resistance Rg (WinISD's default 0.1 Ω per driver)
 * in series with the voice coil: Qes' = Qes·(Re + Rg)/Re. With that, this table reproduces 14
 * database drivers (Re 3–6.5 Ω, Qts 0.20–0.70) within WinISD's display rounding (0.3 % on Vb,
 * 0.15 % on Fb); see packages/engine/test/winisd-alignments.test.ts.
 *
 * Measured with synthetic drivers Fs 30 Hz, Qms 5, Vas 50 L, Re 6 Ω, Qts 0.14 to 0.76: the
 * WinISD readings, verbatim. Columns: Qts, QB3 Vb (L), QB3 Fb (Hz), BB4 Vb (L) (BB4 always
 * tunes to Fs), C4 Vb (L), C4 Fb (Hz).
 */
export const WINISD_SWEEP = {
  fs: 30,
  qms: 5,
  vas_l: 50,
  re: 6,
  rows: [
    [0.14, 3.02, 81.21, 4.17, 0.0, 58.4],
    [0.16, 4.05, 71.18, 5.46, 0.09, 41.55],
    [0.18, 5.28, 63.43, 6.94, 1.53, 33.73],
    [0.2, 6.72, 57.27, 8.6, 5.43, 30.76],
    [0.22, 8.35, 52.26, 10.45, 9.42, 30.21],
    [0.24, 10.23, 48.1, 12.49, 12.13, 30.79],
    [0.26, 12.43, 44.59, 14.72, 14.04, 31.76],
    [0.28, 15.05, 41.57, 17.14, 15.95, 32.66],
    [0.3, 18.22, 38.96, 19.75, 18.37, 33.21],
    [0.32, 22.09, 36.66, 22.57, 21.66, 33.3],
    [0.34, 26.82, 34.63, 25.58, 26.07, 32.93],
    [0.36, 32.61, 32.81, 28.79, 31.81, 32.16],
    [0.38, 39.64, 31.18, 32.21, 39.06, 31.1],
    [0.4, 48.08, 29.69, 35.84, 47.91, 29.86],
    [0.42, 58.08, 28.34, 39.68, 58.38, 28.55],
    [0.44, 69.7, 27.1, 43.72, 70.37, 27.23],
    [0.46, 82.9, 25.95, 47.99, 83.7, 25.97],
    [0.48, 97.53, 24.9, 52.46, 98.05, 24.8],
    [0.5, 113.21, 23.91, 57.16, 113.09, 23.75],
    [0.52, 129.42, 23.0, 62.08, 128.47, 22.82],
    [0.54, 145.41, 22.14, 67.23, 143.86, 22.01],
    [0.56, 160.31, 21.33, 72.6, 159.05, 21.3],
    [0.58, 173.16, 20.58, 78.21, 173.92, 20.7],
    [0.6, 182.99, 19.86, 84.04, 188.51, 20.18],
    [0.62, 188.97, 19.19, 90.12, 202.98, 19.72],
    [0.64, 190.51, 18.55, 96.43, 217.64, 19.3],
    [0.66, 187.33, 17.94, 102.98, 232.94, 18.91],
    [0.68, 179.54, 17.36, 109.78, 249.46, 18.51],
    [0.7, 167.63, 16.81, 116.82, 267.94, 18.09],
    [0.72, 152.4, 16.29, 124.12, 289.32, 17.62],
    [0.74, 134.87, 15.79, 131.67, 314.76, 17.09],
    [0.76, 116.16, 15.31, 139.47, 345.77, 16.48],
  ] as const,
};

/** WinISD's default amplifier resistance Rg (Ω, per driver), which its alignments include. */
export const WINISD_RG = 0.1;

/** A driver for WinISD's alignments: Re is needed for the Rg correction (left out when unknown). */
export interface WinisdAlignmentDriver {
  fs: number;
  qms: number;
  qes: number;
  vas_l: number;
  /** DC resistance of one driver's coil (as wired), Ω. */
  re?: number;
}

/** Qts as WinISD's wizard sees it: Qes raised by the amplifier resistance Rg in series with Re. */
export function winisdQts(d: { qms: number; qes: number; re?: number }, rg = WINISD_RG): number {
  const qes = d.re && d.re > 0 ? (d.qes * (d.re + rg)) / d.re : d.qes;
  return (d.qms * qes) / (d.qms + qes);
}

/** Monotone cubic (Fritsch–Carlson / PCHIP) interpolation through (x, y); x increasing. */
function pchip(x: readonly number[], y: readonly number[]): (t: number) => number {
  const n = x.length;
  const h = x.slice(1).map((v, i) => v - x[i]!);
  const s = h.map((hi, i) => (y[i + 1]! - y[i]!) / hi);
  const m = new Array<number>(n);
  m[0] = ((2 * h[0]! + h[1]!) * s[0]! - h[0]! * s[1]!) / (h[0]! + h[1]!);
  if (Math.sign(m[0]) !== Math.sign(s[0]!)) m[0] = 0;
  else if (Math.sign(s[0]!) !== Math.sign(s[1]!) && Math.abs(m[0]) > Math.abs(3 * s[0]!)) m[0] = 3 * s[0]!;
  const k = n - 1;
  m[k] = ((2 * h[k - 1]! + h[k - 2]!) * s[k - 1]! - h[k - 1]! * s[k - 2]!) / (h[k - 1]! + h[k - 2]!);
  if (Math.sign(m[k]) !== Math.sign(s[k - 1]!)) m[k] = 0;
  else if (Math.sign(s[k - 1]!) !== Math.sign(s[k - 2]!) && Math.abs(m[k]) > Math.abs(3 * s[k - 1]!)) m[k] = 3 * s[k - 1]!;
  for (let i = 1; i < k; i++) {
    const a = s[i - 1]!;
    const b = s[i]!;
    if (a * b <= 0) m[i] = 0;
    else {
      const w1 = 2 * h[i]! + h[i - 1]!;
      const w2 = h[i]! + 2 * h[i - 1]!;
      m[i] = (w1 + w2) / (w1 / a + w2 / b);
    }
  }
  return (t: number) => {
    let i = 0;
    while (i < n - 2 && t > x[i + 1]!) i++;
    const hi = h[i]!;
    const u = (t - x[i]!) / hi;
    const u2 = u * u;
    const u3 = u2 * u;
    return (
      (2 * u3 - 3 * u2 + 1) * y[i]! + (u3 - 2 * u2 + u) * hi * m[i]! + (-2 * u3 + 3 * u2) * y[i + 1]! + (u3 - u2) * hi * m[i + 1]!
    );
  };
}

type Curve = { lo: number; hi: number; vb: (q: number) => number; h: (q: number) => number };

/** One alignment's curve over the rows [from, to] of the sweep (WinISD's sensible range). */
function curve(col: number, fbCol: number | null, from: number, to: number): Curve {
  const S = WINISD_SWEEP;
  const rows = S.rows.filter((r) => r[0] >= from - 1e-9 && r[0] <= to + 1e-9);
  // The sweep driver's own WinISD Qts (with Rg), from its nominal Qts.
  const q = rows.map((r) => winisdQts({ qms: S.qms, qes: (r[0] * S.qms) / (S.qms - r[0]), re: S.re }));
  return {
    lo: q[0]!,
    hi: q[q.length - 1]!,
    vb: pchip(q, rows.map((r) => r[col]! / S.vas_l)),
    h: pchip(q, rows.map((r) => (fbCol === null ? 1 : r[fbCol]! / S.fs))),
  };
}

// WinISD's QB3 turns over above Qts ≈ 0.64 (the box shrinks again, tuned ever lower) and its C4
// collapses below 0.20 (0 L at Qts 0.14); those ends aren't offered.
const QB3 = curve(1, 2, 0.14, 0.62);
const BB4 = curve(3, null, 0.14, 0.76);
const C4 = curve(4, 5, 0.2, 0.76);

/** The largest |G(jω)|² above 0 dB (dB) of a vented box h, α with leakage QL (Small 1973). */
function peakDb(h: number, alpha: number, q: number, ql: number): number {
  const a1 = (ql + h * q) / (Math.sqrt(h) * ql * q);
  const a2 = (h + (alpha + 1 + h * h) * ql * q) / (h * ql * q);
  const a3 = (h * ql + q) / (Math.sqrt(h) * ql * q);
  let max = 0;
  for (let i = 0; i <= 2000; i++) {
    const w = 0.1 * 1000 ** (i / 2000);
    const re = w ** 4 - a2 * w * w + 1;
    const im = a3 * w - a1 * w ** 3;
    max = Math.max(max, w ** 8 / (re * re + im * im));
  }
  return 10 * Math.log10(max);
}

function lookUp(c: Curve, d: WinisdAlignmentDriver, drivers: number) {
  const q = winisdQts(d);
  if (!(q >= c.lo - 1e-9 && q <= c.hi + 1e-9)) return null;
  const vb = c.vb(q) * d.vas_l * drivers;
  return vb > 0 ? { q, vb_l: vb, h: c.h(q) } : null;
}

/** The box's peak with WinISD's default leakage (Ql 10), as its responses show it. */
const WINISD_QL = 10;

/** WinISD's QB3: Qts (with Rg) 0.14–0.62. Near-flat to about Qts 0.42; above that it peaks a little. */
export function winisdQb3Alignment(d: WinisdAlignmentDriver, drivers = 1): VentedAlignment | null {
  const r = lookUp(QB3, d, drivers);
  return r && { name: "QB3", vb_l: r.vb_l, fb: r.h * d.fs };
}

/** WinISD's BB4/SBB4: tuned to Fs, Qts (with Rg) 0.14–0.76; SBB4 while the response doesn't peak. */
export function winisdBb4Alignment(d: WinisdAlignmentDriver, drivers = 1): ShapedAlignment | null {
  const r = lookUp(BB4, d, drivers);
  if (!r) return null;
  const db = peakDb(r.h, (d.vas_l * drivers) / r.vb_l, r.q, WINISD_QL);
  const peak = db > 0.05;
  return { name: peak ? "BB4" : "SBB4", vb_l: r.vb_l, fb: d.fs, shape: peak ? "peak" : "flat", db: peak ? db : 0 };
}

/** WinISD's C4/SC4: Qts (with Rg) 0.20–0.76; SC4 (flat) for low Qts, C4 (a small ripple) above. */
export function winisdC4Alignment(d: WinisdAlignmentDriver, drivers = 1): ShapedAlignment | null {
  const r = lookUp(C4, d, drivers);
  if (!r) return null;
  const db = peakDb(r.h, (d.vas_l * drivers) / r.vb_l, r.q, WINISD_QL);
  const ripple = db > 0.05;
  return { name: ripple ? "C4" : "SC4", vb_l: r.vb_l, fb: r.h * d.fs, shape: ripple ? "ripple" : "flat", db: ripple ? db : 0 };
}
