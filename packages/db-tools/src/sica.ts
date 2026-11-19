/**
 * Sica importer.
 *
 * Sica (SICA Altoparlanti srl) gave permission (16 Nov 2026) to include their published
 * Thiele/Small parameters, credited to Sica with a link to each product page. They have
 * no file to share and asked us to take the values from the catalogue on sica.it. See
 * docs/data-permissions.md. robots.txt is checked on every run.
 *
 *   node … sica.ts            read sica.it and write drivers/sica/*.json
 *   node … sica.ts --dry-run  read and report only
 *
 * sica.it is a WooCommerce shop: the public Store API lists every product with its
 * categories and its spec table as attributes ("Re" → "5.7 Ω", "X max" → "+/- 5.2 mm").
 * Only numbers are taken, and every entry links to its product page. Compression
 * drivers, tweeters and horns are left out, and so are the Jensen guitar speakers sold
 * on the same site (Jensen isn't covered by the permission).
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import https from "node:https";
import { join } from "node:path";
import { validateDriver, type Driver } from "../../schema/src/index.ts";
import { checkConsistency } from "../../engine/src/ts.ts";
import { CONSISTENCY_ERROR, REPO_ROOT } from "./load.ts";
import { dropImplausible, firstNumber, keepExisting, reconcile, slugOf } from "./dayton.ts";
import { disallowed } from "./seas.ts";

export const SITE = "https://sica.it";
export const PERMISSION_NOTE = "Sica catalogue values (sica.it), used with Sica's permission (16 Nov 2026) under CC BY-NC-SA 4.0, credited to Sica.";
const BRAND = "Sica";
const BRAND_FILE = { name: BRAND, website: SITE, country: "IT" };

export interface StoreProduct {
  id: number;
  name: string;
  permalink: string;
  categories: { slug: string; name?: string }[];
  attributes: { name: string; terms: { name: string }[] }[];
}

type Kind = Driver["type"] | "coaxial" | "by-size";

/** Category slugs that are box-design material and what each implies (first match wins). */
const KINDS: [RegExp, Kind][] = [
  [/^coaxial$/, "coaxial"],
  [/^dual-cone$/, "full-range"],
  [/^subwoofer$/, "subwoofer"],
  [/^midrange$/, "midrange"],
  [/^hi-fi-studio-monitor$/, "by-size"],
  [/^professional-woofer$/, "by-size"],
];
const SKIP = /compression-driver|dome-tweeter|tweeter|horn|jensen/;

/** What a product is, from its categories: a kind, or skip (with why). */
export function kindOf(p: StoreProduct): { kind: Kind } | { skip: string } {
  const cats = p.categories.map((c) => c.slug);
  const skip = cats.find((c) => SKIP.test(c));
  if (skip) return { skip: `category ${skip}` };
  for (const [re, kind] of KINDS) if (cats.some((c) => re.test(c))) return { kind };
  return { skip: `no driver category (${cats.join(", ") || "none"})` };
}

