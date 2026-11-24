/**
 * Accuton importer.
 *
 * Accuton (Thiel & Partner GmbH) gave permission (Dirk Vaehsen, 19 Nov 2026) to use the
 * data on accuton.com, on the condition that it can be updated when Accuton changes it
 * (they are re-measuring their range). So the values are read from the website by this
 * script, run by hand and once a month by the Accuton import workflow. See
 * docs/data-permissions.md. robots.txt is checked on every run.
 *
 *   node … accuton.ts                    read accuton.com and write drivers/accuton/*.json
 *   node … accuton.ts --dry-run          read and report only
 *   node … accuton.ts --pages FILE.json  use pages already read (an array of `Page`), no network
 *
 * accuton.com (Concrete CMS) has a page per material ("Diamond", "Ceramic" …) linking to a
 * page per driver, whose spec tables are rows of name | symbol | value | unit. Only
 * numbers are taken, and every entry links to its product page. Tweeters are left out,
 * and so are the passive radiators for now (no PR importer here yet).
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { validateDriver, type Driver } from "../../schema/src/index.ts";
import { checkConsistency } from "../../engine/src/ts.ts";
import { CONSISTENCY_ERROR, REPO_ROOT } from "./load.ts";
import { dropImplausible, keepExisting, reconcile, slugOf } from "./dayton.ts";
import { disallowed } from "./seas.ts";

export const SITE = "https://accuton.com";
export const PERMISSION_NOTE =
  "Values from the product pages on accuton.com, used with Accuton's permission (19 Nov 2026), re-read from the website each month. Not covered by CC BY-NC-SA 4.0 while the licence question is open: do not reuse outside Speaker Box Genius without Accuton's permission. See LICENSE-DATA.";
const BRAND = "Accuton";
export const BRAND_FILE = {
  name: BRAND,
  website: SITE,
  country: "DE",
  licence:
    "Not covered by CC BY-NC-SA 4.0. Values from the product pages on accuton.com, used in Speaker Box Genius with Accuton's permission (19 Nov 2026), on the condition that they're kept up to date with the website. Do not reuse outside Speaker Box Genius without Accuton's permission.",
};

/** Listing pages, and whether their drivers are car audio. */
export const CATEGORIES: { path: string; car?: boolean }[] = [
  { path: "/home-audio/drivers/diamond" },
  { path: "/home-audio/drivers/ceramic" },
  { path: "/home-audio/drivers/crystalid" },
  { path: "/home-audio/drivers/aluminium-sandwich" },
  { path: "/home-audio/drivers/sandwich" },
  { path: "/home-audio/drivers/custom-drivers" },
  { path: "/home-audio/drivers/hall-of-fame" },
  { path: "/home-audio/drivers/passive-radiator" },
  { path: "/automotive/drivers", car: true },
];

/** One product page, as read from accuton.com (or saved from a browser). */
export interface Page {
  url: string;
  /** The page's h1: "C220-6-221*", "BD 90-6-727", "Cl173-6-191*". */
  title: string;
  /** The features table's "Application": "Bass-Midrange", "MIDRANGE", "Passive Radiator" … */
  application: string;
  /** Spec table rows: [name, symbol, value, unit]. */
  rows: string[][];
  car?: boolean;
}

