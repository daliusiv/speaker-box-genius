/**
 * driver-base importer.
 *
 * driver-base (https://github.com/JonathanDCohen/driver-base) publishes T/S
 * parameters compiled from manufacturers' own product pages, as one JSON file
 * licensed CC BY 4.0. CC BY material may be included in our CC BY-NC-SA data
 * as long as every entry credits driver-base, links the licence and says that
 * it was changed. See docs/data-permissions.md.
 *
 *   node … driverbase.ts <drivers.json>            write drivers/<brand>/*.json
 *   node … driverbase.ts <drivers.json> --dry-run  report only
 *
 * Only woofers, full-range, coaxial and guitar/bass speakers are taken.
 * Entries we already have are never overwritten, and brands we import
 * directly (Dayton Audio and SB Acoustics, with permission) are left out. The same checks as
 * the Dayton importer apply: values that contradict each other are fixed only
 * when one is clearly the odd one out; anything else is skipped and reported.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { validateDriver, type Brand, type Driver } from "../../schema/src/index.ts";
import { checkConsistency } from "../../engine/src/ts.ts";
import { CONSISTENCY_ERROR, REPO_ROOT } from "./load.ts";
import { dropImplausible, reconcile, slugOf } from "./dayton.ts";

export const DRIVER_BASE_URL = "https://github.com/JonathanDCohen/driver-base";
export const ATTRIBUTION =
  "Values from driver-base (https://github.com/JonathanDCohen/driver-base), licensed CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/), compiled from the manufacturer's product page. Converted to this format and checked by Speaker Box Genius; any values changed are listed in the notes.";

/**
 * Brands we import from the manufacturer directly (with written permission), so driver-base
 * records for them are skipped: the brand stays one source. Names as driver-base and our
 * _brand.json files spell them (driverbase.test.ts checks every direct brand folder is here).
 */
export const DIRECT_BRANDS = new Set(["Dayton Audio", "SB Acoustics", "B&C Speakers", "Purifi", "Markaudio", "Mark Audio", "REDCATT", "SEAS"]);

/** driver-base manufacturer name → our brand folder and _brand.json. */
export const BRANDS: Record<string, { slug: string; brand: Brand }> = {
  "18Sound": { slug: "18-sound", brand: { name: "18 Sound", website: "https://www.eighteensound.it", country: "IT" } },
  "B&C Speakers": { slug: "bc-speakers", brand: { name: "B&C Speakers", website: "https://www.bcspeakers.com", country: "IT" } },
  Beyma: { slug: "beyma", brand: { name: "Beyma", website: "https://www.beyma.com", country: "ES" } },
  Celestion: { slug: "celestion", brand: { name: "Celestion", website: "https://celestion.com", country: "GB" } },
  Eminence: { slug: "eminence", brand: { name: "Eminence", website: "https://eminence.com", country: "US" } },
  "Faital Pro": { slug: "faital-pro", brand: { name: "Faital Pro", website: "https://www.faitalpro.com", country: "IT" } },
  HOQS: { slug: "hoqs", brand: { name: "HOQS", website: "https://hoqs.org", country: "NL" } },
  Jensen: { slug: "jensen", brand: { name: "Jensen", website: "https://www.jensentone.com", country: "IT" } },
  Monacor: { slug: "monacor", brand: { name: "Monacor", website: "https://www.monacor.com", country: "DE" } },
  Peerless: { slug: "peerless", brand: { name: "Peerless", website: "https://products.peerless-audio.com", country: "DK" } },
  RCF: { slug: "rcf", brand: { name: "RCF", website: "https://www.rcf.it", country: "IT" } },
  "SB Acoustics": { slug: "sb-acoustics", brand: { name: "SB Acoustics", website: "https://sbacoustics.com", country: "DK" } },
};

/** Dual voice coil model names (SB Acoustics "-3-DV", "DVC", "D2"/"D4" suffixes). */
export const DVC = /-DV\b|\bDVC\b|dual voice coil|-D[248]$/i;

const KINDS = new Set(["lf_woofer", "fullrange", "coax", "guitar_bass"]);

