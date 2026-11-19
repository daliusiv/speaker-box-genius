/**
 * One way to build and check a database entry from a submission, shared by the
 * GitHub issue form (issue.ts), the website form (packages/web) and the submit
 * Worker (packages/submit-worker). Pure: no `fs`, so a browser and a Worker can
 * bundle it.
 *
 * - `buildRecord(fields, via)` turns typed values into the record that would be
 *   written to `drivers/<brand>/<model>.json` (or `passive-radiators/…`).
 * - `checkRecord(built, opts)` runs every check CI runs on that file (schema,
 *   consistency, Vd-as-displacement, plausibility) plus easy-to-miss submission
 *   mistakes, and returns each problem with the form field it belongs to, so a
 *   form can show them all at once next to the field.
 */
import { checkConsistency } from "../../engine/src/ts.ts";
import {
  SLUG_RE,
  validateDriver,
  validatePassiveRadiator,
  type Driver,
  type PassiveRadiator,
} from "../../schema/src/index.ts";
import { driverFlags, passiveRadiatorFlags } from "./plausibility.ts";

/** Relative differences above these fail CI / only warn. */
export const CONSISTENCY_ERROR = 0.15;
export const CONSISTENCY_WARN = 0.05;

export type SubmissionKind = "driver" | "passive-radiator";

export const TS_KEYS = ["fs", "qms", "qes", "qts", "vas_l", "re", "le_mh", "bl", "mms_g", "sd_cm2", "xmax_mm", "pe_w"] as const;
export const PR_KEYS = ["fs", "qms", "vas_l", "mms_g", "cms_mm_per_n", "sd_cm2", "xmax_mm", "xmech_mm", "max_added_mass_g"] as const;
export const PHYSICAL_KEYS = ["displacement_l", "cutout_mm", "depth_mm"] as const;

/** Most characters a credit name can have. */
export const CREDIT_MAX = 40;
/** Most characters an explanation of a flagged value can have. */
export const REASON_MAX = 300;

/** What a submitter typed, already as numbers in database units. Unknown keys are ignored. */
export interface SubmissionFields {
  kind: SubmissionKind;
  brand: string;
  model: string;
  /** Driver type (drivers only). */
  type?: string;
  /** Nominal impedance; for a dual voice coil driver, one coil's (the record stores it for the T/S wiring). */
  nominal_ohms?: number;
  voice_coils?: 1 | 2;
  ts_wiring?: "series" | "parallel";
  size_in?: number;
  ts?: Partial<Record<(typeof TS_KEYS)[number], number>>;
  params?: Partial<Record<(typeof PR_KEYS)[number], number>>;
  physical?: Partial<Record<(typeof PHYSICAL_KEYS)[number], number>>;
  source_url?: string;
  /** Issue form only: how the submitter measured it (becomes a second, measured source). */
  measured?: string;
  /** Website form only: "the datasheet really says this" for a value the checks flag. */
  inconsistency_reason?: string;
}

export type Via =
  | { kind: "issue"; issue: number; author: string; today: string }
  | { kind: "web"; today: string; credit?: string };

export interface BuiltRecord {
  kind: SubmissionKind;
  brand: string;
  brandSlug: string;
  modelSlug: string;
  record: Record<string, unknown>;
}

export interface Problem {
  /** Form field the problem belongs to: "brand", "model", "nominal_ohms", "ts.fs", "params.xmax_mm", "physical.cutout_mm", "source_url", … or "" for the whole entry. */
  field: string;
  message: string;
}

export interface CheckResult {
  /** Must be fixed: CI would reject the file. */
  errors: Problem[];
  /** Worth a look; don't block. */
  warnings: Problem[];
}

export const slugify = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

/** "Edge" stays, "edge" → "Edge", "dayton audio" → "Dayton Audio". Mixed or upper case is kept as typed. */
export function brandCase(brand: string): string {
  const b = brand.trim().replace(/\s+/g, " ");
  return b === b.toLowerCase() ? b.replace(/(^|[\s-])([a-z])/g, (_, s: string, c: string) => s + c.toUpperCase()) : b;
}

/** An all-lowercase model code with no spaces ("eds15d2-e3") → upper case, as datasheets print it. */
export function modelCase(model: string): string {
  const m = model.trim().replace(/\s+/g, " ");
  return m === m.toLowerCase() && !m.includes(" ") && /\d/.test(m) ? m.toUpperCase() : m;
}