const decode = (s: string) =>
  s
    .replace(/<[^>]+>/g, "")
    .replace(/&#8243;|&#8221;|″/g, '"')
    .replace(/&#215;/g, "×")
    .replace(/&#8211;/g, "–")
    .replace(/&#177;|&plusmn;/g, "±")
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/** "X max" → "xmax", "Le (1KHz)" → "le1khz", "Sensitivity @ 1W/1m" → "sensitivity1w1m". */
const norm = (s: string) => decode(s).toLowerCase().replace(/[^a-z0-9]/g, "");

/** Attribute labels to read, by normalised name. */
const LABELS = {
  diameter: /^nominaldiameter/,
  nominal: /^nominalimpedance|^impedance/,
  re: /^re$/,
  fs: /^fs$/,
  qms: /^qms$/,
  qes: /^qes$/,
  qts: /^qts$/,
  vas: /^vas$/,
  sd: /^sd$/,
  mms: /^mms$/,
  cms: /^cms$/,
  bl: /^bx?l$/,
  le: /^le(1khz)?$/,
  xmax: /^xmax$/,
  pe: /^ratedpower(aes)?$/,
  cutout: /^bafflecutout(diameter)?$/,
  depth: /^(total|overall)depth$/,
} as const;
export type Specs = Partial<Record<keyof typeof LABELS, string>>;

/**
 * One attribute's value. A coaxial lists both sections ("LF 5.1 Ω", "HF 6.0 Ω", as two
 * terms or one string): keep the LF (woofer) one.
 */
export function lfValue(terms: string[]): string {
  const all = terms.map(decode).filter(Boolean);
  const joined = all.join(" | ");
  const inline = joined.match(/\bLF\s*:?\s*([^|]*?)(?:\s*[-–,;/|]?\s*\bHF\b|$)/i);
  return (inline ? inline[1]! : (all[0] ?? "")).trim();
}

export function readSpecs(p: StoreProduct): Specs {
  const out: Specs = {};
  for (const a of p.attributes ?? []) {
    // Coaxials list each section as its own attribute ("Re (LF)", "Fs (HF)",
    // "Nominal Impedance LF"): keep the woofer's, drop the tweeter's.
    let n = norm(a.name);
    if (/^hf|hf$/.test(n)) continue;
    n = n.replace(/lf$/, "");
    for (const [key, re] of Object.entries(LABELS) as [keyof typeof LABELS, RegExp][]) {
      if (out[key] === undefined && re.test(n)) {
        out[key] = lfValue(a.terms.map((t) => t.name));
        break;
      }
    }
  }
  return out;
}

/** Nominal size in inches: "545 mm / 21 in" → 21, else the name's leading number ("12 SR 4 CP" → 12). */
export function sizeOf(name: string, diameter: string | undefined): number | undefined {
  const inch = diameter?.match(/(\d+(?:[.,]\d+)?)\s*(?:in\b|"|″)/i);
  if (inch) return Number(inch[1]!.replace(",", "."));
  const lead = decode(name).match(/^(\d+(?:\.\d+)?)\s/);
  const v = lead ? Number(lead[1]) : undefined;
  return v !== undefined && v >= 1 && v <= 30 ? v : undefined;
}

/** Cms in mm/N from "65 µm/N" (Sica's unit) or "0.065 mm/N". */
export function cmsMmPerN(s: string | undefined): number | undefined {
  const v = firstNumber(s);
  if (v === undefined) return undefined;
  return /mm\s*\/\s*N/i.test(s!) ? v : v / 1000;
}

export interface Parsed {
  kind: "driver" | "skip";
  reason?: string;
  notes: string[];
  model: string;
  driver?: Driver;
}

const round = (v: number, d: number) => Math.round(v * 10 ** d) / 10 ** d;

export function parseProduct(p: StoreProduct, retrieved: string): Parsed {
  const notes: string[] = [];
  const model = decode(p.name);
  const base = { notes, model };
  const k = kindOf(p);
  if ("skip" in k) return { kind: "skip", reason: k.skip, ...base };
  if (!model) return { kind: "skip", reason: "no model name", ...base };

  const s = readSpecs(p);
  const size_in = sizeOf(p.name, s.diameter);
  if (/^\s*2\s*[x×]/i.test(s.nominal ?? "") || /^\s*2\s*[x×]/i.test(s.re ?? "")) {
    return { kind: "skip", reason: `dual voice coil (${s.nominal ?? s.re}): wiring of the published values not stated`, ...base };
  }

  const fs = firstNumber(s.fs);
  const qms = firstNumber(s.qms);
  const qes = firstNumber(s.qes);
  const vas = firstNumber(s.vas);
  const re = firstNumber(s.re);
  const sd = firstNumber(s.sd);
  const missing = Object.entries({ fs, qms, qes, vas, re, sd })
    .filter(([, v]) => v === undefined)
    .map(([key]) => key);
  if (missing.length) return { kind: "skip", reason: `missing ${missing.join(", ")} (attributes: ${(p.attributes ?? []).map((a) => a.name).join(", ") || "none"})`, ...base };

  let type: Driver["type"];
  if (k.kind === "coaxial") {
    notes.push("Coaxial: the woofer's parameters (the tweeter's are left out).");
    type = size_in !== undefined && size_in < 10 ? "midbass" : "woofer";
  } else if (k.kind === "by-size") type = size_in !== undefined && size_in < 10 ? "midbass" : "woofer";
  else type = k.kind;

  const ts: Driver["ts"] = { fs: fs!, qms: qms!, qes: qes!, vas_l: vas!, re: re!, sd_cm2: sd! };
  const qts = firstNumber(s.qts);
  if (qts !== undefined) ts.qts = qts;
  const le = firstNumber(s.le);
  if (le !== undefined) ts.le_mh = le;
  const bl = firstNumber(s.bl);
  if (bl !== undefined) ts.bl = bl;
  const mms = firstNumber(s.mms);
  if (mms !== undefined) ts.mms_g = mms;
  const xmax = firstNumber(s.xmax?.replace(/±|\+\s*\/\s*-/g, ""));
  if (xmax !== undefined) ts.xmax_mm = xmax;
  const pe = firstNumber(s.pe);
  if (pe !== undefined) ts.pe_w = pe;

  if (!reconcile(ts, cmsMmPerN(s.cms), notes)) {
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
  const cutout = firstNumber(s.cutout);
  if (cutout !== undefined) physical.cutout_mm = cutout;
  const depth = firstNumber(s.depth);
  if (depth !== undefined) physical.depth_mm = depth;
  dropImplausible(ts, physical, notes, size_in);

  const nominal = firstNumber(s.nominal) ?? (re! < 4.5 ? 4 : re! < 9 ? 8 : 16);
  if (s.nominal === undefined) notes.push(`No nominal impedance published; ${nominal} Ω assumed from Re.`);

  const driver: Driver = {
    brand: BRAND,
    model,
    type,
    nominal_ohms: nominal,
    ...(size_in ? { size_in } : {}),
    ts,
    ...(Object.keys(physical).length ? { physical } : {}),
    sources: [{ kind: "datasheet", url: p.permalink, retrieved, note: PERMISSION_NOTE }],
    status: "community",
    ...(notes.length ? { notes: notes.join(" ") } : {}),
  };
  return { kind: "driver", driver, ...base };
}

// ---------------------------------------------------------------------------
// Crawling and writing
// ---------------------------------------------------------------------------

const UA = "SpeakerBoxGenius-importer/1.0 (+https://github.com/daliusiv/speaker-box-genius; with Sica's permission)";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function get(url: string): Promise<{ status: number; body: string; location?: string }> {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { "User-Agent": UA, Accept: "application/json,text/plain;q=0.9,*/*;q=0.8" }, timeout: 40000 }, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (c: Buffer) => chunks.push(c));
      res.on("end", () => resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString("utf8"), ...(res.headers.location ? { location: res.headers.location } : {}) }));
    });
    req.on("timeout", () => req.destroy(new Error(`timeout ${url}`)));
    req.on("error", reject);
  });
}

