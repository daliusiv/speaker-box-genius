import { C, RHO } from "./constants.ts";

/**
 * Thiele/Small helper maths (SI units internally).
 *
 * The full constraint-graph parameter solver (plan §5) will grow from here.
 */

export interface SmallSignal {
  fs: number; // Hz
  qms: number;
  qes: number;
  vas_l: number; // litres
  re: number; // ohms
  sd_cm2: number;
  mms_g?: number;
  bl?: number;
}

export const qts = (qms: number, qes: number) => (qms * qes) / (qms + qes);

/** Suspension compliance Cms (m/N) from Vas and Sd. */
export function cmsFromVas(vas_l: number, sd_cm2: number): number {
  const vas = vas_l / 1000;
  const sd = sd_cm2 / 10000;
  return vas / (RHO * C * C * sd * sd);
}

/** Moving mass Mms (kg) from fs and Cms. */
export function mmsFromFsCms(fs: number, cms: number): number {
  const w = 2 * Math.PI * fs;
  return 1 / (w * w * cms);
}

/** Force factor Bl (T·m) from fs, Mms (kg), Re and Qes. */
export function blFromQes(fs: number, mms: number, re: number, qes: number): number {
  return Math.sqrt((2 * Math.PI * fs * mms * re) / qes);
}

export interface ConsistencyIssue {
  param: string;
  published: number;
  implied: number;
  /** Relative difference, e.g. 0.08 = 8 % */
  diff: number;
  message: string;
}

/**
 * Compare published Mms and Bl with what fs, Vas, Sd, Re and Qes imply.
 * Datasheets often disagree by a few percent through rounding, so callers
 * decide which tolerance counts as a warning and which as an error.
 */
export function checkConsistency(p: SmallSignal): ConsistencyIssue[] {
  const issues: ConsistencyIssue[] = [];
  const cms = cmsFromVas(p.vas_l, p.sd_cm2);
  const mmsImplied = mmsFromFsCms(p.fs, cms); // kg

  if (p.mms_g !== undefined) {
    const implied = mmsImplied * 1000;
    const diff = Math.abs(p.mms_g - implied) / implied;
    issues.push({
      param: "mms_g",
      published: p.mms_g,
      implied,
      diff,
      message: `fs, Vas and Sd imply Mms ≈ ${implied.toFixed(1)} g; published ${p.mms_g} g (${(diff * 100).toFixed(1)}% off)`,
    });
  }

  if (p.bl !== undefined) {
    // Use the published Mms if given (Bl is usually derived from it), else the implied one.
    const mms = p.mms_g !== undefined ? p.mms_g / 1000 : mmsImplied;
    const implied = blFromQes(p.fs, mms, p.re, p.qes);
    const diff = Math.abs(p.bl - implied) / implied;
    issues.push({
      param: "bl",
      published: p.bl,
      implied,
      diff,
      message: `fs, Mms, Re and Qes imply Bl ≈ ${implied.toFixed(2)} T·m; published ${p.bl} T·m (${(diff * 100).toFixed(1)}% off)`,
    });
  }
  return issues;
}