/** Letters, digits, spaces and . _ ' - only (no @-mentions, links or markup), at most CREDIT_MAX characters. */
export function cleanCredit(s: string | undefined): string {
  return (s ?? "")
    .normalize("NFKC")
    .replace(/[^\p{L}\p{N} ._'-]/gu, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, CREDIT_MAX)
    .trim();
}

/** Plain text on one line, at most `max` characters. */
export function cleanText(s: string | undefined, max: number): string {
  return (s ?? "")
    .replace(/[\u0000-\u001f\u007f<>]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max)
    .trim();
}

const positive = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v > 0 ? v : undefined);
const nonNegative = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : undefined);

function pick<K extends string>(o: Partial<Record<K, number>> | undefined, keys: readonly K[], zeroOk: readonly string[] = []) {
  const out: Partial<Record<K, number>> = {};
  for (const k of keys) {
    const v = zeroOk.includes(k) ? nonNegative(o?.[k]) : positive(o?.[k]);
    if (v !== undefined) out[k] = v;
  }
  return out;
}

const clean = <T extends Record<string, unknown>>(o: T) =>
  Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as Partial<T>;

/**
 * Build the database record. Only whitelisted fields are copied; `status` is always
 * "community" (a submitter can't mark an entry verified). `brandNames` maps brand
 * slugs already in the database to their spelling, so "edge" files under "Edge".
 */
export function buildRecord(f: SubmissionFields, via: Via, brandNames?: ReadonlyMap<string, string>): BuiltRecord {
  const typed = brandCase(String(f.brand ?? ""));
  const brandSlug = slugify(typed);
  const brand = brandNames?.get(brandSlug) ?? typed;
  const model = modelCase(String(f.model ?? ""));
  const modelSlug = slugify(model);

  const url = String(f.source_url ?? "").trim().split(/\s+/)[0] ?? "";
  const sources: Record<string, unknown>[] = [];
  if (url) {
    const credit = via.kind === "web" ? cleanCredit(via.credit) : "";
    sources.push({
      kind: "datasheet",
      url,
      retrieved: via.today,
      note:
        via.kind === "issue"
          ? `Submitted in issue #${via.issue} by @${via.author}.`
          : `Submitted on the website form${credit ? ` by ${credit}` : ""}.`,
    });
  }
  if (via.kind === "issue" && f.measured) {
    sources.push({ kind: "measured", by: `github:${via.author}`, method: f.measured.split("\n")[0]!.slice(0, 200) });
  }

  const physical = pick(f.physical, PHYSICAL_KEYS);
  const size_in = positive(f.size_in);
  const reason = via.kind === "web" ? cleanText(f.inconsistency_reason, REASON_MAX) : "";

  if (f.kind === "passive-radiator") {
    const params = pick(f.params, PR_KEYS, ["max_added_mass_g"]);
    // The maker's mechanical limit only when no linear Xmax is given (prTravel uses it then).
    if (params.xmax_mm !== undefined && via.kind === "issue") delete params.xmech_mm;
    return {
      kind: "passive-radiator",
      brand,
      brandSlug,
      modelSlug,
      record: clean({
        brand,
        model,
        type: "passive-radiator",
        size_in,
        params,
        physical: Object.keys(physical).length ? physical : undefined,
        sources,
        status: "community",
      }),
    };
  }

  const ts = pick(f.ts, TS_KEYS);
  const dvc = f.voice_coils === 2 ? dvcWiring(positive(f.nominal_ohms), f.ts_wiring, ts.re) : null;
  return {
    kind: "driver",
    brand,
    brandSlug,
    modelSlug,
    record: clean({
      brand,
      model,
      type: f.type || "other",
      nominal_ohms: dvc ? dvc.nominal_ohms : positive(f.nominal_ohms),
      voice_coils: dvc ? (2 as const) : undefined,
      ts_wiring: dvc?.ts_wiring,
      size_in,
      ts,
      physical: Object.keys(physical).length ? physical : undefined,
      sources,
      status: "community",
      notes: dvc?.notes,
      inconsistency_reason: reason || undefined,
    }),
  };
}