async function fetchText(url: string): Promise<string> {
  for (let attempt = 1; ; attempt++) {
    let r = await get(url);
    for (let hops = 0; r.status >= 300 && r.status < 400 && r.location && hops < 5; hops++) r = await get(new URL(r.location, url).toString());
    if (r.status >= 200 && r.status < 300) return r.body;
    if (attempt >= 3 || r.status === 404 || r.status === 403) throw new Error(`${r.status} ${url}`);
    await sleep(5000 * attempt);
  }
}

/** Notes every entry of a kind gets: kept on the entry, left out of the "check these" list. */
const ROUTINE = [/^Coaxial:/];

async function main() {
  const dry = process.argv.includes("--dry-run");
  const delay = Number(process.env.DELAY_MS ?? 1500);
  const today = new Date().toISOString().slice(0, 10);

  let robots = "";
  try {
    robots = await fetchText(`${SITE}/robots.txt`);
  } catch {
    // No robots.txt: nothing is disallowed.
  }
  const blocked = disallowed(robots);
  console.log(`robots.txt disallows: ${blocked.join(" ") || "nothing"}`);
  const api = "/wp-json/wc/store/v1/products";
  if (blocked.some((b) => api.startsWith(b) || (b.endsWith("*") && api.startsWith(b.slice(0, -1))))) throw new Error(`robots.txt disallows ${api}`);

  const products: StoreProduct[] = [];
  for (let page = 1; page <= 20; page++) {
    const batch = JSON.parse(await fetchText(`${SITE}${api}?per_page=100&page=${page}`)) as StoreProduct[];
    await sleep(delay);
    if (batch.length === 0) break;
    products.push(...batch);
    if (batch.length < 100) break;
  }
  console.log(`${products.length} products`);

  const written: string[] = [];
  const adjusted: string[] = [];
  const skipped: string[] = [];
  const notImported = new Map<string, number>();
  const seen = new Set<string>();
  for (const p of products) {
    const r = parseProduct(p, today);
    const line = `[${r.model}](${p.permalink})`;
    if (r.kind === "skip") {
      if (/^category |^no driver category/.test(r.reason ?? "")) notImported.set(r.reason!, (notImported.get(r.reason!) ?? 0) + 1);
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
      const dir = join(REPO_ROOT, "drivers", "sica");
      mkdirSync(dir, { recursive: true });
      if (!existsSync(join(dir, "_brand.json"))) writeFileSync(join(dir, "_brand.json"), JSON.stringify(BRAND_FILE, null, 2) + "\n");
      const file = join(dir, `${slug}.json`);
      if (existsSync(file)) keepExisting(r.driver!, JSON.parse(readFileSync(file, "utf8")));
      writeFileSync(file, JSON.stringify(r.driver, null, 2) + "\n");
    }
  }

  const report = [
    `## Sica import (${today})`,
    "",
    `Products listed: ${products.length}. Written: ${written.length}. Adjusted: ${adjusted.length}. Skipped: ${skipped.length}. Not box drivers (tweeters, compression drivers, horns, Jensen…): ${[...notImported.values()].reduce((a, b) => a + b, 0)}.`,
    "",
    "Source: the product catalogue on sica.it (WooCommerce Store API), used with Sica's permission (see docs/data-permissions.md).",
    "",
    "Routine, noted on each entry: coaxials keep the woofer's values. Xmax is Sica's published value (10 % THD); Xvar isn't used.",
    "",
    "### Adjusted or noted (check these against the product page)",
    ...(adjusted.length ? adjusted.map((x) => `- ${x}`) : ["- none"]),
    "",
    "### Skipped",
    ...(skipped.length ? skipped.map((x) => `- ${x}`) : ["- none"]),
    "",
    "### Not imported, by category",
    ...(notImported.size ? [...notImported].map(([why, n]) => `- ${why}: ${n}`) : ["- none"]),
    "",
  ].join("\n");
  writeFileSync(join(REPO_ROOT, "sica-import-report.md"), report);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, report);
  console.log(report);
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
