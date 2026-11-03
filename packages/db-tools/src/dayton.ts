/**
 * Dayton Audio importer.
 *
 * Dayton Audio gave permission (3 Nov 2026) to use the Thiele/Small parameters
 * they publish. See docs/data-permissions.md. This reads their product pages
 * (allowed by daytonaudio.com/robots.txt; the spec-sheet endpoint refuses
 * automated requests) and writes database entries.
 *
 *   node … dayton.ts            crawl the site and write drivers/dayton-audio/*.json
 *   node … dayton.ts --dry-run  crawl and report only
 *
 * Only numbers are taken. Every entry links to its product page. Values that
 * contradict each other are fixed only when one published value is clearly the
 * odd one out (it's dropped or recomputed, and the entry says so); anything
 * else is skipped and listed in the report for a human to check.
 */
import { mkdirSync, readFileSync, writeFileSync, existsSync, appendFileSync } from "node:fs";
import { join } from "node:path";
import { validateDriver, validatePassiveRadiator, type Driver, type PassiveRadiator } from "../../schema/src/index.ts";
import { checkConsistency, cmsFromVas, mmsFromFsCms } from "../../engine/src/ts.ts";
import { CONSISTENCY_ERROR, REPO_ROOT } from "./load.ts";

export const SITE = "https://www.daytonaudio.com";
export const PERMISSION_NOTE = "Dayton Audio product page specifications, used with Dayton Audio's permission (3 Nov 2026).";

/** Categories worth designing boxes around. Tweeters, horns and exciters are left out. */
export const CATEGORIES: { id: number; slug: string }[] = [
  { id: 121, slug: "subwoofers" },
  { id: 118, slug: "woofers" },
  { id: 123, slug: "full-range" },
  { id: 125, slug: "passive-radiators" },
  { id: 161, slug: "pro-audio-drivers" },
  { id: 178, slug: "mini-micro-speakers" },
];

// ---------------------------------------------------------------------------
// HTML parsing (pure, tested against fixtures)
// ---------------------------------------------------------------------------

const decode = (s: string) =>
  s
    .replace(/<[^>]+>/g, "")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&#39;|&rsquo;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/** The category's own paging address and last page number, from its page links. */
export function parsePager(html: string, id: number): { path: string; last: number } | undefined {
  const pages = [...html.matchAll(new RegExp(`href="(/category/${id}/[^"?#]+)\\?pagenum=(\\d+)"`, "g"))];
  if (pages.length === 0) return undefined;
  return { path: pages[0]![1]!, last: Math.max(...pages.map((m) => Number(m[2]))) };
}