/**
 * A dual voice coil driver: the form asks for one coil's impedance; the record stores the
 * impedance for the wiring the datasheet's T/S were measured with (2 × per coil in series,
 * ½ in parallel), the one `ts.re` belongs to. A wiring that isn't given is worked out from Re
 * (about 2 × one coil in series, ½ in parallel); if Re fits neither, it stays unset and the
 * checks ask for it.
 */
export function dvcWiring(
  perCoil: number | undefined,
  given: string | undefined,
  re: number | undefined,
): { nominal_ohms?: number; ts_wiring?: "series" | "parallel"; notes?: string } {
  let wiring: "series" | "parallel" | undefined = given === "series" || given === "parallel" ? given : undefined;
  let notes: string | undefined;
  if (!wiring && perCoil !== undefined && re !== undefined) {
    wiring = re >= perCoil * 1.1 ? "series" : re <= perCoil * 0.55 ? "parallel" : undefined;
    if (wiring) notes = `Coil wiring for the published values (${wiring}) inferred from Re ${re} Ω with ${perCoil} Ω coils.`;
  }
  const nominal_ohms = perCoil === undefined || !wiring ? perCoil : wiring === "series" ? perCoil * 2 : perCoil / 2;
  return { nominal_ohms, ts_wiring: wiring, notes };
}

/** "ts.fs: required" → { field: "ts.fs", message: "required" }; source errors go to source_url. */
function toProblem(e: string): Problem {
  const m = /^([a-z_]+(?:\[\d+\])?(?:\.[a-z0-9_]+)?): (.*)$/s.exec(e);
  if (!m) return { field: "", message: e };
  const field = m[1]!.startsWith("sources") ? "source_url" : m[1]!;
  if (field === "ts_wiring") return { field, message: "choose Series or Parallel: how the coils were wired when the datasheet's values were measured." };
  return { field, message: m[2]! };
}

/**
 * The checks CI runs on a driver beyond the schema (load.ts uses this too):
 * published values that disagree with each other, and a displacement that is really Vd.
 */
export function driverConsistency(d: Driver): { errors: Problem[]; warnings: Problem[] } {
  const errors: Problem[] = [];
  const warnings: Problem[] = [];
  for (const issue of checkConsistency(d.ts)) {
    const field = `ts.${issue.param}`;
    if (issue.diff > CONSISTENCY_ERROR && d.inconsistency_reason === undefined) {
      errors.push({
        field,
        message:
          `${issue.message}. Over ${CONSISTENCY_ERROR * 100}% usually means a typo or unit mix-up. ` +
          `If the datasheet really says this, add an "inconsistency_reason" field explaining why.`,
      });
    } else if (issue.diff > CONSISTENCY_WARN) {
      warnings.push({ field, message: issue.message });
    }
  }
  const disp = d.physical?.displacement_l;
  if (disp !== undefined && d.ts.xmax_mm !== undefined) {
    const vd = (d.ts.sd_cm2 * d.ts.xmax_mm) / 10000; // litres
    if (Math.abs(disp - vd) <= 0.05 * vd) {
      errors.push({
        field: "physical.displacement_l",
        message:
          `physical.displacement_l (${disp} L) equals Vd = Sd × Xmax (${vd.toFixed(3)} L), the air the cone moves. ` +
          `It should be the space the driver takes up inside the box; leave it blank if the datasheet doesn't give it.`,
      });
    }
  }
  return { errors, warnings };
}

/** Database sites whose data a submission must not copy (the form's consent says so). */
const OTHER_DATABASES = /(^|\.)(loudspeakerdatabase\.com|speakerdata2go\.com|diyaudio\.com)/i;

/**
 * Easy-to-miss mistakes the database checks don't catch (they don't block):
 * - the datasheet link names a sibling model ("…eds15d2-e0" for EDS15D2-E3);
 * - the link is another database rather than the maker's sheet;
 * - Re far from the nominal impedance (often one coil of a dual voice coil driver).
 */
