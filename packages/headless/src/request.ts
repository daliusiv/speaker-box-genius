/**
 * SimRequest: what a caller (the MCP server, the CLI) asks for, in plain JSON. Small and
 * friendly at the top (a driver by database id or T/S values, a drive, boxes by volume and
 * tuning) and, for anything else, the same fields the app keeps in share links: a design takes
 * any field of the app's design of that kind, and `settings`, `highPass`, `roomGain`, `baffle`,
 * `passive`, `eq`, `volume`, `compare` take the app's own sections (state.ts). The app's link
 * parser fills in and checks those, so a request means exactly what a link with them means.
 */
import { TS_PARAMS } from "@sbg/engine";
import { DEFAULT_STATE, MAX_DESIGNS, newDesign, type DesignKind } from "../../web/src/state.ts";

export const DESIGN_KINDS = ["sealed", "vented", "pr", "bandpass", "line", "ib", "ob"] as const satisfies readonly DesignKind[];

export const TS_KEYS = Object.keys(TS_PARAMS) as (keyof typeof TS_PARAMS)[];

export interface DriverSpec {
  /** Database id, "brand/model" (search_drivers gives it). Values given beside it override the database's. */
  id?: string;
  name?: string;
  nominal_ohms?: number;
  fs?: number;
  qms?: number;
  qes?: number;
  qts?: number;
  vas_l?: number;
  re?: number;
  sd_cm2?: number;
  mms_g?: number;
  bl?: number;
  cms_mm_per_n?: number;
  rms?: number;
  le_mh?: number;
  l2_mh?: number;
  r2_ohm?: number;
  xmax_mm?: number;
  pe_w?: number;
  /** Thermal: voice-coil thermal resistance (K/W, 0 = estimated) and the coil's maximum temperature (°C). */
  rth_k_w?: number;
  tmax_C?: number;
  /** As the app keeps them (state.ts): semi-inductance, frequency-dependent damping, dual voice coils. */
  semi?: unknown;
  fdd?: unknown;
  dvc?: unknown;
}

export interface PortSpec {
  /** Round port: inside diameter. Or a slot: slot_w_cm × slot_h_cm. */
  diameter_cm?: number;
  slot_w_cm?: number;
  slot_h_cm?: number;
  count?: number;
  /** Physical length. Leave it out with fb_hz to get the length for that tuning. */
  length_cm?: number;
  /** Round-over radius at both ends (0 = straight). */
  flare_cm?: number;
}

export interface PrSpec {
  /** Database PR id (or "driver:<driver id>" for a driver used as a PR). */
  id?: string;
  /** Or the PR's own values. */
  params?: { mms_g: number; sd_cm2: number; xmax_mm: number; qms?: number; vas_l: number };
  name?: string;
  count?: number;
  added_mass_g?: number;
}

export interface DesignSpec {
  kind: DesignKind;
  name?: string;
  vb_l?: number;
  /** Size this box with the app's presets for the driver (WinISD's alignments by default), as "Size all boxes" does. */
  size?: "auto";
  /** Ported or PR box: tune to this. Ported: sets the port length (and picks a port if none is given). PR: sets the added mass. */
  fb_hz?: number;
  port?: PortSpec;
  pr?: PrSpec;
  /** Any other field of the app's design of this kind (state.ts). */
  [field: string]: unknown;
}

export interface OutputSpec {
  from_hz?: number;
  to_hz?: number;
  points_per_octave?: number;
  curves?: CurveName[];
}

export const CURVES = ["spl", "excursion", "port_velocity", "pr_excursion", "impedance", "max_spl", "max_power", "group_delay", "phase"] as const;
export type CurveName = (typeof CURVES)[number];

export interface SimRequest {
  driver: DriverSpec;
  /** Number of drivers in each box. */
  count?: number;
  wiring?: "parallel" | "series";
  isobaric?: boolean;
  isoCoils?: "parallel" | "series";
  /** 1 W into the driver as WinISD (default), a voltage, or the driver's power rating. */
  drive?: { watts: number } | { volts: number } | "rated";
  designs: DesignSpec[];
  settings?: Record<string, unknown>;
  highPass?: Record<string, unknown>;
  roomGain?: Record<string, unknown>;
  baffle?: Record<string, unknown>;
  passive?: Record<string, unknown>;
  eq?: unknown[];
  /** Measured curves overlaid on the charts, as the app keeps them. */
  measured?: unknown[];
  volume?: Record<string, unknown>;
  compare?: Record<string, unknown> | null;
  output?: OutputSpec;
}

