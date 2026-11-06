/**
 * Data formats for the Speaker Box Genius database.
 *
 * Deliberately dependency-free so it runs in CI, in the browser and with
 * plain `node --experimental-strip-types`.
 *
 * Units are encoded in field names (e.g. `vas_l`, `sd_cm2`) so JSON files
 * are self-describing for contributors.
 */

export const DRIVER_TYPES = [
  "woofer",
  "subwoofer",
  "midbass",
  "midrange",
  "full-range",
  "car-audio",
  "other",
] as const;
export type DriverType = (typeof DRIVER_TYPES)[number];

export const SOURCE_KINDS = ["datasheet", "measured", "community"] as const;
export type SourceKind = (typeof SOURCE_KINDS)[number];

export const STATUSES = ["community", "verified"] as const;
export type Status = (typeof STATUSES)[number];

export interface Source {
  kind: SourceKind;
  url?: string;
  retrieved?: string; // YYYY-MM-DD
  by?: string; // e.g. "github:alice"
  method?: string; // e.g. "DATS v3, added mass"
  file?: string; // repo-relative path to a .zma
  note?: string;
}

export interface Physical {
  displacement_l?: number;
  cutout_mm?: number;
  depth_mm?: number;
}

export interface DriverTS {
  fs: number; // Hz
  qms: number;
  qes: number;
  qts?: number;
  vas_l: number; // litres
  re: number; // ohms
  le_mh?: number;
  /** Optional L2R2 voice-coil model: Le + (L2 ∥ R2). Both or neither. */
  l2_mh?: number;
  r2_ohm?: number;
  bl?: number; // T·m
  mms_g?: number;
  sd_cm2: number;
  xmax_mm?: number; // one-way linear excursion
  pe_w?: number; // thermal power handling, RMS
}

export interface Driver {
  brand: string;
  model: string;
  type: DriverType;
  nominal_ohms: number;
  size_in?: number;
  ts: DriverTS;
  physical?: Physical;
  sources: Source[];
  status: Status;
  notes?: string;
  /** 2 for dual voice coil drivers. Omit for single-coil drivers. */
  voice_coils?: 1 | 2;
  /**
   * DVC only: how the coils were wired when `ts` and `nominal_ohms` were
   * measured (manufacturers differ — Dayton Ultimax/Max-X use series).
   */
  ts_wiring?: "series" | "parallel";
  /**
   * Set when published parameters genuinely disagree with each other by more
   * than 15 % (it happens). Explains why, and downgrades the CI error to a warning.
   * Maintainers should check these entries when reviewing.
   */
  inconsistency_reason?: string;
}

export interface PassiveRadiatorParams {
  fs?: number; // Hz, no added mass
  qms?: number;
  vas_l?: number;
  mms_g: number; // no added mass
  cms_mm_per_n?: number;
  sd_cm2: number;
  xmax_mm: number;
  max_added_mass_g?: number;
}

export interface PassiveRadiator {
  brand: string;
  model: string;
  type: "passive-radiator";
  size_in?: number;
  params: PassiveRadiatorParams;
  physical?: Physical;
  sources: Source[];
  status: Status;
  notes?: string;
}