/** Product links on a category page, as absolute URLs. */
export function parseCategory(html: string): string[] {
  const out = new Set<string>();
  for (const m of html.matchAll(/href="(\/product\/\d+\/[^"?#]+)"/g)) out.add(SITE + m[1]);
  return [...out];
}

/** The label → value rows of a product page's details table. */
export function parseRows(html: string): Map<string, string> {
  const rows = new Map<string, string>();
  for (const m of html.matchAll(/<tr>\s*<td[^>]*>([\s\S]*?)<\/td>\s*<td[^>]*>([\s\S]*?)<\/td>\s*<\/tr>/g)) {
    const k = decode(m[1]!);
    if (k && !rows.has(k)) rows.set(k, decode(m[2]!));
  }
  return rows;
}

/** First number in a string, ignoring thousands separators: "1,317.4 cm³" → 1317.4. */
export function firstNumber(s: string | undefined): number | undefined {
  if (!s) return undefined;
  const m = s.replace(/(\d),(\d{3})/g, "$1$2").match(/-?\d+(?:\.\d+)?/);
  return m ? Number(m[0]) : undefined;
}

/** '12"' → 12, '6-1/2"' → 6.5, '5-1/4"' → 5.25, '3/4"' → 0.75. */
export function parseInches(s: string | undefined): number | undefined {
  if (!s) return undefined;
  const m = s.match(/(\d+)(?:[-\s](\d+)\/(\d+))?/);
  if (!m) return undefined;
  const frac = s.match(/^\s*(\d+)\/(\d+)/);
  if (frac) return Number(frac[1]) / Number(frac[2]);
  return Number(m[1]) + (m[2] ? Number(m[2]) / Number(m[3]) : 0);
}

/** A length in mm from "282 mm", "11.1\"", "11.1 in" or "28.2 cm". */
export function parseMm(s: string | undefined): number | undefined {
  const v = firstNumber(s);
  if (v === undefined || !s) return undefined;
  if (/"|\bin\b|inch/.test(s)) return round(v * 25.4, 1);
  if (/\bcm\b/.test(s)) return round(v * 10, 1);
  return v;
}

/** A volume in litres from "84.1 liters" or "2.97 ft³" / "2.97 cu. ft.". */
export function parseLitres(s: string | undefined): number | undefined {
  const v = firstNumber(s);
  if (v === undefined || !s) return undefined;
  if (/ft|cu/i.test(s)) return round(v * 28.3168, 1);
  if (/cm³|cc/.test(s)) return round(v / 1000, 3);
  return v;
}

/** An area in cm² from "514.7 cm²", "79.8 in²" or "35630 mm²". */
export function parseCm2(s: string | undefined): number | undefined {
  const v = firstNumber(s);
  if (v === undefined || !s) return undefined;
  if (/in/.test(s)) return round(v * 6.4516, 1);
  if (/mm/.test(s)) return round(v / 100, 1);
  return v;
}

const round = (v: number, d: number) => Math.round(v * 10 ** d) / 10 ** d;

/** Pick the first row whose label contains one of the keys (case-insensitive). */
function get(rows: Map<string, string>, ...keys: string[]): string | undefined {
  for (const key of keys) {
    for (const [k, v] of rows) if (k.toLowerCase().includes(key.toLowerCase())) return v;
  }
  return undefined;
}

export interface Parsed {
  kind: "driver" | "passive-radiator" | "skip";
  /** Why it was skipped, or notes about what was adjusted. */
  reason?: string;
  notes: string[];
  model: string;
  title: string;
  driver?: Driver;
  pr?: PassiveRadiator;
}

const TYPE_MAP: [RegExp, Driver["type"]][] = [
  [/sub/i, "subwoofer"],
  [/mid.?bass|mid.?woofer/i, "midbass"],
  [/full.?range|extended range/i, "full-range"],
  [/woofer|bass/i, "woofer"],
];

/** Speaker types that aren't box-design material. */
const NOT_A_BOX_DRIVER = /tweeter|compression|horn|exciter|transducer|shaker|midrange|replacement|diaphragm/i;

export function parseProduct(html: string, url: string, retrieved: string): Parsed {
  const rows = parseRows(html);
  const title = decode(html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/)?.[1] ?? "");
  const notes: string[] = [];
  const rowModel = get(rows, "Model Number");
  const titleModel = title.split(" ")[0] ?? "";
  const urlSlug = url.match(/\/product\/\d+\/([^/?#]+)/)?.[1] ?? "";
  let model = rowModel ?? titleModel;
  const looksLikeModel = /\d/.test(titleModel) && /-/.test(titleModel);
  if (rowModel && looksLikeModel && slugOf(rowModel) !== slugOf(titleModel) && !urlSlug.startsWith(slugOf(rowModel)) && urlSlug.startsWith(slugOf(titleModel))) {
    // e.g. the E150HE-44 page lists "E180HE-44" as its model number.
    notes.push(`The page's Model Number field says ${rowModel}; the product title and address say ${titleModel}, which is used.`);
    model = titleModel;
  } else if (rowModel && !urlSlug.includes(slugOf(rowModel)) && !slugOf(title).includes(slugOf(rowModel))) {
    notes.push(`Check the model name: the page's Model Number field says ${rowModel}, but the product title is "${title}".`);
  }
  const base = { notes, model, title };
  const type = get(rows, "Speaker Type") ?? "";
  const isPr = /passive/i.test(type) || /passive radiator/i.test(title);

  if (!model) return { kind: "skip", reason: "no model number", ...base };
  if (!isPr && (NOT_A_BOX_DRIVER.test(type) || (!type && NOT_A_BOX_DRIVER.test(title)))) {
    return { kind: "skip", reason: `type "${type || title}" isn't imported`, ...base };
  }

  const pdf = html.match(/href="(\/images\/resources\/[^"]+\.pdf)"/i)?.[1];
  const sources: Driver["sources"] = [{ kind: "datasheet", url, retrieved, note: PERMISSION_NOTE }];
  if (pdf) sources.push({ kind: "datasheet", url: encodeURI(SITE + pdf), retrieved, note: "Dayton Audio specification sheet (PDF)." });

  const size_in = parseInches(get(rows, "Nominal Diameter"));
  const physical: NonNullable<Driver["physical"]> = {};
  const cutout = parseMm(get(rows, "Baffle Cutout", "Cutout Diameter"));
  const depth = parseMm(get(rows, "Mounting Depth", "Overall Depth"));
  if (cutout) physical.cutout_mm = cutout;
  if (depth) physical.depth_mm = depth;

  const fs = firstNumber(get(rows, "(Fs)", "Resonant Frequency"));
  const qms = firstNumber(get(rows, "(Qms)"));
  let vas = parseLitres(get(rows, "(Vas)"));
  const sd = parseCm2(get(rows, "(Sd)"));
  const mms = firstNumber(get(rows, "(Mms)"));
  const cmsRow = get(rows, "(Cms)");
  const cms = firstNumber(cmsRow);
  const xmax = firstNumber(get(rows, "(Xmax)"));

  if (isPr) {
    if (mms === undefined || sd === undefined || xmax === undefined) {
      return {
        kind: "skip",
        reason: `passive radiator without Mms, Sd and Xmax (labels on the page: ${[...rows.keys()].join(" | ") || "none"})`,
        ...base,
      };
    }
    const params: PassiveRadiator["params"] = { mms_g: mms, sd_cm2: sd, xmax_mm: xmax };
    if (fs !== undefined) params.fs = fs;
    if (qms !== undefined) params.qms = qms;
    if (vas !== undefined) params.vas_l = vas;
    if (cms !== undefined) params.cms_mm_per_n = cms;
    const maxAdd = firstNumber(get(rows, "Max Added Mass", "Maximum Added Mass"));
    if (maxAdd !== undefined) params.max_added_mass_g = maxAdd;
    fixPhysical(physical, notes, size_in);
    const pr: PassiveRadiator = {
      brand: "Dayton Audio",
      model,
      type: "passive-radiator",
      ...(size_in ? { size_in } : {}),
      params,
      ...(Object.keys(physical).length ? { physical } : {}),
      sources,
      status: "community",
      ...(notes.length ? { notes: notes.join(" ") } : {}),
    };
    return { kind: "passive-radiator", pr, ...base };
  }

  let qes = firstNumber(get(rows, "(Qes)"));
  const qts = firstNumber(get(rows, "(Qts)"));
  const re = firstNumber(get(rows, "(Re)", "DC Resistance"));
  if (qes === undefined && qts !== undefined && qms !== undefined && qms > qts) {
    qes = round(1 / (1 / qts - 1 / qms), 3);
    notes.push(`Qes ${qes} calculated from the published Qts and Qms.`);
  }
  if ((vas === undefined || vas <= 0) && cms !== undefined && cms > 0 && sd !== undefined) {
    const v = cms / 1000 * 1.184 * 346.1 * 346.1 * (sd / 1e4) ** 2 * 1000;
    notes.push(`Vas ${round(v, 3)} L calculated from the published Cms and Sd (the page gives ${vas === undefined ? "no Vas" : `Vas ${vas}`}).`);
    vas = round(v, 3);
  }
  if ((vas === undefined || vas <= 0) && fs !== undefined && mms !== undefined && mms > 0 && sd !== undefined) {
    const cmsFromMms = mmsFromFsCms(fs, mms / 1000); // the same formula gives Cms from Fs and Mms
    const v = cmsFromMms * 1.184 * 346.1 * 346.1 * (sd / 1e4) ** 2 * 1000;
    notes.push(`Vas ${round(v, 3)} L calculated from the published Fs, Mms and Sd (the page gives ${vas === undefined ? "no Vas" : `Vas ${vas}`}).`);
    vas = round(v, 3);
  }
  const missing = Object.entries({ fs, qms, qes, vas, re, sd })
    .filter(([, v]) => v === undefined)
    .map(([k]) => k);
  if (missing.length) return { kind: "skip", reason: `missing ${missing.join(", ")}`, ...base };

  // Impedance, and how a dual voice coil driver's values were measured.
  const zText = get(rows, "Impedance") ?? "";
  const perCoil = zText.match(/(\d+(?:\.\d+)?)\s*\+\s*\d/)?.[1] ?? zText.match(/(\d+(?:\.\d+)?)\s*ohms? per coil/i)?.[1];
  const dvc = perCoil !== undefined || /\bDVC\b|dual voice coil|dual \d+ ?ohm/i.test(title);
  let nominal = firstNumber(zText) ?? 4;
  let wiring: "series" | "parallel" | undefined;
  const suffixCoil = dvc ? model.match(/-(\d)\1$/)?.[1] : undefined; // Dayton DVC: -22, -44, -88 = two 2, 4 or 8 Ω coils
  if (dvc) {
    const coil =
      perCoil !== undefined
        ? Number(perCoil)
        : suffixCoil !== undefined
          ? Number(suffixCoil)
          : (firstNumber(title.match(/(\d+(?:\.\d+)?)\s*ohms? per coil/i)?.[0]) ?? nominal);
    const single = perCoil === undefined ? firstNumber(zText) : undefined; // e.g. "4 ohms" on an 8+8 driver
    const stated = html.match(/measured with the voice coils? (?:wires |wired )?in (series|parallel)/i)?.[1]?.toLowerCase();
    if (stated === "series" || stated === "parallel") wiring = stated;
    else if (single !== undefined && single === coil * 2) wiring = "series";
    else if (single !== undefined && single === coil / 2) wiring = "parallel";
    else if (re! > 1.3 * coil) wiring = "series";
    else if (re! < 0.7 * coil) wiring = "parallel";
    if (!wiring) {
      return { kind: "skip", reason: `dual voice coil, but Re ${re} Ω doesn't show how the coils were wired`, ...base };
    }
    nominal = wiring === "series" ? coil * 2 : coil / 2;
    if (!stated) {
      const how = single !== undefined && (single === coil * 2 || single === coil / 2) ? `the ${single} Ω impedance` : `Re ${re} Ω`;
      notes.push(`Coil wiring for the published values (${wiring}) inferred from ${how} with ${coil} Ω coils.`);
    }
  }

  const ts: Driver["ts"] = { fs: fs!, qms: qms!, qes: qes!, vas_l: vas!, re: re!, sd_cm2: sd! };
  if (qts !== undefined) ts.qts = qts;
  const le = firstNumber(get(rows, "(Le)"));
  if (le !== undefined) ts.le_mh = le;
  const bl = firstNumber(get(rows, "(BL)", "BL Product"));
  if (bl !== undefined) ts.bl = bl;
  if (mms !== undefined) ts.mms_g = mms;
  if (xmax !== undefined) ts.xmax_mm = xmax;
  const pe = firstNumber(get(rows, "Power Handling (RMS)", "RMS Power"));
  if (pe !== undefined) ts.pe_w = pe;

  const fixed = reconcile(ts, cms, notes);
  if (!fixed) {
    return {
      kind: "skip",
      reason: `published values disagree (${checkConsistency(ts)
        .filter((i) => i.diff > CONSISTENCY_ERROR)
        .map((i) => i.message)
        .join("; ")})`,
      ...base,
    };
  }

  dropImplausible(ts, physical, notes, size_in);

  const typeName = TYPE_MAP.find(([re]) => re.test(type || title))?.[1] ?? "woofer";
  const driver: Driver = {
    brand: "Dayton Audio",
    model,
    type: typeName,
    nominal_ohms: nominal,
    ...(size_in ? { size_in } : {}),
    ts,
    ...(Object.keys(physical).length ? { physical } : {}),
    sources,
    status: "community",
    ...(wiring ? { voice_coils: 2 as const, ts_wiring: wiring } : {}),
    ...(notes.length ? { notes: notes.join(" ") } : {}),
  };
  return { kind: "driver", driver, ...base };
}

const OPTIONAL_TS = ["qts", "le_mh", "bl", "mms_g", "xmax_mm", "pe_w"] as const;

/**
 * Datasheet slips in optional values (a negative Le, Qts 79, a cutout in inches
 * with no unit) shouldn't throw away the whole entry: convert obvious inch values,
 * drop the rest, and say so.
 */
export function dropImplausible(ts: Driver["ts"], physical: NonNullable<Driver["physical"]>, notes: string[], size_in?: number) {
  const probe = () =>
    validateDriver({ brand: "x", model: "x", type: "woofer", nominal_ohms: 4, ts, physical, sources: [{ kind: "community" }], status: "community" });
  fixPhysical(physical, notes, size_in);
  for (const key of OPTIONAL_TS) {
    const v = ts[key];
    if (v === undefined || !probe().some((e) => e.startsWith(`ts.${key}`))) continue;
    delete ts[key];
    notes.push(`Published ${key.replace(/_.*/, "")} ${v} is implausible, so it's left out.`);
  }
}

/** Cutout and depth: read unit-less small numbers as inches, drop the impossible. */
export function fixPhysical(physical: NonNullable<Driver["physical"]>, notes: string[], size_in?: number) {
  const ok = (key: "cutout_mm" | "depth_mm", v: number) => (key === "cutout_mm" ? v >= 10 && v <= 1000 : v >= 5 && v <= 600);
  for (const key of ["cutout_mm", "depth_mm"] as const) {
    const v = physical[key];
    if (v === undefined || ok(key, v)) continue;
    const name = key === "cutout_mm" ? "cutout" : "depth";
    const mm = round(v * 25.4, 1);
    if (ok(key, mm)) {
      physical[key] = mm;
      notes.push(`Published ${name} ${v} has no unit; read as inches (${mm} mm).`);
    } else {
      delete physical[key];
      notes.push(`Published ${name} ${v} is implausible, so it's left out.`);
    }
  }
  // A cutout is roughly 70–105 % of the nominal diameter; anything else is another dimension.
  const c = physical.cutout_mm;
  if (c !== undefined && size_in !== undefined && size_in >= 3) {
    const ratio = c / (size_in * 25.4);
    if (ratio < 0.7 || ratio > 1.05) {
      delete physical.cutout_mm;
      notes.push(`Published cutout ${c} mm can't fit a ${size_in}" driver, so it's left out.`);
    }
  }
}

/**
 * Make published values agree, but only when one value is clearly the odd one out.
 * Returns false if the entry should be left for a human.
 */
export function reconcile(ts: Driver["ts"], cmsMmPerN: number | undefined, notes: string[]): boolean {
  const bad = () => checkConsistency(ts).filter((i) => i.diff > CONSISTENCY_ERROR);
  let issues = bad();
  if (issues.length === 0) return true;

  // Mms disagrees with fs/Vas/Sd. If the published Cms agrees with Mms (fs² = 1/(Mms·Cms)),
  // then Vas is the odd one out; otherwise Mms is.
  if (issues.some((i) => i.param === "mms_g") && ts.mms_g !== undefined) {
    const cmsFromVasM = cmsFromVas(ts.vas_l, ts.sd_cm2); // m/N
    const mmsFromCms = cmsMmPerN !== undefined ? mmsFromFsCms(ts.fs, cmsMmPerN / 1000) * 1000 : undefined;
    if (mmsFromCms !== undefined && Math.abs(mmsFromCms - ts.mms_g) / ts.mms_g < 0.05) {
      const vasFromCms = (ts.vas_l * (cmsMmPerN! / 1000)) / cmsFromVasM;
      notes.push(`Published Vas ${ts.vas_l} L disagrees with Fs, Mms, Cms and Sd; Vas recalculated as ${round(vasFromCms, 1)} L from Cms.`);
      ts.vas_l = round(vasFromCms, 1);
    } else {
      notes.push(`Published Mms ${ts.mms_g} g disagrees with Fs, Vas and Sd, so it's left out (the app derives it).`);
      delete ts.mms_g;
    }
    issues = bad();
  }
  if (issues.some((i) => i.param === "bl") && ts.bl !== undefined) {
    notes.push(`Published Bl ${ts.bl} T·m disagrees with Fs, Mms, Re and Qes, so it's left out (the app derives it).`);
    delete ts.bl;
    issues = bad();
  }
  return issues.length === 0;
}

// ---------------------------------------------------------------------------
// Crawling and writing
// ---------------------------------------------------------------------------

/**
 * On re-import, keep what this importer doesn't produce: a contributed
 * displacement, measurements and community submissions (their sources), and
 * a "verified" status. Dealer-page sources are replaced by Dayton's own.
 */
export function keepExisting(
  fresh: Driver | PassiveRadiator,
  old: { physical?: Driver["physical"]; sources?: Driver["sources"]; status?: string },
) {
  const disp = old.physical?.displacement_l;
  if (disp !== undefined && fresh.physical?.displacement_l === undefined) fresh.physical = { ...fresh.physical, displacement_l: disp };
  const extra = (old.sources ?? []).filter((x) => x.kind !== "datasheet" || /issue #\d+/i.test(x.note ?? ""));
  if (extra.length) fresh.sources = [...fresh.sources, ...extra];
  if (old.status === "verified") fresh.status = "verified";
}

const UA = "SpeakerBoxGenius-importer/1.0 (+https://github.com/daliusiv/speaker-box-genius; with Dayton Audio's permission)";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function fetchText(url: string): Promise<string> {
  for (let attempt = 1; ; attempt++) {
    const r = await fetch(url, { headers: { "User-Agent": UA } });
    if (r.ok) return r.text();
    if (attempt >= 3 || r.status === 404 || r.status === 403) throw new Error(`${r.status} ${url}`);
    await sleep(5000 * attempt);
  }
}

export const slugOf = (model: string) =>
  model
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

async function main() {
  const dry = process.argv.includes("--dry-run");
  const delay = Number(process.env.DELAY_MS ?? 1500);
  const today = new Date().toISOString().slice(0, 10);

  const productUrls = new Map<string, string>(); // id → url
  for (const c of CATEGORIES) {
    // The short address works for page 1, but paging only works on the category's own
    // address (e.g. /category/123/full-range-drivers), so follow its page links.
    const first = await fetchText(`${SITE}/category/${c.id}/${c.slug}`);
    await sleep(delay);
    const pager = parsePager(first, c.id);
    const pages = [first];
    for (let page = 2; pager && page <= Math.min(pager.last, 30); page++) {
      pages.push(await fetchText(`${SITE}${pager.path}?pagenum=${page}`));
      await sleep(delay);
    }
    pages.forEach((html, i) => {
      const before = productUrls.size;
      const links = parseCategory(html);
      for (const l of links) productUrls.set(l.match(/\/product\/(\d+)\//)![1]!, l);
      console.log(`${c.slug} p${i + 1}/${pages.length}: ${links.length} links, ${productUrls.size - before} new`);
    });
  }

  const written: string[] = [];
  const adjusted: string[] = [];
  const skipped: string[] = [];
  const seen = new Set<string>();
  for (const url of productUrls.values()) {
    let p: Parsed;
    try {
      p = parseProduct(await fetchText(url), url, today);
    } catch (e) {
      skipped.push(`${url} — ${(e as Error).message}`);
      continue;
    } finally {
      await sleep(delay);
    }
    if (p.kind === "skip") {
      skipped.push(`[${p.model || "?"}](${url}) — ${p.reason}`);
      continue;
    }
    const slug = slugOf(p.model);
    if (seen.has(slug)) continue; // listed in two categories
    seen.add(slug);
    const dir = join(REPO_ROOT, p.kind === "driver" ? "drivers" : "passive-radiators", "dayton-audio");
    const data = p.kind === "driver" ? p.driver! : p.pr!;
    const errs = p.kind === "driver" ? validateDriver(data) : validatePassiveRadiator(data);
    if (errs.length) {
      skipped.push(`[${p.model}](${url}) — ${errs.join("; ")}`);
      continue;
    }
    const line = `[${p.model}](${url})`;
    written.push(line);
    if (p.notes.length) adjusted.push(`${line} — ${p.notes.join(" ")}`);
    if (!dry) {
      mkdirSync(dir, { recursive: true });
      const file = join(dir, `${slug}.json`);
      if (existsSync(file)) keepExisting(data, JSON.parse(readFileSync(file, "utf8")));
      if (!existsSync(join(dir, "_brand.json")) && p.kind === "passive-radiator") {
        writeFileSync(join(dir, "_brand.json"), readFileSync(join(REPO_ROOT, "drivers/dayton-audio/_brand.json")));
      }
      writeFileSync(file, JSON.stringify(data, null, 2) + "\n");
    }
  }

  const report = [
    `## Dayton Audio import (${today})`,
    "",
    `Products found: ${productUrls.size}. Written: ${written.length}. Adjusted: ${adjusted.length}. Skipped: ${skipped.length}.`,
    "",
    "Source: product pages on daytonaudio.com, used with Dayton Audio's permission (see docs/data-permissions.md).",
    "",
    `### Adjusted (check these against the spec sheet)`,
    ...(adjusted.length ? adjusted.map((s) => `- ${s}`) : ["- none"]),
    "",
    `### Skipped`,
    ...(skipped.length ? skipped.map((s) => `- ${s}`) : ["- none"]),
    "",
  ].join("\n");
  writeFileSync(join(REPO_ROOT, "dayton-import-report.md"), report);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, report);
  console.log(report);
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