/** The fields of a driver-base record that this importer reads. */
export interface DbRecord {
  manufacturer: string;
  canonical_id: string;
  driver_kind: string;
  model: string;
  source_urls: string[];
  fetched_at?: string;
  warn_flags?: string[];
  fs_hz?: number | null;
  qts?: number | null;
  qes?: number | null;
  qms?: number | null;
  vas_liters?: number | null;
  cms_mm_per_n?: number | null;
  re_ohm?: number | null;
  le_mh?: number | null;
  bl_tm?: number | null;
  mms_g?: number | null;
  sd_cm2?: number | null;
  xmax_mm?: number | null;
  impedance_nominal_ohm?: number | null;
  nominal_size_mm?: number | null;
  mounting_diameter_mm?: number | null;
  depth_mm?: number | null;
  power_aes_watts?: number | null;
  power_eia_watts?: number | null;
  /** Not in driver-base: set by the spreadsheet importer for dual voice coil drivers. */
  voice_coils?: 1 | 2;
  /** How a DVC driver's coils were wired for the published values. */
  ts_wiring?: "series" | "parallel";
}

export interface Converted {
  kind: "driver" | "skip";
  reason?: string;
  notes: string[];
  /** Folder slug and file slug. */
  brandSlug?: string;
  slug?: string;
  driver?: Driver;
}

const round = (v: number, d: number) => Math.round(v * 10 ** d) / 10 ** d;
const val = (v: number | null | undefined) => (typeof v === "number" && Number.isFinite(v) ? v : undefined);

/** Nominal sizes people use, in inches. */
const SIZES = [2, 2.5, 3, 3.5, 4, 4.5, 5, 5.25, 6, 6.5, 7, 8, 10, 12, 15, 18, 21, 24];
export function sizeInches(mm: number | undefined): number | undefined {
  if (mm === undefined || mm <= 0) return undefined;
  const inches = mm / 25.4;
  const best = SIZES.reduce((a, b) => (Math.abs(b - inches) < Math.abs(a - inches) ? b : a));
  return Math.abs(best - inches) / best < 0.12 ? best : round(inches, 1);
}

/** Common impedances first, so Re 5.6 Ω reads as 8 Ω rather than the rarer 6 Ω. */
/**
 * Nominal size: the record's size, unless the cone (from Sd) is clearly bigger
 * than that; then a size in the model name ('12" Raptor'), else none.
 */