export const DEFAULT_OUTPUT: Required<OutputSpec> = { from_hz: 10, to_hz: 200, points_per_octave: 6, curves: ["spl", "excursion", "max_spl"] };
export const MAX_CURVE_POINTS = 400;

const DRIVER_KEYS = ["id", "name", "nominal_ohms", ...TS_KEYS, "le_mh", "l2_mh", "r2_ohm", "xmax_mm", "pe_w", "rth_k_w", "tmax_C", "semi", "fdd", "dvc"];
const NUMERIC_DRIVER_KEYS = new Set(DRIVER_KEYS.filter((k) => !["id", "name", "semi", "fdd", "dvc"].includes(k)));
const SECTION_KEYS = ["settings", "highPass", "roomGain", "baffle", "passive", "volume"] as const;
const TOP_KEYS = ["driver", "count", "wiring", "isobaric", "isoCoils", "drive", "designs", ...SECTION_KEYS, "eq", "measured", "compare", "output"];
const FRIENDLY_DESIGN_KEYS = ["kind", "name", "vb_l", "size", "fb_hz", "port", "pr"];
const PORT_KEYS = ["diameter_cm", "slot_w_cm", "slot_h_cm", "count", "length_cm", "flare_cm"];
const PR_KEYS = ["id", "params", "name", "count", "added_mass_g"];
const OUTPUT_KEYS = ["from_hz", "to_hz", "points_per_octave", "curves"];

/** Fields of the app's design of each kind (as a new design has them). */
export function designFields(kind: DesignKind): string[] {
  return [...Object.keys(newDesign(kind, [])).filter((k) => k !== "id" && k !== "kind" && k !== "on"), ...OPTIONAL_DESIGN_FIELDS[kind]];
}

/** Optional fields of the app's designs (absent on a new design). */
const OPTIONAL_DESIGN_FIELDS: Record<DesignKind, string[]> = {
  sealed: ["preset", "stuffing", "ql"],
  vented: ["preset", "stuffing", "ql", "ventAt", "ventDistance_cm", "flare_cm"],
  pr: ["preset", "stuffing", "ql", "ventAt", "ventDistance_cm", "prId"],
  bandpass: ["preset", "ventDistance_cm"],
  line: ["preset"],
  ib: ["preset"],
  ob: ["preset"],
};

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/** Edit distance, for "did you mean". */
export function distance(a: string, b: string): number {
  const d = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = d[0]!;
    d[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const t = d[j]!;
      d[j] = Math.min(d[j]! + 1, d[j - 1]! + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = t;
    }
  }
  return d[b.length]!;
}

export function didYouMean(key: string, allowed: readonly string[]): string {
  const lower = key.toLowerCase();
  const best = allowed
    .map((k) => ({ k, d: k.toLowerCase().startsWith(lower) || lower.startsWith(k.toLowerCase()) ? 1 : distance(lower, k.toLowerCase()) }))
    .sort((a, b) => a.d - b.d)[0];
  return best && best.d <= Math.max(2, Math.floor(key.length / 3)) ? `, did you mean \`${best.k}\`?` : "";
}

function unknownKeys(o: Record<string, unknown>, allowed: readonly string[], path: string, errors: string[]) {
  for (const k of Object.keys(o)) {
    if (!allowed.includes(k)) errors.push(`${path}: unknown key \`${k}\`${didYouMean(k, allowed)}`);
  }
}

function positive(o: Record<string, unknown>, key: string, path: string, errors: string[], allowZero = false) {
  const v = o[key];
  if (v === undefined) return;
  if (!isNum(v) || v < 0 || (!allowZero && v === 0)) errors.push(`${path}.${key}: must be a number ${allowZero ? "≥ 0" : "> 0"} (got ${JSON.stringify(v)})`);
}

