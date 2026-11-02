import { C, RHO } from "./constants.ts";

/**
 * Thiele/Small parameter solver.
 *
 * WinISD recalculates parameters in a fixed cascade, so typing values in the
 * "wrong" order overwrites what you entered. This solver never changes an
 * entered value: it only fills in the gaps, and reports every place where the
 * entered values disagree with each other.
 *
 * Values are in datasheet units (see TS_PARAMS); conversion to SI is internal.
 */

export const TS_PARAMS = {
  fs: { label: "Fs", unit: "Hz", si: 1 },
  qms: { label: "Qms", unit: "", si: 1 },
  qes: { label: "Qes", unit: "", si: 1 },
  qts: { label: "Qts", unit: "", si: 1 },
  vas_l: { label: "Vas", unit: "L", si: 1e-3 },
  re: { label: "Re", unit: "Ω", si: 1 },
  sd_cm2: { label: "Sd", unit: "cm²", si: 1e-4 },
  mms_g: { label: "Mms", unit: "g", si: 1e-3 },
  cms_mm_per_n: { label: "Cms", unit: "mm/N", si: 1e-3 },
  bl: { label: "Bl", unit: "T·m", si: 1 },
  rms: { label: "Rms", unit: "kg/s", si: 1 },
} as const;

export type TsParam = keyof typeof TS_PARAMS;
export type TsValues = Partial<Record<TsParam, number>>;

/** What the simulator needs (everything else is optional). */
export const SIM_REQUIRED: TsParam[] = ["fs", "qms", "qes", "vas_l", "re", "sd_cm2"];

type SiValues = Partial<Record<TsParam, number>>;

interface Relation {
  name: string;
  vars: TsParam[];
  /** Solve for one variable given all the others (SI units). */
  solve: (v: Required<SiValues>, target: TsParam) => number;
}

const K = RHO * C * C;
const tau = 2 * Math.PI;

const RELATIONS: Relation[] = [
  {
    name: "Qts = Qms·Qes / (Qms + Qes)",
    vars: ["qts", "qms", "qes"],
    solve: (v, t) =>
      t === "qts" ? (v.qms * v.qes) / (v.qms + v.qes) : t === "qms" ? (v.qts * v.qes) / (v.qes - v.qts) : (v.qts * v.qms) / (v.qms - v.qts),
  },
  {
    name: "Vas = ρc²·Sd²·Cms",
    vars: ["vas_l", "sd_cm2", "cms_mm_per_n"],
    solve: (v, t) =>
      t === "vas_l"
        ? K * v.sd_cm2 ** 2 * v.cms_mm_per_n
        : t === "cms_mm_per_n"
          ? v.vas_l / (K * v.sd_cm2 ** 2)
          : Math.sqrt(v.vas_l / (K * v.cms_mm_per_n)),
  },
  {
    name: "Fs = 1 / (2π·√(Mms·Cms))",
    vars: ["fs", "mms_g", "cms_mm_per_n"],
    solve: (v, t) =>
      t === "fs"
        ? 1 / (tau * Math.sqrt(v.mms_g * v.cms_mm_per_n))
        : t === "mms_g"
          ? 1 / ((tau * v.fs) ** 2 * v.cms_mm_per_n)
          : 1 / ((tau * v.fs) ** 2 * v.mms_g),
  },
  {
    name: "Qes = 2π·Fs·Mms·Re / Bl²",
    vars: ["qes", "fs", "mms_g", "re", "bl"],
    solve: (v, t) => {
      switch (t) {
        case "qes":
          return (tau * v.fs * v.mms_g * v.re) / v.bl ** 2;
        case "bl":
          return Math.sqrt((tau * v.fs * v.mms_g * v.re) / v.qes);
        case "re":
          return (v.qes * v.bl ** 2) / (tau * v.fs * v.mms_g);
        case "mms_g":
          return (v.qes * v.bl ** 2) / (tau * v.fs * v.re);
        default:
          return (v.qes * v.bl ** 2) / (tau * v.mms_g * v.re);
      }
    },
  },
  {
    name: "Qms = 2π·Fs·Mms / Rms",
    vars: ["qms", "fs", "mms_g", "rms"],
    solve: (v, t) => {
      switch (t) {
        case "qms":
          return (tau * v.fs * v.mms_g) / v.rms;
        case "rms":
          return (tau * v.fs * v.mms_g) / v.qms;
        case "mms_g":
          return (v.qms * v.rms) / (tau * v.fs);
        default:
          return (v.qms * v.rms) / (tau * v.mms_g);
      }
    },
  },
];

