import { qts } from "./ts.ts";

/**
 * Closed-box (sealed) alignment, closed-form.
 * Used as an analytic check for the full circuit solver in Phase 0.
 */
export function sealedAlignment(p: { fs: number; qms: number; qes: number; vas_l: number }, vb_l: number) {
  const alpha = p.vas_l / vb_l;
  const k = Math.sqrt(1 + alpha);
  return {
    /** System resonance (Hz) */
    fc: p.fs * k,
    /** System total Q (ignores box losses) */
    qtc: qts(p.qms, p.qes) * k,
  };
}

/** Box volume (litres) that gives a target Qtc. */
export function sealedVolumeForQtc(p: { qms: number; qes: number; vas_l: number }, targetQtc: number): number {
  const q = qts(p.qms, p.qes);
  const ratio = (targetQtc / q) ** 2 - 1;
  if (ratio <= 0) throw new RangeError(`Driver Qts ${q.toFixed(3)} is already above the target Qtc ${targetQtc}`);
  return p.vas_l / ratio;
}
