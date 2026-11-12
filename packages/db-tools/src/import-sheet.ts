/**
 * Import a manufacturer's T/S spreadsheet (CSV, TSV or .xlsx) into the database.
 *
 * For brands that have given written permission and sent their data as a file
 * (see docs/data-permissions.md and docs/importing-a-spreadsheet.md). The
 * spreadsheet itself is never committed: only the numbers, one JSON per driver.
 *
 *   pnpm db:import-sheet --brand "Faital Pro" --file faital.xlsx --date 2026-11-12 [options]
 *
 * Options:
 *   --brand NAME          brand name as it should appear (required)
 *   --file PATH           .csv, .tsv, .txt or .xlsx (required)
 *   --date YYYY-MM-DD     when the file was received (default: today)
 *   --note TEXT           source note on every entry (default: "<brand> T/S data supplied by <brand>, used with permission …")
 *   --url TEMPLATE        product page for rows without a URL column; {model}, {slug} and
 *                         {Any column header} (that row's cell) are filled in
 *   --sheet NAME          worksheet to read (.xlsx; default the first)
 *   --header-row N        1-based row holding the column names (default: found automatically)
 *   --map "Header=field[:unit]"  name a column the importer doesn't recognise (repeatable)
 *   --kind driver|passive-radiator   when the sheet has no type column (default: driver)
 *   --type TYPE           force the driver type (e.g. car-audio)
 *   --dvc-wiring series|parallel     how DVC values were measured, when the sheet doesn't say
 *   --decimal-comma       numbers use a decimal comma (detected for ; separated files)
 *   --website URL --country CC       for a new brand's _brand.json
 *   --report PATH         where to write the report (default: <brand-slug>-import-report.md)
 *   --dry-run             report only, write nothing
 *
 * Every row goes through the same checks and repairs as the driver-base import
 * (convertRecord): Qes from Qts and Qms, Vas from Cms, unit slips, consistency.
 * Existing entries for the same model are overwritten in place (same file, so
 * shared links keep working), keeping contributed displacement, measurements
 * and "verified" status.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  validateBrand,
  validatePassiveRadiator,
  type Brand,
  type Driver,
  type DriverType,
  type PassiveRadiator,
} from "../../schema/src/index.ts";
import { BRANDS, convertRecord, DIRECT_BRANDS, sizeInches, type DbRecord } from "./driverbase.ts";
import { keepExisting, slugOf } from "./dayton.ts";
import { loadDatabase, REPO_ROOT } from "./load.ts";
import { readSheet, type Rows } from "./sheet.ts";

// ---------------------------------------------------------------------------
// Columns
// ---------------------------------------------------------------------------

export const FIELDS = [
  "model",
  "url",
  "kind",
  "size",
  "impedance",
  "fs",
  "qts",
  "qes",
  "qms",
  "vas",
  "cms",
  "re",
  "le",
  "bl",
  "mms",
  "sd",
  "xmax",
  "xmech",
  "pe",
  "cutout",
  "depth",
  "displacement",
  "added_mass",
  "coils",
  "wiring",
] as const;
export type Field = (typeof FIELDS)[number];

/**
 * Header names → field. Tested against the header with any unit in brackets removed,
 * lower-cased. First match wins, so the specific patterns come first.
 */