export interface Conflict {
  relation: string;
  /** The entered parameter that disagrees, and the value the others imply. */
  param: TsParam;
  entered: number;
  implied: number;
  diff: number;
  message: string;
}

export interface SolveResult {
  values: TsValues;
  source: Partial<Record<TsParam, "entered" | "derived">>;
  conflicts: Conflict[];
  /** Simulation inputs that could not be determined. */
  missing: TsParam[];
}

const toSi = (p: TsParam, v: number) => v * TS_PARAMS[p].si;
const fromSi = (p: TsParam, v: number) => v / TS_PARAMS[p].si;

/**
 * @param entered values typed by the user (datasheet units). Never modified.
 * @param tolerance relative difference above which entered values are reported as conflicting
 */
export function solveTs(entered: TsValues, tolerance = 0.03): SolveResult {
  const si: SiValues = {};
  const source: SolveResult["source"] = {};
  for (const [k, v] of Object.entries(entered) as [TsParam, number | undefined][]) {
    if (v !== undefined && Number.isFinite(v) && v > 0) {
      si[k] = toSi(k, v);
      source[k] = "entered";
    }
  }

  // Propagate: any relation with exactly one unknown determines it.
  let progress = true;
  while (progress) {
    progress = false;
    for (const r of RELATIONS) {
      const unknown = r.vars.filter((p) => si[p] === undefined);
      if (unknown.length !== 1) continue;
      const t = unknown[0]!;
      const val = r.solve(si as Required<SiValues>, t);
      if (Number.isFinite(val) && val > 0) {
        si[t] = val;
        source[t] = "derived";
        progress = true;
      }
    }
  }

  // Check every fully-known relation; blame the entered parameters in it.
  const conflicts: Conflict[] = [];
  const seen = new Set<string>();
  for (const r of RELATIONS) {
    if (r.vars.some((p) => si[p] === undefined)) continue;
    const enteredVars = r.vars.filter((p) => source[p] === "entered");
    if (enteredVars.length < 2 && !r.vars.some((p) => source[p] === "derived")) continue;
    for (const p of enteredVars) {
      const implied = r.solve(si as Required<SiValues>, p);
      const actual = si[p]!;
      const diff = Math.abs(actual - implied) / implied;
      if (!(diff > tolerance)) continue;
      const key = `${r.name}|${p}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const meta = TS_PARAMS[p];
      const imp = fromSi(p, implied);
      conflicts.push({
        relation: r.name,
        param: p,
        entered: fromSi(p, actual),
        implied: imp,
        diff,
        message: `${meta.label}: the other values imply ${fmt(imp)}${meta.unit ? " " + meta.unit : ""}, you entered ${fmt(fromSi(p, actual))} (${(diff * 100).toFixed(1)}% off, via ${r.name})`,
      });
    }
  }

  const values: TsValues = {};
  for (const [k, v] of Object.entries(si) as [TsParam, number][]) values[k] = fromSi(k, v);
  return { values, source, conflicts, missing: SIM_REQUIRED.filter((p) => values[p] === undefined) };
}

function fmt(v: number): string {
  if (v >= 100) return v.toFixed(1);
  if (v >= 10) return v.toFixed(2);
  if (v >= 1) return v.toFixed(3);
  return v.toPrecision(3);
}