const decode = (s: string) =>
  s
    .replace(/<[^>]+>/g, "")
    .replace(/&plusmn;|&#177;/g, "±")
    .replace(/&Oslash;|&#216;/g, "Ø")
    .replace(/&nbsp;|&#160;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();

/** Product links on a listing page: one path segment below the listing. */
export function parseListing(html: string, listing: string): string[] {
  const out = new Set<string>();
  for (const m of html.matchAll(/href\s*=\s*"([^"]+)"/g)) {
    let u: URL;
    try {
      u = new URL(decode(m[1]!), SITE);
    } catch {
      continue;
    }
    if (u.hostname.replace(/^www\./, "") !== "accuton.com") continue;
    const path = u.pathname.replace(/\/$/, "");
    if (!path.startsWith(`${listing}/`)) continue;
    if (path.slice(listing.length + 1).includes("/")) continue;
    out.add(`${SITE}${path}`);
  }
  return [...out];
}

/** The rows of every table whose class matches. */
function tableRows(html: string, cls: RegExp): string[][] {
  const rows: string[][] = [];
  for (const t of html.matchAll(/<table\b([^>]*)>([\s\S]*?)<\/table>/gi)) {
    const c = t[1]!.match(/class\s*=\s*"([^"]*)"/i)?.[1] ?? "";
    if (!cls.test(c)) continue;
    for (const r of t[2]!.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
      rows.push([...r[1]!.matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((c) => decode(c[1]!)));
    }
  }
  return rows;
}

export function parsePage(html: string, url: string, car = false): Page {
  const title = decode(html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1] ?? "");
  const features = tableRows(html, /featuresTable/);
  const application = features.find((r) => /^application$/i.test(r[0] ?? ""))?.[1] ?? "";
  const rows = tableRows(html, /table-striped/).filter((r) => r.length >= 3 && r[0] && !/^specification$/i.test(r[0]));
  return { url, title, application, rows, ...(car ? { car } : {}) };
}

/**
 * A number as Accuton writes it: "26.3", "21,37" (decimal comma), "0..40" (typo for 0.40),
 * "120*", "+/-5.25". Placeholders ("-", "--", "0" where 0 can't be meant) are missing.
 */
export function num(s: string | undefined, zeroIsMissing = true): number | undefined {
  if (s === undefined) return undefined;
  const t = s
    .replace(/±|\+\s*\/\s*-/g, "")
    .replace(/(\d)\.{2,}(\d)/, "$1.$2")
    .replace(/(\d),(\d)/, "$1.$2")
    .replace(/\*/g, "")
    .trim();
  const m = t.match(/^-?\d+(?:\.\d+)?/);
  if (!m) return undefined;
  const v = Number(m[0]);
  if (!Number.isFinite(v) || (zeroIsMissing && v === 0)) return undefined;
  return v;
}

/** Spec values by symbol (or by name for rows with none), first one wins. */
export function specs(rows: string[][]): Map<string, string> {
  const out = new Map<string, string>();
  for (const r of rows) {
    const sym = (r[1] ?? "").trim().toLowerCase();
    const name = (r[0] ?? "").trim().toLowerCase().replace(/\)$/, "");
    const key = sym || name;
    if (key && !out.has(key)) out.set(key, r[2] ?? "");
  }
  return out;
}

/** "C220-6-221*" → "C220-6-221", "BD 90-6-727" → "BD90-6-727", "Cl173-6-191*" → "CL173-6-191", "C51-6-286 CELL" → "C51-6-286 Cell". */
export function modelOf(title: string): string {
  return title
    .replace(/\*/g, "")
    .trim()
    .replace(/^([A-Za-z]+)\s+(\d)/, "$1$2")
    .replace(/^[A-Za-z]+/, (p) => p.toUpperCase())
    .replace(/\s+cell$/i, " Cell");
}

/** Nominal impedance from the model code: C220-**6**-221, C6.5AM-**6**-670, AS250AM-**4**-559. */
export function nominalOf(model: string): number | undefined {
  const m = model.match(/^[A-Z]+[\d.]+[A-Z]*-0?(\d{1,2})-\d/);
  const v = m ? Number(m[1]) : undefined;
  return v !== undefined && v >= 2 && v <= 16 ? v : undefined;
}

/** Nominal size in inches from the overall diameter, to the nearest half inch. */
export const sizeOf = (overall_mm: number | undefined) => (overall_mm ? Math.round((overall_mm / 25.4) * 2) / 2 : undefined);

export interface Parsed {
  kind: "driver" | "skip";
  reason?: string;
  notes: string[];
  model: string;
  driver?: Driver;
}


export function typeOf(application: string, size_in: number | undefined, car: boolean): Driver["type"] | { skip: string } {
  const a = application.toLowerCase().replace(/[^a-z]/g, "");
  if (/tweeter/.test(a)) return { skip: "tweeter" };
  if (/passiveradiator/.test(a)) return { skip: "passive radiator (not imported yet)" };
  if (car) return "car-audio";
  if (a === "midrange") return "midrange";
  if (a === "bassmidrange") return size_in !== undefined && size_in >= 8 ? "woofer" : "midbass";
  if (a === "bass") return "woofer";
  if (a === "subwoofer") return "subwoofer";
  if (!a) return { skip: "no application given (not a driver page?)" };
  return { skip: `application "${application}"` };
}