export function sizeFor(r: DbRecord, sd_cm2: number, notes: string[]): number | undefined {
  const mm = val(r.nominal_size_mm);
  const cone = Math.sqrt((4 * sd_cm2) / Math.PI) * 10;
  if (mm !== undefined && cone <= mm * 1.05) return sizeInches(mm);
  const named = r.model.match(/^(\d+(?:\.\d+)?)\s*(?:"|”|in\b|inch)/)?.[1];
  const fromName = named !== undefined && cone <= Number(named) * 25.4 * 1.05 ? Number(named) : undefined;
  if (mm !== undefined) {
    notes.push(
      `Published size ${Math.round(mm)} mm is smaller than the cone (Sd ${sd_cm2} cm²)${fromName ? `; ${fromName}" taken from the model name` : ", so it's left out"}.`,
    );
  }
  return fromName;
}

const STANDARD_OHMS = [2, 4, 8, 16, 32, 1, 3, 6];
/** Nominal impedance from the record, else the nearest standard value above Re. */
export function nominalOhms(z: number | undefined, re: number): { ohms: number; guessed: boolean } {
  if (z !== undefined) return { ohms: z, guessed: false };
  const guess = STANDARD_OHMS.find((o) => re <= o * 0.95 && re >= o * 0.55) ?? round(re * 1.25, 1);
  return { ohms: guess, guessed: true };
}

export function typeOf(r: DbRecord, size_in: number | undefined, fs: number): Driver["type"] {
  if (r.driver_kind === "fullrange") return "full-range";
  if (r.driver_kind === "guitar_bass") return "other";
  if (size_in !== undefined && size_in <= 7) return "midbass";
  if (size_in !== undefined && size_in >= 10 && fs <= 35) return "subwoofer";
  return "woofer";
}

/**
 * Some records give Vas in cubic feet as if it were litres (PCS175 0.52 for
 * 15 L). When fs, Mms and Sd agree with Vas × 28.3 but not with Vas, fix it.
 */
export function fixVasUnits(ts: Driver["ts"], notes: string[]) {
  if (ts.mms_g === undefined) return;
  const off = (t: Driver["ts"]) => checkConsistency(t).find((i) => i.param === "mms_g")?.diff ?? 0;
  if (off(ts) <= CONSISTENCY_ERROR) return;
  const asFt3 = { ...ts, vas_l: round(ts.vas_l * 28.3168, 2) };
  if (off(asFt3) < 0.05) {
    notes.push(`Published Vas ${ts.vas_l} looks like cubic feet (fs, Mms and Sd agree with ${asFt3.vas_l} L), so it's read as ${asFt3.vas_l} L.`);
    ts.vas_l = asFt3.vas_l;
  }
}

/** Above this Mms disagreement an entry is left for a human rather than fixed. */
export const MAX_FIXABLE = 0.35;

/**
 * Sd should come from a cone that fits the frame: effective diameter about
 * 55–95 % of the nominal size. Outside that, Sd (or the size) is wrong.
 */
export function sdFitsSize(sd_cm2: number, nominal_mm: number | undefined): string | undefined {
  if (nominal_mm === undefined || nominal_mm < 75) return undefined;
  const dEff = Math.sqrt((4 * sd_cm2) / Math.PI) * 10; // mm
  const ratio = dEff / nominal_mm;
  if (ratio < 0.5 || ratio > 1.0) {
    return `Sd ${sd_cm2} cm² (cone ≈ ${Math.round(dEff)} mm across) doesn't fit a ${Math.round(nominal_mm)} mm driver`;
  }
  return undefined;
}

/** Notes that describe the driver rather than a change to the published values. */
export const INFO_NOTE = /^(Coaxial driver|Guitar\/bass speaker)/;

/** Convert one record. `models` counts records per brand + model, to tell impedance variants apart. */
export function convert(r: DbRecord, models: Map<string, number>): Converted {
  const b = BRANDS[r.manufacturer];
  if (DIRECT_BRANDS.has(r.manufacturer)) return { kind: "skip", reason: "imported directly from the manufacturer", notes: [] };
  if (!b) return { kind: "skip", reason: `unknown manufacturer "${r.manufacturer}"`, notes: [] };
  if (!KINDS.has(r.driver_kind)) return { kind: "skip", reason: `kind "${r.driver_kind}" isn't imported`, notes: [] };
  return convertRecord(r, models, {
    brand: b.brand,
    brandSlug: b.slug,
    note: ATTRIBUTION,
    dvc: "dual voice coil: driver-base doesn't say how the coils were wired for the published values",
  });
}

/** Who the values are from: the brand folder and the note every entry's source carries. */
export interface ConvertContext {
  brand: Brand;
  brandSlug: string;
  /** Goes in `sources[0].note`. */
  note: string;
  /** Why dual voice coil models are skipped. */
  dvc: string;
}

/**
 * Convert one record with the checks and repairs every bulk import shares
 * (driver-base, and manufacturer spreadsheets via import-sheet.ts).
 */
export function convertRecord(r: DbRecord, models: Map<string, number>, ctx: ConvertContext): Converted {
  const notes: string[] = [];
  const b = { brand: ctx.brand, slug: ctx.brandSlug };
  const dvc = r.voice_coils === 2 || (r.voice_coils === undefined && DVC.test(r.model));
  if (dvc && !r.ts_wiring) return { kind: "skip", reason: ctx.dvc, notes };
  const url = r.source_urls?.find((u) => /^https?:\/\//.test(u));
  if (!url) return { kind: "skip", reason: "no manufacturer page", notes };

  const fs = val(r.fs_hz);
  const qms = val(r.qms);
  const qts = val(r.qts);
  let qes = val(r.qes);
  let vas = val(r.vas_liters);
  const re = val(r.re_ohm);
  const sd = val(r.sd_cm2);
  const cms = val(r.cms_mm_per_n);
  if (qes === undefined && qts !== undefined && qms !== undefined && qms > qts) {
    qes = round(1 / (1 / qts - 1 / qms), 3);
    notes.push(`Qes ${qes} calculated from the published Qts and Qms.`);
  }
  if (vas === undefined && cms !== undefined && sd !== undefined) {
    vas = round((cms / 1000) * 1.184 * 346.1 * 346.1 * (sd / 1e4) ** 2 * 1000, 2);
    notes.push(`Vas ${vas} L calculated from the published Cms and Sd.`);
  }
  const missing = Object.entries({ fs, qms, qes, vas, re, sd })
    .filter(([, v]) => v === undefined)
    .map(([k]) => k);
  if (missing.length) return { kind: "skip", reason: `missing ${missing.join(", ")}`, notes };

  const ts: Driver["ts"] = { fs: fs!, qms: qms!, qes: qes!, vas_l: vas!, re: re!, sd_cm2: sd! };
  if (qts !== undefined) ts.qts = qts;
  const opt: [keyof Driver["ts"], number | undefined][] = [
    ["le_mh", val(r.le_mh)],
    ["bl", val(r.bl_tm)],
    ["mms_g", val(r.mms_g)],
    ["xmax_mm", val(r.xmax_mm)],
    ["pe_w", val(r.power_aes_watts) ?? val(r.power_eia_watts)],
  ];
  for (const [k, v] of opt) if (v !== undefined && v > 0) (ts as unknown as Record<string, number>)[k] = v;

  if (ts.qts !== undefined) {
    const q = (ts.qes * ts.qms) / (ts.qes + ts.qms);
    if (Math.abs(q - ts.qts) / ts.qts > 0.1) {
      return { kind: "skip", reason: `published Qts ${ts.qts} disagrees with Qes ${ts.qes} and Qms ${ts.qms} (they give ${round(q, 3)})`, notes };
    }
  }
  fixVasUnits(ts, notes);
  const sdIssue = sdFitsSize(ts.sd_cm2, val(r.nominal_size_mm));
  if (sdIssue) return { kind: "skip", reason: sdIssue, notes };
  // Small disagreements are fixed as for Dayton; big ones mean we can't tell which
  // value is wrong (a wrong Sd looks like a wrong Vas), so a human should look.
  const worst = Math.max(0, ...checkConsistency(ts).filter((i) => i.param === "mms_g").map((i) => i.diff));
  if (worst > MAX_FIXABLE) {
    const why = checkConsistency(ts)
      .filter((i) => i.param === "mms_g")
      .map((i) => i.message)
      .join("; ");
    return { kind: "skip", reason: `published values disagree too much to fix (${why})`, notes };
  }
  if (!reconcile(ts, cms, notes)) {
    const why = checkConsistency(ts)
      .filter((i) => i.diff > CONSISTENCY_ERROR)
      .map((i) => i.message)
      .join("; ");
    return { kind: "skip", reason: `published values disagree (${why})`, notes };
  }

  const size_in = sizeFor(r, ts.sd_cm2, notes);
  const physical: NonNullable<Driver["physical"]> = {};
  const cutout = val(r.mounting_diameter_mm);
  const depth = val(r.depth_mm);
  if (cutout) physical.cutout_mm = cutout;
  if (depth) physical.depth_mm = depth;
  dropImplausible(ts, physical, notes, size_in);

  const zPage = val(r.impedance_nominal_ohm);
  const zBad = zPage !== undefined && ts.re > zPage * 1.05;
  const z = nominalOhms(zBad ? undefined : zPage, ts.re);
  if (zBad) notes.push(`Published nominal impedance ${zPage} Ω is below Re ${ts.re} Ω, so ${z.ohms} Ω is estimated from Re.`);
  else if (z.guessed) notes.push(`Nominal impedance ${z.ohms} Ω estimated from Re ${ts.re} Ω (not on the page).`);
  if (r.driver_kind === "coax") notes.push("Coaxial driver; values are for the woofer section.");
  if (r.driver_kind === "guitar_bass") notes.push("Guitar/bass speaker.");

  // Same model in several impedances → one entry each, named and filed by impedance.
  const variants = (models.get(`${r.manufacturer}|${r.model}`) ?? 1) > 1;
  const model = variants ? `${r.model} (${z.ohms} Ω)` : r.model;
  const slug = variants ? `${slugOf(r.model)}-${String(z.ohms).replace(".", "-")}ohm` : slugOf(r.model);

  const retrieved = (r.fetched_at ?? "").slice(0, 10);
  const driver: Driver = {
    brand: b.brand.name,
    model,
    type: typeOf(r, size_in, ts.fs),
    nominal_ohms: z.ohms,
    ...(dvc ? { voice_coils: 2 as const, ts_wiring: r.ts_wiring } : {}),
    ...(size_in ? { size_in } : {}),
    ts,
    ...(Object.keys(physical).length ? { physical } : {}),
    sources: [
      {
        kind: "datasheet",
        url,
        ...(/^\d{4}-\d{2}-\d{2}$/.test(retrieved) ? { retrieved } : {}),
        note: ctx.note,
      },
    ],
    status: "community",
    ...(notes.length ? { notes: notes.join(" ") } : {}),
  };
  const errs = validateDriver(driver);
  if (errs.length) return { kind: "skip", reason: errs.join("; "), notes };
  return { kind: "driver", brandSlug: b.slug, slug, driver, notes };
}

/** Brand + model keys of entries already in the database (normalised). */
export function existingKeys(root: string): Set<string> {
  const keys = new Set<string>();
  const dir = join(root, "drivers");
  for (const brand of readdirSync(dir, { withFileTypes: true })) {
    if (!brand.isDirectory()) continue;
    for (const f of readdirSync(join(dir, brand.name))) {
      if (!f.endsWith(".json") || f === "_brand.json") continue;
      try {
        const d = JSON.parse(readFileSync(join(dir, brand.name, f), "utf8"));
        keys.add(`${brand.name}/${f.slice(0, -5)}`);
        keys.add(`${brand.name}/${slugOf(String(d.model ?? ""))}`);
      } catch {
        /* the validator reports broken files */
      }
    }
  }
  return keys;
}

async function main() {
  const file = process.argv[2];
  if (!file || file.startsWith("--")) {
    console.error("usage: driverbase.ts <path to driver-base web/drivers.json> [--dry-run]");
    process.exit(2);
  }
  const dry = process.argv.includes("--dry-run");
  const data = JSON.parse(readFileSync(file, "utf8"));
  const records: DbRecord[] = data.drivers ?? data;
  const models = new Map<string, number>();
  for (const r of records) models.set(`${r.manufacturer}|${r.model}`, (models.get(`${r.manufacturer}|${r.model}`) ?? 0) + 1);
  const existing = existingKeys(REPO_ROOT);

  const written = new Map<string, string[]>();
  const adjusted: string[] = [];
  const skipped: string[] = [];
  const kept: string[] = [];
  const seen = new Set<string>();
  let considered = 0;
  for (const r of records) {
    if (!KINDS.has(r.driver_kind) || DIRECT_BRANDS.has(r.manufacturer)) continue;
    considered++;
    const c = convert(r, models);
    const link = `[${r.manufacturer} ${r.model}](${r.source_urls?.[0] ?? DRIVER_BASE_URL})`;
    if (c.kind === "skip") {
      skipped.push(`${link} — ${c.reason}`);
      continue;
    }
    const id = `${c.brandSlug}/${c.slug}`;
    if (existing.has(id) || existing.has(`${c.brandSlug}/${slugOf(r.model)}`)) {
      kept.push(`${link} — already in the database (${id})`);
      continue;
    }
    if (seen.has(id)) {
      skipped.push(`${link} — duplicate of another record (${id})`);
      continue;
    }
    seen.add(id);
    const list = written.get(r.manufacturer) ?? [];
    list.push(c.driver!.model);
    written.set(r.manufacturer, list);
    const changes = c.notes.filter((n) => !INFO_NOTE.test(n));
    if (changes.length) adjusted.push(`${link} — ${changes.join(" ")}`);
    if (!dry) {
      const dir = join(REPO_ROOT, "drivers", c.brandSlug!);
      mkdirSync(dir, { recursive: true });
      const brandFile = join(dir, "_brand.json");
      if (!existsSync(brandFile)) writeFileSync(brandFile, JSON.stringify(BRANDS[r.manufacturer]!.brand, null, 2) + "\n");
      writeFileSync(join(dir, `${c.slug}.json`), JSON.stringify(c.driver, null, 2) + "\n");
    }
  }

  const total = [...written.values()].reduce((n, l) => n + l.length, 0);
  const report = [
    `## driver-base import`,
    "",
    `Source: ${DRIVER_BASE_URL} (\`web/drivers.json\`, generated ${data.generated_at ?? "?"}), data licensed CC BY 4.0.`,
    "",
    `Records considered (woofer, full-range, coax, guitar/bass; brands imported directly excluded: ${[...DIRECT_BRANDS].join(", ")}): ${considered}. Written: ${total}. Already in the database: ${kept.length}. Adjusted: ${adjusted.length}. Skipped: ${skipped.length}.`,
    "",
    "### Written per brand",
    ...[...written.entries()].sort((a, b) => b[1].length - a[1].length).map(([m, l]) => `- ${m}: ${l.length}`),
    "",
    "### Adjusted (worth a spot check against the manufacturer page)",
    ...(adjusted.length ? adjusted.map((s) => `- ${s}`) : ["- none"]),
    "",
    "### Skipped",
    ...(skipped.length ? skipped.map((s) => `- ${s}`) : ["- none"]),
    "",
    "### Already in the database (left unchanged)",
    ...(kept.length ? kept.map((s) => `- ${s}`) : ["- none"]),
    "",
  ].join("\n");
  writeFileSync(join(REPO_ROOT, "driverbase-import-report.md"), report);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, report);
  console.log(report.split("\n").slice(0, 22).join("\n"));
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