/** Checks a request's shape; returns the errors (empty when it's fine), each naming the field. */
export function validateRequest(raw: unknown): string[] {
  const errors: string[] = [];
  if (!isObj(raw)) return ["request: must be an object"];
  unknownKeys(raw, TOP_KEYS, "request", errors);

  const drv = raw.driver;
  if (!isObj(drv)) errors.push("driver: required, an object: { id } from search_drivers, or T/S values (fs, qts or qes + qms, vas_l, re, …)");
  else {
    unknownKeys(drv, DRIVER_KEYS, "driver", errors);
    if (drv.id !== undefined && typeof drv.id !== "string") errors.push("driver.id: must be a string like \"dayton-audio/rss315hf-4\"");
    if (drv.name !== undefined && typeof drv.name !== "string") errors.push("driver.name: must be a string");
    for (const k of NUMERIC_DRIVER_KEYS) positive(drv, k, "driver", errors, ["le_mh", "l2_mh", "r2_ohm", "xmax_mm", "pe_w", "rms", "rth_k_w"].includes(k));
    const qs = ["qts", "qes", "qms"].filter((k) => isNum(drv[k])).length;
    if (drv.id === undefined && !(isNum(drv.fs) && isNum(drv.vas_l) && isNum(drv.re) && qs >= 2)) {
      errors.push("driver: without an id it needs at least fs, vas_l, re and two of qts, qes, qms");
    }
  }

  if (raw.count !== undefined && !(Number.isInteger(raw.count) && (raw.count as number) >= 1 && (raw.count as number) <= 16)) errors.push("count: a whole number of drivers, 1–16");
  if (raw.wiring !== undefined && raw.wiring !== "parallel" && raw.wiring !== "series") errors.push('wiring: "parallel" or "series"');
  if (raw.isoCoils !== undefined && raw.isoCoils !== "parallel" && raw.isoCoils !== "series") errors.push('isoCoils: "parallel" or "series"');
  if (raw.isobaric !== undefined && typeof raw.isobaric !== "boolean") errors.push("isobaric: true or false");

  const drive = raw.drive;
  if (drive !== undefined && drive !== "rated") {
    if (!isObj(drive)) errors.push('drive: { "watts": 1 }, { "volts": 2.83 } or "rated"');
    else {
      unknownKeys(drive, ["watts", "volts"], "drive", errors);
      const n = ["watts", "volts"].filter((k) => drive[k] !== undefined).length;
      if (n !== 1) errors.push("drive: give either watts or volts");
      positive(drive, "watts", "drive", errors);
      positive(drive, "volts", "drive", errors);
    }
  }

  if (!Array.isArray(raw.designs) || raw.designs.length === 0) errors.push("designs: required, a list of 1–8 boxes, e.g. [{ \"kind\": \"vented\", \"size\": \"auto\" }]");
  else {
    if (raw.designs.length > MAX_DESIGNS) errors.push(`designs: at most ${MAX_DESIGNS} (the app's limit)`);
    raw.designs.forEach((d, i) => validateDesign(d, `designs[${i}]`, errors));
  }

  for (const k of SECTION_KEYS) {
    const v = raw[k];
    if (v === undefined) continue;
    if (!isObj(v)) errors.push(`${k}: must be an object`);
    else unknownKeys(v, Object.keys(DEFAULT_STATE[k] as object), k, errors);
  }
  if (raw.eq !== undefined && !Array.isArray(raw.eq)) errors.push("eq: must be a list of EQ stages, as the app keeps them");
  if (raw.measured !== undefined && !Array.isArray(raw.measured)) errors.push("measured: must be a list of curves, as the app keeps them");
  if (raw.compare !== undefined && raw.compare !== null && !isObj(raw.compare)) errors.push("compare: an object (the comparison driver, as the app keeps it) or null");

  const out = raw.output;
  if (out !== undefined) {
    if (!isObj(out)) errors.push("output: must be an object");
    else {
      unknownKeys(out, OUTPUT_KEYS, "output", errors);
      positive(out, "from_hz", "output", errors);
      positive(out, "to_hz", "output", errors);
      positive(out, "points_per_octave", "output", errors);
      if (isNum(out.from_hz) && isNum(out.to_hz) && out.from_hz >= out.to_hz) errors.push("output: from_hz must be below to_hz");
      if (out.curves !== undefined) {
        if (!Array.isArray(out.curves)) errors.push(`output.curves: a list of ${CURVES.join(", ")}`);
        else for (const c of out.curves) if (!(CURVES as readonly string[]).includes(c as string)) errors.push(`output.curves: unknown curve \`${c}\`${didYouMean(String(c), CURVES)}`);
      }
    }
  }
  return errors;
}