export function parseProduct(p: Page, retrieved: string): Parsed {
  const notes: string[] = [];
  const model = modelOf(p.title);
  const base = { notes, model };
  if (!model) return { kind: "skip", reason: "no model name", ...base };
  const s = specs(p.rows);
  const overall = num(s.get("overall diameter"));
  const size_in = sizeOf(overall);
  const type = typeOf(p.application, size_in, !!p.car);
  if (typeof type !== "string") return { kind: "skip", reason: type.skip, ...base };

  const fs = num(s.get("fs"));
  const qms = num(s.get("qms"));
  const qes = num(s.get("qes"));
  const vas = num(s.get("vas"));
  const re = num(s.get("re"));
  const sd = num(s.get("sd"));
  const missing = Object.entries({ fs, qms, qes, vas, re, sd })
    .filter(([, v]) => v === undefined)
    .map(([k]) => k);
  if (missing.length) return { kind: "skip", reason: `missing ${missing.join(", ")}`, ...base };

  const ts: Driver["ts"] = { fs: fs!, qms: qms!, qes: qes!, vas_l: vas!, re: re!, sd_cm2: sd! };
  const qts = num(s.get("qts"));
  if (qts !== undefined) ts.qts = qts;
  const mms = num(s.get("mms"));
  if (mms !== undefined) ts.mms_g = mms;
  const le = num(s.get("le"));
  if (le !== undefined) ts.le_mh = le;
  const bl = num(s.get("bl"));
  if (bl !== undefined) ts.bl = bl;
  const xmax = num(s.get("xmax"));
  if (xmax !== undefined) ts.xmax_mm = xmax;
  const pe = num(s.get("p"));
  if (pe !== undefined) ts.pe_w = pe;

  if (!reconcile(ts, num(s.get("cms")), notes)) {
    return {
      kind: "skip",
      reason: `published values disagree (${checkConsistency(ts)
        .filter((i) => i.diff > CONSISTENCY_ERROR)
        .map((i) => i.message)
        .join("; ")})`,
      ...base,
    };
  }

  const physical: NonNullable<Driver["physical"]> = {};
  const cutout = num(s.get("cutout diameter"));
  if (cutout !== undefined) physical.cutout_mm = cutout;
  const depth = num(s.get("overall depth"));
  if (depth !== undefined) physical.depth_mm = depth;
  dropImplausible(ts, physical, notes, size_in);

  let nominal = nominalOf(model);
  if (nominal === undefined) {
    nominal = re! < 4.5 ? 4 : re! < 9 ? 8 : 16;
    notes.push(`No nominal impedance in the model code; ${nominal} Ω assumed from Re.`);
  } else if (re! > nominal * 1.25) {
    notes.push(`Published Re ${re} Ω is high for the ${nominal} Ω in the model code; check against the product page.`);
  }

  const driver: Driver = {
    brand: BRAND,
    model,
    type,
    nominal_ohms: nominal,
    ...(size_in ? { size_in } : {}),
    ts,
    ...(Object.keys(physical).length ? { physical } : {}),
    sources: [{ kind: "datasheet", url: p.url, retrieved, note: PERMISSION_NOTE }],
    status: "community",
    ...(notes.length ? { notes: notes.join(" ") } : {}),
  };
  return { kind: "driver", driver, ...base };
}

// ---------------------------------------------------------------------------
// Crawling and writing
// ---------------------------------------------------------------------------

const UA = "SpeakerBoxGenius-importer/1.0 (+https://github.com/daliusiv/speaker-box-genius; with Accuton's permission)";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function fetchText(url: string): Promise<string> {
  for (let attempt = 1; ; attempt++) {
    const r = await fetch(url, { headers: { "User-Agent": UA } });
    if (r.ok) return r.text();
    if (attempt >= 3 || r.status === 404 || r.status === 403) throw new Error(`${r.status} ${url}`);
    await sleep(5000 * attempt);
  }
}