export function submissionHints(r: Pick<BuiltRecord, "record">): Problem[] {
  const out: Problem[] = [];
  const rec = r.record;
  const src = (rec.sources as { url?: string }[] | undefined)?.find((s) => s.url)?.url ?? "";
  const alnum = (x: string) => x.toLowerCase().replace(/[^a-z0-9]/g, "");
  const model = alnum(String(rec.model ?? ""));
  const url = alnum(src);
  if (model.length >= 5 && url && !url.includes(model) && url.includes(model.slice(0, -1))) {
    out.push({ field: "source_url", message: `The datasheet link doesn't contain the model name **${String(rec.model)}**: is it for a different variant?` });
  }
  let host = "";
  try {
    host = new URL(src).hostname + new URL(src).pathname;
  } catch {
    // not a URL: the schema check reports it
  }
  if (host && OTHER_DATABASES.test(host)) {
    out.push({ field: "source_url", message: "Link the manufacturer's datasheet or product page, not another database or forum." });
  }
  const re = (rec.ts as { re?: number } | undefined)?.re;
  const z = rec.nominal_ohms as number | undefined;
  if (re !== undefined && z !== undefined && rec.voice_coils !== 2 && (re > z * 1.05 || re < z * 0.5)) {
    out.push({
      field: "ts.re",
      message: `Re (${re} Ω) is unusual for a ${z} Ω driver (usually 0.6–0.95 × nominal). If it's a dual voice coil driver, choose **Dual** under Voice coils and the wiring the datasheet used.`,
    });
  }
  if (re !== undefined && z !== undefined && rec.voice_coils === 2) {
    if (rec.ts_wiring === undefined) {
      out.push({ field: "ts_wiring", message: `Re (${re} Ω) doesn't show how the coils were wired: choose **Series** or **Parallel** under Dual voice coil wiring, as the datasheet measured it.` });
    } else if (re > z * 1.05 || re < z * 0.5) {
      out.push({
        field: "nominal_ohms",
        message: `Re (${re} Ω) doesn't fit ${z} Ω (${String(rec.ts_wiring)}). Check the impedance is **one coil's** (2 for a dual 2 Ω sub) and the wiring is the one the datasheet measured with.`,
      });
    }
  }
  return out;
}

export interface CheckOptions {
  /** True when `<kind>/<brandSlug>/<modelSlug>` is already in the database. */
  exists?: (kind: SubmissionKind, brandSlug: string, modelSlug: string) => boolean;
}

/** Every problem with a built record, each with its field. Empty `errors` = CI will accept it. */
export function checkRecord(b: BuiltRecord, opts: CheckOptions = {}): CheckResult {
  const errors: Problem[] = [];
  const warnings: Problem[] = [];
  if (!b.brandSlug || !SLUG_RE.test(b.brandSlug)) errors.push({ field: "brand", message: "needs at least one letter or digit" });
  if (!b.modelSlug || !SLUG_RE.test(b.modelSlug)) errors.push({ field: "model", message: "needs at least one letter or digit" });
  const sources = (b.record.sources as { url?: string }[] | undefined) ?? [];
  if (!sources.some((s) => s.url)) errors.push({ field: "source_url", message: "a link to the manufacturer's datasheet or product page is required" });
  if (b.brandSlug && b.modelSlug && opts.exists?.(b.kind, b.brandSlug, b.modelSlug)) {
    errors.push({ field: "model", message: "is already in the database. If its values are wrong, use Report a correction on its page." });
  }

  const schema = (b.kind === "driver" ? validateDriver(b.record) : validatePassiveRadiator(b.record)).map(toProblem);
  // A missing url is already reported above in plainer words.
  for (const p of schema) if (!(p.field === "source_url" && sources.length === 0)) errors.push(p);

  // A missing link doesn't stop the value checks: the submitter sees everything at once.
  if (schema.every((p) => p.field === "source_url")) {
    if (b.kind === "driver") {
      const d = b.record as unknown as Driver;
      const c = driverConsistency(d);
      errors.push(...c.errors);
      warnings.push(...c.warnings);
      warnings.push(...driverFlags(d).map((f) => ({ field: f.code === "size-sd" ? "size_in" : "ts.xmax_mm", message: f.message })));
    } else {
      const p = b.record as unknown as PassiveRadiator;
      warnings.push(...passiveRadiatorFlags(p).map((f) => ({ field: f.code === "size-sd" ? "size_in" : "params.xmax_mm", message: f.message })));
    }
  }
  warnings.push(...submissionHints(b));
  return { errors, warnings };
}