function validateDesign(d: unknown, path: string, errors: string[]) {
  if (!isObj(d)) {
    errors.push(`${path}: must be an object with a kind`);
    return;
  }
  if (!(DESIGN_KINDS as readonly string[]).includes(d.kind as string)) {
    errors.push(`${path}.kind: one of ${DESIGN_KINDS.join(", ")}${typeof d.kind === "string" ? didYouMean(d.kind, DESIGN_KINDS) : ""}`);
    return;
  }
  const kind = d.kind as DesignKind;
  unknownKeys(d, [...FRIENDLY_DESIGN_KEYS, ...designFields(kind)], path, errors);
  if (d.name !== undefined && typeof d.name !== "string") errors.push(`${path}.name: must be a string`);
  positive(d, "vb_l", path, errors);
  positive(d, "fb_hz", path, errors);
  if (d.size !== undefined && d.size !== "auto") errors.push(`${path}.size: only "auto"`);
  if (d.size === "auto" && !["sealed", "vented", "pr", "bandpass"].includes(kind)) errors.push(`${path}.size: "auto" sizes sealed, vented, pr and bandpass boxes`);
  if (d.fb_hz !== undefined && kind !== "vented" && kind !== "pr") errors.push(`${path}.fb_hz: only for vented and pr boxes`);
  if (d.size === "auto" && d.fb_hz !== undefined) errors.push(`${path}: give size "auto" or fb_hz, not both`);
  if (d.port !== undefined) {
    if (kind !== "vented") errors.push(`${path}.port: only for vented boxes`);
    else if (!isObj(d.port)) errors.push(`${path}.port: must be an object`);
    else {
      unknownKeys(d.port, PORT_KEYS, `${path}.port`, errors);
      for (const k of ["diameter_cm", "slot_w_cm", "slot_h_cm", "length_cm"]) positive(d.port, k, `${path}.port`, errors);
      positive(d.port, "flare_cm", `${path}.port`, errors, true);
      if (d.port.count !== undefined && !(Number.isInteger(d.port.count) && (d.port.count as number) >= 1)) errors.push(`${path}.port.count: a whole number ≥ 1`);
      if (d.port.diameter_cm !== undefined && (d.port.slot_w_cm !== undefined || d.port.slot_h_cm !== undefined)) errors.push(`${path}.port: a round port (diameter_cm) or a slot (slot_w_cm, slot_h_cm), not both`);
      if ((d.port.slot_w_cm === undefined) !== (d.port.slot_h_cm === undefined)) errors.push(`${path}.port: a slot needs both slot_w_cm and slot_h_cm`);
    }
  }
  if (d.pr !== undefined) {
    if (kind !== "pr") errors.push(`${path}.pr: only for pr boxes`);
    else if (!isObj(d.pr)) errors.push(`${path}.pr: must be an object`);
    else {
      unknownKeys(d.pr, PR_KEYS, `${path}.pr`, errors);
      if (d.pr.id === undefined && d.pr.params === undefined && d.size !== "auto") errors.push(`${path}.pr: give an id (find_passive_radiators or search) or params`);
      if (d.pr.id !== undefined && typeof d.pr.id !== "string") errors.push(`${path}.pr.id: must be a string`);
      if (d.pr.params !== undefined) {
        if (!isObj(d.pr.params)) errors.push(`${path}.pr.params: must be an object`);
        else {
          unknownKeys(d.pr.params, ["mms_g", "sd_cm2", "xmax_mm", "qms", "vas_l"], `${path}.pr.params`, errors);
          for (const k of ["mms_g", "sd_cm2", "xmax_mm", "vas_l"]) {
            if (!isNum(d.pr.params[k]) || (d.pr.params[k] as number) <= 0) errors.push(`${path}.pr.params.${k}: required, > 0`);
          }
          positive(d.pr.params, "qms", `${path}.pr.params`, errors);
        }
      }
      if (d.pr.count !== undefined && !(Number.isInteger(d.pr.count) && (d.pr.count as number) >= 1)) errors.push(`${path}.pr.count: a whole number ≥ 1`);
      positive(d.pr, "added_mass_g", `${path}.pr`, errors, true);
      if (d.pr.added_mass_g !== undefined && d.fb_hz !== undefined) errors.push(`${path}: give pr.added_mass_g or fb_hz, not both`);
    }
  }
}

/** The request's output options with defaults filled in and the point count capped. */
export function outputOf(req: Pick<SimRequest, "output">): Required<OutputSpec> {
  const o = { ...DEFAULT_OUTPUT, ...(req.output ?? {}) };
  const octaves = Math.log2(o.to_hz / o.from_hz);
  const ppo = Math.max(1, Math.min(o.points_per_octave, Math.floor((MAX_CURVE_POINTS - 1) / Math.max(octaves, 1e-9))));
  return { ...o, points_per_octave: ppo };
}