const ALIASES: [RegExp, Field | null][] = [
  // Ignored on purpose: program/peak power, cone displacement volume, efficiency, etc.
  [/program|peak|music|max(imum)? power|^pmax|^vd\b|displacement volume|cone volume|sensitivity|\bspl\b|efficiency|^no\b|^eta|weight|^price|\bean\b|\bupc\b/, null],
  // A voice coil's winding depth and the magnetic gap's depth aren't the driver's depth.
  [/winding depth|gap depth|coil depth/, null],
  // B&C: "Air Volume Occupied by Driver" is the driver's own displacement.
  [/volume occupied|air volume occupied/, "displacement"],
  [/^(model|part|part ?(no|number|#)|product|product name|item|article|code|sku|reference|ref)$/, "model"],
  [/url|link|^page$|web ?(page|site)?$|datasheet|product page/, "url"],
  [/^(type|category|kind|family|product type|driver type|application|range)$/, "kind"],
  [/nominal (size|diameter)|^size$|^diameter$|^nominal diameter|^d nom/, "size"],
  [/nominal impedance|^impedance$|^z ?n(om)?$|^z$/, "impedance"],
  [/added mass/, "added_mass"],
  [/^f ?s$|^f ?0$|^fo$|resonan/, "fs"],
  [/^q ?ts$|total q/, "qts"],
  [/^q ?es$|electrical q/, "qes"],
  [/^q ?ms$|mechanical q/, "qms"],
  [/^v ?as$|equivalent (air )?volume|compliance volume/, "vas"],
  [/^c ?ms$|compliance/, "cms"],
  [/^r ?e$|^r ?evc$|^r ?dc$|dc resistance|coil resistance/, "re"],
  [/^l ?e\b|^l ?evc|inductance/, "le"],
  [/^b ?[x·*]? ?l$|^bxl$|force factor/, "bl"],
  [/^m ?ms$|moving mass/, "mms"],
  [/^s ?d$|effective (piston |radiating |cone )?area|piston area|cone area|radiating area/, "sd"],
  [/^x ?(mech|lim|max ?mech|damage)|mechanical (excursion|limit)/, "xmech"],
  [/^x ?max|linear (excursion|travel|displacement)|max(imum)? linear/, "xmax"],
  [/aes|^p ?e$|rated power|nominal power|power handling|continuous power|rms power|^power$/, "pe"],
  [/cut ?-?out|baffle (hole|opening|cut)|mounting (hole|diameter)/, "cutout"],
  [/depth/, "depth"],
  [/displacement/, "displacement"],
  [/voice coils|coil count|^dvc$|^coils$|single.?dual/, "coils"],
  [/wiring|connection/, "wiring"],
];

/** Unit factors to the units DbRecord uses, by field. Keys are regexes tested against the unit text. */
const UNITS: Partial<Record<Field, [RegExp, number][]>> = {
  // dm³ is litres: test it before m³ (which "dm³" also contains).
  vas: [[/ft|cu/, 28.3168], [/dm/, 1], [/cm3|cm³|cc/, 0.001], [/m3|m³/, 1000], [/l/, 1]],
  cms: [[/µm|um|micro/, 0.001], [/mm/, 1], [/m\s*\/\s*n|m\/n/, 1000]],
  le: [[/µh|uh|micro/, 0.001], [/mh/, 1], [/^h$/, 1000]],
  mms: [[/kg/, 1000], [/g/, 1]],
  sd: [[/mm/, 0.01], [/cm/, 1], [/in|sq/, 6.4516], [/m2|m²|sq ?m/, 10000]],
  xmax: [[/in|"/, 25.4], [/cm/, 10], [/mm/, 1]],
  xmech: [[/in|"/, 25.4], [/cm/, 10], [/mm/, 1]],
  cutout: [[/in|"/, 25.4], [/cm/, 10], [/mm/, 1]],
  depth: [[/in|"/, 25.4], [/cm/, 10], [/mm/, 1]],
  size: [[/in|"/, 25.4], [/cm/, 10], [/mm/, 1]],
  displacement: [[/ft|cu/, 28.3168], [/cm3|cm³|cc/, 0.001], [/l|dm/, 1]],
  added_mass: [[/kg/, 1000], [/g/, 1]],
};

export interface Column {
  index: number;
  header: string;
  field: Field;
  /** Multiplier to DbRecord units; undefined = cell decides, else the field's default. */
  factor?: number;
}

const normal = (h: string) =>
  h
    .toLowerCase()
    .replace(/[([{].*?[)\]}]/g, " ")
    .replace(/[_.:]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/** The unit text of a header: what's in brackets, or a trailing token like "Vas L". */
export function unitOf(header: string): string | undefined {
  const br = header.match(/[([{]\s*([^)\]}]+?)\s*[)\]}]/)?.[1];
  if (br) return br.toLowerCase();
  const tail = header.match(/\s(l|litres?|liters?|ft3|ft³|cu\.? ?ft\.?|cm2|cm²|m2|m²|mm2|mm²|in2|in²|mm|cm|in|g|kg|mh|µh|uh|hz|ohms?|ω|w|t·?m|n\/a)$/i)?.[1];
  return tail?.toLowerCase();
}

export function factorFor(field: Field, unit: string | undefined): number | undefined {
  if (!unit) return undefined;
  const table = UNITS[field];
  if (!table) return undefined;
  const u = unit.toLowerCase().replace(/\s+/g, "");
  return table.find(([re]) => re.test(u))?.[1];
}

export function fieldOf(header: string): Field | null | undefined {
  const h = normal(header);
  if (!h) return undefined;
  for (const [re, field] of ALIASES) if (re.test(h)) return field;
  return undefined;
}

export interface Layout {
  headerRow: number; // 0-based
  firstDataRow: number;
  columns: Column[];
  unknown: string[];
}

/**
 * Find the header row (the first with a model column and at least three T/S
 * columns), an optional units row under it, and what each column holds.
 */
export function findLayout(rows: Rows, maps: Map<string, { field: Field; unit?: string }>, headerRow?: number): Layout {
  const candidates = headerRow !== undefined ? [headerRow] : rows.slice(0, 30).map((_, i) => i);
  for (const r of candidates) {
    const row = rows[r] ?? [];
    const fields = row.map((h) => maps.get(h.toLowerCase())?.field ?? fieldOf(h));
    const ts = fields.filter((f) => f && !["model", "url", "kind", "size", "impedance"].includes(f)).length;
    if (headerRow === undefined && (!fields.includes("model") || ts < 3)) continue;
    // A units row: short non-numeric cells under T/S headers ("Hz", "L", "cm²").
    const next = rows[r + 1] ?? [];
    const unitRow =
      next.filter((c) => c !== "").length >= 2 &&
      next.every((c, i) => c === "" || fields[i] === "model" || (!/\d/.test(c.replace(/[²³]/g, "")) && c.length <= 12));
    const columns: Column[] = [];
    const unknown: string[] = [];
    const seen = new Set<Field>();
    row.forEach((h, index) => {
      const mapped = maps.get(h.toLowerCase());
      const field = mapped?.field ?? fieldOf(h);
      if (field === undefined) {
        if (h) unknown.push(h);
        return;
      }
      if (field === null || seen.has(field)) return; // first column of a kind wins
      seen.add(field);
      const unit = mapped?.unit ?? unitOf(h) ?? (unitRow ? next[index]?.toLowerCase() || undefined : undefined);
      columns.push({ index, header: h, field, factor: factorFor(field, unit) });
    });
    return { headerRow: r, firstDataRow: r + (unitRow ? 2 : 1), columns, unknown };
  }
  throw new Error(
    "Couldn't find the header row: no row has a model column and three or more T/S columns. Use --header-row and --map.",
  );
}

// ---------------------------------------------------------------------------
// Cells
// ---------------------------------------------------------------------------

/** A number from a cell, converted to DbRecord units. Units written in the cell win over the column's. */
export function cellValue(raw: string | undefined, field: Field, factor: number | undefined, decimalComma: boolean): number | undefined {
  if (raw === undefined) return undefined;
  let s = raw.trim();
  if (!s || /^(-|–|—|n\/?a|tbd|tba|\?)$/i.test(s)) return undefined;
  s = decimalComma ? s.replace(/\./g, "").replace(",", ".") : s.replace(/(\d),(\d{3})(?!\d)/g, "$1$2").replace(/^(-?\d+),(\d+)$/, "$1.$2");
  const m = s.match(/-?\d+(?:\.\d+)?(?:e-?\d+)?/i);
  if (!m) return undefined;
  let v = Number(m[0]);
  // Fractions in sizes: 6-1/2", 6 1/2, 5¼
  if (field === "size") {
    const frac = s.match(/^(\d+)[-\s](\d+)\/(\d+)/);
    if (frac) v = Number(frac[1]) + Number(frac[2]) / Number(frac[3]);
    else if (/½/.test(s)) v += 0.5;
    else if (/¼/.test(s)) v += 0.25;
    else if (/¾/.test(s)) v += 0.75;
  }
  const inCell = s.slice(m.index! + m[0].length).trim();
  const f = factorFor(field, inCell || undefined) ?? factor;
  if (f !== undefined) v *= f;
  else if (field === "size" && v <= 30) v *= 25.4; // a bare size is in inches
  else if (field === "le" && v > 20) v /= 1000; // a bare Le over 20 is µH
  return Number(v.toPrecision(10));
}

const KIND_MAP: [RegExp, { kind: DbRecord["driver_kind"] | "passive-radiator" | "skip"; type?: DriverType }][] = [
  [/passive|drone|\bpr\b|auxiliary bass/, { kind: "passive-radiator" }],
  [/tweeter|compression|\bhf\b|horn|ribbon|amt|dome|super ?tw|driver hf/, { kind: "skip" }],
  [/coax/, { kind: "coax" }],
  [/full|wide|extended/, { kind: "fullrange" }],
  [/guitar|instrument|bass guitar/, { kind: "guitar_bass" }],
  [/sub/, { kind: "lf_woofer", type: "subwoofer" }],
  [/mid[ -]?(bass|woofer)/, { kind: "lf_woofer", type: "midbass" }],
  [/mid/, { kind: "lf_woofer", type: "midrange" }],
  [/car|auto|vehicle/, { kind: "lf_woofer", type: "car-audio" }],
  [/(^|\s)woofers?$/, { kind: "lf_woofer", type: "woofer" }],
  [/woofer|\blf\b|low|bass|cone/, { kind: "lf_woofer" }],
];

export function kindOf(text: string | undefined, fallback: "driver" | "passive-radiator") {
  if (text) {
    const t = text.toLowerCase();
    for (const [re, k] of KIND_MAP) if (re.test(t)) return k;
  }
  return fallback === "passive-radiator" ? { kind: "passive-radiator" as const } : { kind: "lf_woofer" as const };
}

// ---------------------------------------------------------------------------
// Rows → entries
// ---------------------------------------------------------------------------

export interface Options {
  brand: Brand;
  brandSlug: string;
  date: string;
  note: string;
  url?: string;
  kind: "driver" | "passive-radiator";
  type?: DriverType;
  dvcWiring?: "series" | "parallel";
  decimalComma: boolean;
}

export type Result =
  | { kind: "driver"; model: string; slug: string; driver: Driver; notes: string[] }
  | { kind: "passive-radiator"; model: string; slug: string; pr: PassiveRadiator; notes: string[] }
  | { kind: "skip"; model: string; reason: string };

const round = (v: number, d: number) => Math.round(v * 10 ** d) / 10 ** d;

export function convertRows(rows: Rows, layout: Layout, opts: Options): Result[] {
  const col = (f: Field) => layout.columns.find((c) => c.field === f);
  const text = (row: string[], f: Field) => {
    const c = col(f);
    return c ? row[c.index]?.trim() || undefined : undefined;
  };
  const num = (row: string[], f: Field) => {
    const c = col(f);
    return c ? cellValue(row[c.index], f, c.factor, opts.decimalComma) : undefined;
  };

  const data = rows.slice(layout.firstDataRow).filter((r) => text(r, "model"));
  // --url templates: {model}, {slug}, or any column's header for that row's cell
  // (B&C: …/lf-driver/{inches}/{Nominal Impedance (Ω)}/{model}).
  const headers = (rows[layout.headerRow] ?? []).map((h) => String(h ?? "").trim().toLowerCase());
  const fillUrl = (tpl: string, row: string[], model: string) =>
    tpl.replace(/\{([^}]+)\}/g, (all, name: string) => {
      if (name === "model") return encodeURIComponent(model);
      if (name === "slug") return slugOf(model);
      const i = headers.indexOf(name.trim().toLowerCase());
      const v = i >= 0 ? String(row[i] ?? "").trim() : "";
      return v ? encodeURIComponent(v) : all;
    });
  // The same model in several impedances becomes one entry each (as for driver-base).
  const models = new Map<string, number>();
  for (const r of data) {
    const k = `${opts.brand.name}|${text(r, "model")}`;
    models.set(k, (models.get(k) ?? 0) + 1);
  }

  const results: Result[] = [];
  for (const row of data) {
    const model = text(row, "model")!.replace(/\s+/g, " ");
    const k = kindOf(text(row, "kind"), opts.kind);
    if (k.kind === "skip") {
      results.push({ kind: "skip", model, reason: `type "${text(row, "kind")}" isn't imported` });
      continue;
    }
    const rowUrl = text(row, "url");
    const url = rowUrl && /^https?:\/\//.test(rowUrl) ? rowUrl : opts.url ? fillUrl(opts.url, row, model) : undefined;
    if (url && /\{[^}]+\}/.test(url)) {
      results.push({ kind: "skip", model, reason: `the --url template has a column this row has no value for (${url})` });
      continue;
    }
    if (!url) {
      results.push({ kind: "skip", model, reason: "no product page link (add a URL column or use --url)" });
      continue;
    }

    if (k.kind === "passive-radiator") {
      results.push(toPassiveRadiator(model, url, row, num, opts));
      continue;
    }

    const coilsText = text(row, "coils")?.toLowerCase();
    const dual = coilsText ? /2|dual|dvc/.test(coilsText) : undefined;
    const wiringText = text(row, "wiring")?.toLowerCase();
    const wiring = wiringText?.includes("ser") ? "series" : wiringText?.includes("par") ? "parallel" : opts.dvcWiring;
    // Fill a missing Fs or Re from the values that define them, and say so.
    const derived: string[] = [];
    let fs = num(row, "fs");
    let re = num(row, "re");
    const mmsIn = num(row, "mms");
    const cmsIn = num(row, "cms");
    if (fs === undefined && mmsIn && cmsIn) {
      fs = round(1 / (2 * Math.PI * Math.sqrt((mmsIn / 1000) * (cmsIn / 1000))), 1);
      derived.push(`Fs ${fs} Hz calculated from the published Mms and Cms (not listed by the maker).`);
    }
    const qesIn = num(row, "qes");
    const blIn = num(row, "bl");
    if (re === undefined && fs && mmsIn && qesIn && blIn) {
      re = round((qesIn * blIn * blIn) / (2 * Math.PI * fs * (mmsIn / 1000)), 2);
      derived.push(`Re ${re} Ω calculated from the published Qes, Bl and Mms (not listed by the maker).`);
    }
    const rec: DbRecord = {
      manufacturer: opts.brand.name,
      canonical_id: slugOf(model),
      driver_kind: k.kind,
      model,
      source_urls: [url],
      fetched_at: opts.date,
      fs_hz: fs,
      qts: num(row, "qts"),
      qes: num(row, "qes"),
      qms: num(row, "qms"),
      vas_liters: num(row, "vas"),
      cms_mm_per_n: num(row, "cms"),
      re_ohm: re,
      le_mh: num(row, "le"),
      bl_tm: num(row, "bl"),
      mms_g: num(row, "mms"),
      sd_cm2: num(row, "sd"),
      xmax_mm: num(row, "xmax"),
      impedance_nominal_ohm: num(row, "impedance"),
      nominal_size_mm: num(row, "size"),
      mounting_diameter_mm: num(row, "cutout"),
      depth_mm: num(row, "depth"),
      power_aes_watts: num(row, "pe"),
      ...(dual !== undefined ? { voice_coils: dual ? 2 : 1 } : {}),
      ...(wiring ? { ts_wiring: wiring } : {}),
    };
    const c = convertRecord(rec, models, {
      brand: opts.brand,
      brandSlug: opts.brandSlug,
      note: opts.note,
      dvc: "dual voice coil: the sheet doesn't say how the coils were wired for these values (add a wiring column or use --dvc-wiring)",
    });
    if (c.kind === "skip" || !c.driver) {
      results.push({ kind: "skip", model, reason: c.reason ?? "not converted" });
      continue;
    }
    const d = c.driver;
    const forced = opts.type ?? ("type" in k ? k.type : undefined);
    if (forced) d.type = forced;
    const disp = num(row, "displacement");
    if (disp !== undefined) {
      const vd = d.ts.xmax_mm !== undefined ? (d.ts.sd_cm2 * d.ts.xmax_mm) / 10000 : undefined;
      if (vd !== undefined && Math.abs(disp - vd) <= 0.05 * vd) {
        c.notes.push(`Published displacement ${disp} L is Sd × Xmax (the air the cone moves), not the driver's size, so it's left out.`);
      } else if (disp > 0.0001 && disp < 100) d.physical = { ...d.physical, displacement_l: round(disp, 3) };
    }
    c.notes.unshift(...derived);
    if (c.notes.length) d.notes = c.notes.join(" ");
    else delete d.notes;
    results.push({ kind: "driver", model: d.model, slug: c.slug!, driver: d, notes: c.notes });
  }
  return results;
}

function toPassiveRadiator(
  model: string,
  url: string,
  row: string[],
  num: (row: string[], f: Field) => number | undefined,
  opts: Options,
): Result {
  const notes: string[] = [];
  const fs = num(row, "fs");
  const cms = num(row, "cms");
  let mms = num(row, "mms");
  const sd = num(row, "sd");
  let xmax = num(row, "xmax");
  if (mms === undefined && fs !== undefined && cms !== undefined) {
    mms = round(1 / ((2 * Math.PI * fs) ** 2 * (cms / 1000)) * 1000, 1);
    notes.push(`Mms ${mms} g calculated from the published Fs and Cms.`);
  }
  if (xmax === undefined) {
    const xmech = num(row, "xmech");
    if (xmech !== undefined) {
      xmax = xmech;
      notes.push(`Xmax is the published mechanical limit (Xmech ${xmech} mm); there's no separate linear figure.`);
    }
  }
  const missing = Object.entries({ mms, sd, xmax })
    .filter(([, v]) => v === undefined)
    .map(([k]) => k);
  if (missing.length) return { kind: "skip", model, reason: `passive radiator missing ${missing.join(", ")}` };

  const sizeMm = num(row, "size");
  const size_in = sizeInches(sizeMm);
  const params: PassiveRadiator["params"] = { mms_g: mms!, sd_cm2: sd!, xmax_mm: xmax! };
  const opt: [keyof PassiveRadiator["params"], number | undefined][] = [
    ["fs", fs],
    ["qms", num(row, "qms")],
    ["vas_l", num(row, "vas")],
    ["cms_mm_per_n", cms],
    ["max_added_mass_g", num(row, "added_mass")],
  ];
  for (const [k, v] of opt) if (v !== undefined && v > 0) params[k] = v;
  const physical: NonNullable<PassiveRadiator["physical"]> = {};
  const cutout = num(row, "cutout");
  const depth = num(row, "depth");
  if (cutout !== undefined) physical.cutout_mm = round(cutout, 1);
  if (depth !== undefined) physical.depth_mm = round(depth, 1);

  const pr: PassiveRadiator = {
    brand: opts.brand.name,
    model,
    type: "passive-radiator",
    ...(size_in ? { size_in } : {}),
    params,
    ...(Object.keys(physical).length ? { physical } : {}),
    sources: [{ kind: "datasheet", url, retrieved: opts.date, note: opts.note }],
    status: "community",
    ...(notes.length ? { notes: notes.join(" ") } : {}),
  };
  const errs = validatePassiveRadiator(pr);
  if (errs.length) return { kind: "skip", model, reason: errs.join("; ") };
  return { kind: "passive-radiator", model, slug: slugOf(model), pr, notes };
}

// ---------------------------------------------------------------------------
// Writing
// ---------------------------------------------------------------------------

const key = (model: string) => model.toLowerCase().replace(/[^a-z0-9]/g, "");

/** Existing files of one brand folder, by normalised model name → file name. */
export function existingFiles(dir: string): Map<string, string> {
  const out = new Map<string, string>();
  if (!existsSync(dir)) return out;
  for (const f of readdirSync(dir)) {
    if (!f.endsWith(".json") || f === "_brand.json") continue;
    try {
      out.set(key(JSON.parse(readFileSync(join(dir, f), "utf8")).model), f);
    } catch {
      /* the validator reports broken files */
    }
  }
  return out;
}

/** A brand under its own terms (`licence` in _brand.json, LICENSE-DATA "Exceptions") keeps saying so on every re-import. */
export function withOwnTerms(note: string, brand: Brand): string {
  if (!brand.licence || /not covered by CC BY-NC-SA/i.test(note)) return note;
  return `${note} Not covered by CC BY-NC-SA 4.0: do not reuse outside Speaker Box Genius without ${brand.name}'s permission. See LICENSE-DATA.`;
}

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
function args(name: string): string[] {
  return process.argv.flatMap((a, i) => (a === `--${name}` && process.argv[i + 1] ? [process.argv[i + 1]!] : []));
}

function main() {
  const brandName = arg("brand");
  const file = arg("file");
  if (!brandName || !file) {
    console.error('Usage: pnpm db:import-sheet --brand "Faital Pro" --file data.xlsx [--date YYYY-MM-DD] [--url TEMPLATE] [--dry-run]');
    process.exit(2);
  }
  const dry = process.argv.includes("--dry-run");
  const date = arg("date") ?? new Date().toISOString().slice(0, 10);
  const known = Object.values(BRANDS).find((b) => b.brand.name.toLowerCase() === brandName.toLowerCase());
  const brandSlug = known?.slug ?? slugOf(brandName);
  const brandFile = join(REPO_ROOT, "drivers", brandSlug, "_brand.json");
  const brand: Brand = existsSync(brandFile)
    ? JSON.parse(readFileSync(brandFile, "utf8"))
    : (known?.brand ?? { name: brandName, ...(arg("website") ? { website: arg("website") } : {}), ...(arg("country") ? { country: arg("country") } : {}) });
  const brandErrs = validateBrand(brand);
  if (brandErrs.length) throw new Error(`_brand.json: ${brandErrs.join("; ")}`);

  const maps = new Map<string, { field: Field; unit?: string }>();
  for (const m of args("map")) {
    const [header, spec] = m.split(/=(?=[^=]*$)/);
    const [field, unit] = (spec ?? "").split(":");
    if (!header || !FIELDS.includes(field as Field)) throw new Error(`--map "${m}": use "Header=field[:unit]", field one of ${FIELDS.join(", ")}`);
    maps.set(header.toLowerCase(), { field: field as Field, unit });
  }

  const sheet = readSheet(file, { sheet: arg("sheet") });
  const headerRow = arg("header-row") ? Number(arg("header-row")) - 1 : undefined;
  const layout = findLayout(sheet.rows, maps, headerRow);
  const kind = arg("kind") === "passive-radiator" ? "passive-radiator" : "driver";
  const wiring = arg("dvc-wiring");
  const opts: Options = {
    brand,
    brandSlug,
    date,
    note: arg("note") ?? `T/S data supplied by ${brand.name} (${date}) and published with their permission; the link is the product page on their website. See docs/data-permissions.md.`,
    url: arg("url"),
    kind,
    type: arg("type") as DriverType | undefined,
    dvcWiring: wiring === "series" || wiring === "parallel" ? wiring : undefined,
    decimalComma: process.argv.includes("--decimal-comma") || sheet.decimalComma,
  };
  opts.note = withOwnTerms(opts.note, brand);
  const results = convertRows(sheet.rows, layout, opts);

  const written: string[] = [];
  const replaced: string[] = [];
  const adjusted: string[] = [];
  const skipped: string[] = [];
  const touched = { driver: new Set<string>(), "passive-radiator": new Set<string>() };
  for (const r of results) {
    if (r.kind === "skip") {
      skipped.push(`${r.model} — ${r.reason}`);
      continue;
    }
    const tree = r.kind === "driver" ? "drivers" : "passive-radiators";
    const dir = join(REPO_ROOT, tree, brandSlug);
    const data = r.kind === "driver" ? r.driver : r.pr;
    const existing = existingFiles(dir);
    const name = existing.get(key(data.model)) ?? `${r.slug}.json`;
    if (touched[r.kind].has(name)) {
      skipped.push(`${r.model} — appears twice in the sheet; the first row was used`);
      continue;
    }
    touched[r.kind].add(name);
    const path = join(dir, name);
    const line = `${data.model} (${tree}/${brandSlug}/${name})`;
    if (existsSync(path)) {
      const old = JSON.parse(readFileSync(path, "utf8"));
      keepExisting(data, old);
      const fresh = data as unknown as Record<string, Record<string, unknown> | undefined>;
      const lost = ["ts", "params", "physical"].flatMap((g) =>
        Object.keys(old[g] ?? {}).filter((k) => fresh[g]?.[k] === undefined),
      );
      const why = [
        old.sources?.[0]?.note?.includes("driver-base") ? "was from driver-base" : "",
        lost.length ? `the sheet has no ${lost.join(", ")} (the old entry did)` : "",
      ].filter(Boolean);
      replaced.push(`${line}${why.length ? ` — ${why.join("; ")}` : ""}`);
    } else written.push(line);
    if (r.notes.length) adjusted.push(`${line} — ${r.notes.join(" ")}`);
    if (!dry) {
      mkdirSync(dir, { recursive: true });
      if (!existsSync(join(dir, "_brand.json"))) writeFileSync(join(dir, "_brand.json"), JSON.stringify(brand, null, 2) + "\n");
      writeFileSync(path, JSON.stringify(data, null, 2) + "\n");
    }
  }

  // Entries of this brand the sheet didn't cover (discontinued, or missing from the file).
  const leftover: string[] = [];
  for (const [tree, k] of [["drivers", "driver"], ["passive-radiators", "passive-radiator"]] as const) {
    for (const f of existingFiles(join(REPO_ROOT, tree, brandSlug)).values()) {
      if (!touched[k].has(f)) leftover.push(`${tree}/${brandSlug}/${f}`);
    }
  }

  const db = dry ? undefined : loadDatabase();
  const dbErrors = db?.errors.filter((e) => e.includes(`/${brandSlug}/`)) ?? [];
  const list = (xs: string[]) => (xs.length ? xs.map((s) => `- ${s}`) : ["- none"]);
  const report = [
    `## ${brand.name} import from a spreadsheet (${date})`,
    "",
    `Rows: ${results.length}. New: ${written.length}. Updated: ${replaced.length}. Adjusted: ${adjusted.length}. Skipped: ${skipped.length}.${dry ? " (dry run: nothing written)" : ""}`,
    "",
    `Source: ${opts.note}`,
    "",
    `Columns read: ${layout.columns.map((c) => `${c.header} → ${c.field}${c.factor !== undefined && c.factor !== 1 ? ` ×${c.factor}` : ""}`).join(", ")}.`,
    ...(layout.unknown.length ? ["", `Columns not used: ${layout.unknown.join(", ")}. Use --map if one of them should be.`] : []),
    "",
    "### Adjusted (check these against the datasheet)",
    ...list(adjusted),
    "",
    "### Skipped",
    ...list(skipped),
    "",
    `### ${brand.name} entries not in the sheet (kept; check whether they're discontinued)`,
    ...list(leftover),
    "",
    "### New",
    ...list(written),
    "",
    "### Updated",
    ...list(replaced),
    ...(dbErrors.length ? ["", "### Database errors (fix before opening the PR)", ...list(dbErrors)] : []),
    "",
  ].join("\n");
  const reportPath = arg("report") ?? join(REPO_ROOT, `${brandSlug}-import-report.md`);
  writeFileSync(reportPath, report);
  console.log(report);
  if (!known || !DIRECT_BRANDS.has(brand.name)) {
    console.log(
      `Next: add "${brand.name}" to DIRECT_BRANDS in packages/db-tools/src/driverbase.ts so a driver-base re-import doesn't add its own records for this brand, ` +
        "record the permission in docs/data-permissions.md, run pnpm validate:db, and open one data-only PR.",
    );
  }
  if (dbErrors.length) process.exit(1);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