export interface Brand {
  name: string;
  website?: string;
  country?: string;
  /**
   * Terms that replace the database's CC BY-NC-SA 4.0 licence for this brand's
   * entries, when the manufacturer allowed use in Speaker Box Genius but not
   * under Creative Commons (listed in LICENSE-DATA). Absent = CC BY-NC-SA 4.0.
   */
  licence?: string;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/** Plausible ranges; values outside are almost always typos or unit mix-ups. */
const RANGES: Record<string, [number, number]> = {
  fs: [5, 5000],
  qms: [0.3, 100],
  qes: [0.05, 20],
  qts: [0.05, 5],
  vas_l: [0.001, 10000],
  re: [0.1, 64],
  le_mh: [0, 20],
  l2_mh: [0.001, 50],
  r2_ohm: [0.01, 1000],
  bl: [0.1, 100],
  mms_g: [0.05, 2000],
  sd_cm2: [1, 10000],
  xmax_mm: [0.05, 100],
  pe_w: [0.1, 20000],
  nominal_ohms: [0.5, 64],
  size_in: [0.5, 30],
  displacement_l: [0.0001, 100],
  cutout_mm: [10, 1000],
  depth_mm: [5, 600],
  cms_mm_per_n: [0.001, 50],
  max_added_mass_g: [0, 5000],
};

type Errors = string[];

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function checkKeys(obj: Record<string, unknown>, allowed: readonly string[], path: string, errors: Errors) {
  for (const k of Object.keys(obj)) {
    if (!allowed.includes(k)) errors.push(`${path}: unknown field "${k}"`);
  }
}

function num(obj: Record<string, unknown>, key: string, path: string, errors: Errors, required: boolean) {
  const v = obj[key];
  if (v === undefined) {
    if (required) errors.push(`${path}.${key}: required`);
    return;
  }
  if (typeof v !== "number" || !Number.isFinite(v)) {
    errors.push(`${path}.${key}: must be a number (got ${JSON.stringify(v)})`);
    return;
  }
  const range = RANGES[key];
  if (range && (v < range[0] || v > range[1])) {
    let hint = "check units";
    if (key.endsWith("_mm") && v * 25.4 >= range[0] && v * 25.4 <= range[1]) {
      hint = `if that's inches, ${v} in is ${(v * 25.4).toFixed(1)} mm`;
    } else if (key.endsWith("_l") && v * 28.3168 >= range[0] && v < range[0]) {
      hint = `if that's cubic feet, it's ${(v * 28.3168).toFixed(1)} L`;
    }
    errors.push(`${path}.${key}: ${v} is outside the plausible range ${range[0]}–${range[1]} (${hint})`);
  }
}

function str(obj: Record<string, unknown>, key: string, path: string, errors: Errors, required: boolean) {
  const v = obj[key];
  if (v === undefined) {
    if (required) errors.push(`${path}.${key}: required`);
    return;
  }
  if (typeof v !== "string" || v.trim() === "") errors.push(`${path}.${key}: must be a non-empty string`);
}

function oneOf(obj: Record<string, unknown>, key: string, allowed: readonly string[], path: string, errors: Errors) {
  const v = obj[key];
  if (typeof v !== "string" || !allowed.includes(v)) {
    errors.push(`${path}.${key}: must be one of ${allowed.join(", ")} (got ${JSON.stringify(v)})`);
  }
}

function validatePhysical(v: unknown, errors: Errors) {
  if (v === undefined) return;
  if (!isObj(v)) return void errors.push("physical: must be an object");
  checkKeys(v, ["displacement_l", "cutout_mm", "depth_mm"], "physical", errors);
  for (const k of ["displacement_l", "cutout_mm", "depth_mm"]) num(v, k, "physical", errors, false);
}

function validateSources(v: unknown, errors: Errors) {
  if (!Array.isArray(v) || v.length === 0) {
    errors.push("sources: at least one source is required (datasheet link or your own measurement)");
    return;
  }
  v.forEach((s, i) => {
    const p = `sources[${i}]`;
    if (!isObj(s)) return void errors.push(`${p}: must be an object`);
    checkKeys(s, ["kind", "url", "retrieved", "by", "method", "file", "note"], p, errors);
    oneOf(s, "kind", SOURCE_KINDS, p, errors);
    for (const k of ["url", "retrieved", "by", "method", "file", "note"]) str(s, k, p, errors, false);
    if (typeof s.url === "string" && !/^https?:\/\//.test(s.url)) errors.push(`${p}.url: must start with http:// or https://`);
    if (typeof s.retrieved === "string" && !/^\d{4}-\d{2}-\d{2}$/.test(s.retrieved)) {
      errors.push(`${p}.retrieved: use YYYY-MM-DD`);
    }
    if (s.kind === "datasheet" && s.url === undefined) errors.push(`${p}: a datasheet source needs a url`);
    if (s.kind === "measured" && s.method === undefined) errors.push(`${p}: a measured source needs a method`);
  });
}

function validateCommon(d: Record<string, unknown>, errors: Errors) {
  str(d, "brand", "", errors, true);
  str(d, "model", "", errors, true);
  str(d, "notes", "", errors, false);
  num(d, "size_in", "", errors, false);
  oneOf(d, "status", STATUSES, "", errors);
  validatePhysical(d.physical, errors);
  validateSources(d.sources, errors);
}

/** Returns a list of human-readable problems; empty means valid. */
export function validateDriver(data: unknown): Errors {
  const errors: Errors = [];
  if (!isObj(data)) return ["file must contain a JSON object"];
  checkKeys(data, ["brand", "model", "type", "nominal_ohms", "size_in", "ts", "physical", "sources", "status", "notes", "inconsistency_reason", "voice_coils", "ts_wiring"], "", errors);
  if (data.voice_coils !== undefined && data.voice_coils !== 1 && data.voice_coils !== 2) {
    errors.push("voice_coils: must be 1 or 2");
  }
  if (data.voice_coils === 2) {
    oneOf(data, "ts_wiring", ["series", "parallel"], "", errors);
  } else if (data.ts_wiring !== undefined) {
    errors.push('ts_wiring: only for dual voice coil drivers (set "voice_coils": 2)');
  }
  validateCommon(data, errors);
  str(data, "inconsistency_reason", "", errors, false);
  oneOf(data, "type", DRIVER_TYPES, "", errors);
  num(data, "nominal_ohms", "", errors, true);

  const ts = data.ts;
  if (!isObj(ts)) {
    errors.push("ts: required object with Thiele/Small parameters");
  } else {
    const required = ["fs", "qms", "qes", "vas_l", "re", "sd_cm2"];
    const optional = ["qts", "le_mh", "l2_mh", "r2_ohm", "bl", "mms_g", "xmax_mm", "pe_w"];
    checkKeys(ts, [...required, ...optional], "ts", errors);
    for (const k of required) num(ts, k, "ts", errors, true);
    for (const k of optional) num(ts, k, "ts", errors, false);
    if ((ts.l2_mh === undefined) !== (ts.r2_ohm === undefined)) errors.push("ts: l2_mh and r2_ohm go together (give both or neither)");
  }
  return errors.map((e) => e.replace(/^\./, ""));
}

export function validatePassiveRadiator(data: unknown): Errors {
  const errors: Errors = [];
  if (!isObj(data)) return ["file must contain a JSON object"];
  checkKeys(data, ["brand", "model", "type", "size_in", "params", "physical", "sources", "status", "notes"], "", errors);
  validateCommon(data, errors);
  if (data.type !== "passive-radiator") errors.push('type: must be "passive-radiator"');

  const p = data.params;
  if (!isObj(p)) {
    errors.push("params: required object");
  } else {
    const required = ["mms_g", "sd_cm2", "xmax_mm"];
    const optional = ["fs", "qms", "vas_l", "cms_mm_per_n", "max_added_mass_g"];
    checkKeys(p, [...required, ...optional], "params", errors);
    for (const k of required) num(p, k, "params", errors, true);
    for (const k of optional) num(p, k, "params", errors, false);
    if (p.fs === undefined && p.vas_l === undefined && p.cms_mm_per_n === undefined) {
      errors.push("params: give at least one of fs, vas_l or cms_mm_per_n so compliance can be calculated");
    }
  }
  return errors.map((e) => e.replace(/^\./, ""));
}

export function validateBrand(data: unknown): Errors {
  const errors: Errors = [];
  if (!isObj(data)) return ["file must contain a JSON object"];
  checkKeys(data, ["name", "website", "country", "licence"], "", errors);
  str(data, "name", "", errors, true);
  str(data, "website", "", errors, false);
  str(data, "country", "", errors, false);
  str(data, "licence", "", errors, false);
  return errors.map((e) => e.replace(/^\./, ""));
}

/** Lowercase letters, digits and single hyphens. */
export const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