async function crawl(delay: number): Promise<Page[]> {
  let robots = "";
  try {
    robots = await fetchText(`${SITE}/robots.txt`);
  } catch {
    // No robots.txt: nothing is disallowed.
  }
  const blocked = disallowed(robots);
  console.log(`robots.txt disallows: ${blocked.join(" ") || "nothing"}`);
  const allowed = (path: string) => !blocked.some((b) => path.startsWith(b.replace(/\*$/, "")));

  const pages: Page[] = [];
  const seen = new Set<string>();
  for (const c of CATEGORIES) {
    if (!allowed(c.path)) throw new Error(`robots.txt disallows ${c.path}`);
    const links = parseListing(await fetchText(`${SITE}${c.path}`), c.path);
    await sleep(delay);
    for (const url of links) {
      if (seen.has(url)) continue;
      seen.add(url);
      pages.push(parsePage(await fetchText(url), url, !!c.car));
      await sleep(delay);
    }
  }
  return pages;
}

/** Notes every entry of a kind gets: kept on the entry, left out of the "check these" list. */
const ROUTINE: RegExp[] = [];

async function main() {
  const args = process.argv.slice(2);
  const dry = args.includes("--dry-run");
  const pagesArg = args.indexOf("--pages");
  const delay = Number(process.env.DELAY_MS ?? 1500);
  const today = new Date().toISOString().slice(0, 10);

  const pages: Page[] = pagesArg >= 0 ? (JSON.parse(readFileSync(args[pagesArg + 1]!, "utf8")) as Page[]) : await crawl(delay);
  console.log(`${pages.length} product pages`);

  const written: string[] = [];
  const adjusted: string[] = [];
  const skipped: string[] = [];
  const notImported = new Map<string, number>();
  const seen = new Set<string>();
  const dir = join(REPO_ROOT, "drivers", "accuton");
  for (const p of pages) {
    const r = parseProduct(p, today);
    const line = `[${r.model || p.url}](${p.url})`;
    if (r.kind === "skip") {
      if (/^tweeter|^passive radiator|^no application/.test(r.reason ?? "")) notImported.set(r.reason!, (notImported.get(r.reason!) ?? 0) + 1);
      else skipped.push(`${line} — ${r.reason}`);
      continue;
    }
    const slug = slugOf(r.model);
    if (seen.has(slug)) continue;
    seen.add(slug);
    const errs = validateDriver(r.driver!);
    if (errs.length) {
      skipped.push(`${line} — ${errs.join("; ")}`);
      continue;
    }
    written.push(line);
    const check = r.notes.filter((n) => !ROUTINE.some((re) => re.test(n)));
    if (check.length) adjusted.push(`${line} — ${check.join(" ")}`);
    if (!dry) {
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, "_brand.json"), JSON.stringify(BRAND_FILE, null, 2) + "\n");
      const file = join(dir, `${slug}.json`);
      if (existsSync(file)) keepExisting(r.driver!, JSON.parse(readFileSync(file, "utf8")));
      writeFileSync(file, JSON.stringify(r.driver, null, 2) + "\n");
    }
  }

  const report = [
    `## Accuton import (${today})`,
    "",
    `Product pages: ${pages.length}. Written: ${written.length}. Adjusted or noted: ${adjusted.length}. Skipped: ${skipped.length}. Not imported (tweeters, passive radiators, other pages): ${[...notImported.values()].reduce((a, b) => a + b, 0)}.`,
    "",
    "Source: the product pages on accuton.com, used with Accuton's permission (see docs/data-permissions.md). Accuton asked for the data to follow their website, so this runs once a month.",
    "",
    "### Adjusted or noted (check these against the product page)",
    ...(adjusted.length ? adjusted.map((x) => `- ${x}`) : ["- none"]),
    "",
    "### Skipped",
    ...(skipped.length ? skipped.map((x) => `- ${x}`) : ["- none"]),
    "",
    "### Not imported",
    ...(notImported.size ? [...notImported].map(([why, n]) => `- ${why}: ${n}`) : ["- none"]),
    "",
  ].join("\n");
  writeFileSync(join(REPO_ROOT, "accuton-import-report.md"), report);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, report);
  console.log(report);
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
