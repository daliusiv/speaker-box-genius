/**
 * SB Acoustics importer.
 *
 * SB Acoustics gave permission (4 Nov 2026) to post their published specs and to
 * gather them with a script. See docs/data-permissions.md. robots.txt allows the
 * product pages and the shop's public product list.
 *
 *   node … sb.ts            read sbacoustics.com and write drivers/sb-acoustics/*.json
 *   node … sb.ts --dry-run  read and report only
 *
 * The product list (with categories) comes from the WooCommerce Store API; each
 * product page lists its specs as "Label, Symbol value unit" items. Only numbers are
 * taken, and every entry links to its product page and datasheet. Tweeters, ring
 * radiators, kits and accessories are left out. Entries this replaces came from
 * driver-base; SB models not on the site any more keep their driver-base entry.
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import https from "node:https";
import { join } from "node:path";
import { validateDriver, validatePassiveRadiator, type Driver, type PassiveRadiator } from "../../schema/src/index.ts";
import { checkConsistency } from "../../engine/src/ts.ts";
import { CONSISTENCY_ERROR, REPO_ROOT } from "./load.ts";
import { dropImplausible, firstNumber, keepExisting, reconcile, slugOf } from "./dayton.ts";

export const SITE = "https://sbacoustics.com";
export const PERMISSION_NOTE = "SB Acoustics product page specifications, used with SB Acoustics' permission (4 Nov 2026).";
const BRAND = "SB Acoustics";

export interface StoreProduct {
  id: number;
  name: string;
  permalink: string;
  categories: { slug: string }[];
}

/** Categories that are box-design material, and the driver type each implies (first match wins). */
const KINDS: [RegExp, Driver["type"] | "passive-radiator"][] = [
  [/passive-radiators/, "passive-radiator"],
  [/^(shallow-)?subwoofers/, "subwoofer"],
  [/midranges|midrange/, "midrange"],
  [/widebanders|wideband|full-range/, "full-range"],
  [/midwoofers/, "midbass"],
  [/woofers/, "woofer"],
  [/coaxials/, "midbass"],
];
const SKIP_CATEGORIES = /tweeters|ring-radiators|kits|accessories|filler-drivers|softtw/;

/** What a product is, from its categories: a driver type, a passive radiator, or skip (with why). */
export function kindOf(p: StoreProduct): { kind: Driver["type"] | "passive-radiator" } | { skip: string } {
  const cats = p.categories.map((c) => c.slug);
  for (const [re, kind] of KINDS) if (cats.some((c) => re.test(c))) return { kind };
  const other = cats.find((c) => SKIP_CATEGORIES.test(c));
  return { skip: other ? `category ${other}` : `no driver category (${cats.join(", ") || "none"})` };
}

const decode = (s: string) =>
  s
    .replace(/<[^>]+>/g, "")
    .replace(/&#8243;|&#8221;|″/g, '"')
    .replace(/&#215;/g, "×")
    .replace(/&#8211;/g, "–")
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/** Model and nominal size from a product name such as '7½″ SATORI MW19TX-4 / TeXtreme'. */
export function parseName(name: string): { model: string; size_in?: number } {
  const n = decode(name);
  const size = n.match(/^(\d+)(½)?"/);
  const size_in = size && !/^\d+×/.test(n) ? Number(size[1]) + (size[2] ? 0.5 : 0) : undefined;
  const model = n
    .replace(/^[\d½×]+"\s*/, "")
    .replace(/\s*\/.*$/, "")
    .replace(/^SATORI\s+/i, "")
    .trim();
  return { model, ...(size_in ? { size_in } : {}) };
}

/** The spec items on a product page: "Label value unit", in order, decoded. */
export function specItems(html: string): string[] {
  return [...html.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/g)].map((m) => decode(m[1]!)).filter((t) => t.length < 100);
}

/** Labels to read, each matching the start of a spec item (the value follows). */
const LABELS: Record<string, RegExp> = {
  nominal: /^Nominal Impedance\b/i,
  re: /^DC resistance,?\s*Re\b/i,
  le: /^Voice coil inductance,?\s*Le\b/i,
  sd: /^Effective (?:piston|diaphragm) area,?\s*Sd\b/i,
  travel: /^Linear coil travel \(p-p\)/i,
  xmax: /^(?:Max(?:imum)? linear excursion|Linear excursion),?\s*Xmax\b/i,
  xmech: /^Maximum mechanical cone excursion,?\s*Xmech\b/i,
  fs: /^Free air resonance,?\s*Fs\b/i,
  qms: /^Mechanical Q-factor,?\s*Qms\b/i,
  qes: /^Electrical Q-factor,?\s*Qes\b/i,
  qts: /^Total Q-factor,?\s*Qts\b/i,
  mms: /^Moving mass incl\.? air,?\s*Mms\b/i,
  bl: /^Force factor,?\s*Bl\b/i,
  vas: /^Equivalent volume,?\s*Vas\b/i,
  cms: /^Compliance,?\s*Cms\b/i,
  rms: /^Mechanical loss,?\s*Rms\b/i,
  pe: /^Rated power handling/i,
};

/**
 * The first block of specs (a coaxial lists the woofer, then the tweeter: stop when a
 * label comes round again). Values are the text after the label.
 */
export function readSpecs(items: string[]): Partial<Record<keyof typeof LABELS, string>> {
  const out: Partial<Record<keyof typeof LABELS, string>> = {};
  for (const item of items) {
    for (const [key, re] of Object.entries(LABELS) as [keyof typeof LABELS, RegExp][]) {
      const m = item.match(re);
      if (!m) continue;
      if (out[key] !== undefined) return out; // second block
      out[key] = item.slice(m[0].length).trim();
      break;
    }
  }
  return out;
}

/** "2 x 2.4 Ω" → { coils: 2, value: 2.4 }; "3.4 Ω" → { coils: 1, value: 3.4 }. */
export function perCoil(s: string | undefined): { coils: 1 | 2; value: number } | undefined {
  if (!s) return undefined;
  const two = s.match(/^2\s*[x×]\s*(\d+(?:[.,]\d+)?)/i);
  if (two) return { coils: 2, value: Number(two[1]!.replace(",", ".")) };
  const v = firstNumber(s);
  return v === undefined ? undefined : { coils: 1, value: v };
}

export interface Parsed {
  kind: "driver" | "passive-radiator" | "skip";
  reason?: string;
  notes: string[];
  model: string;
  driver?: Driver;
  pr?: PassiveRadiator;
}

const round = (v: number, d: number) => Math.round(v * 10 ** d) / 10 ** d;

export function parseProduct(p: StoreProduct, html: string, retrieved: string): Parsed {
  const notes: string[] = [];
  const { model, size_in } = parseName(p.name);
  const base = { notes, model };
  const k = kindOf(p);
  if ("skip" in k) return { kind: "skip", reason: k.skip, ...base };
  if (!model) return { kind: "skip", reason: "no model name", ...base };

  const s = readSpecs(specItems(html));
  const pdf = html.match(/href="(https:\/\/sbacoustics\.com\/wp-content\/uploads\/[^"]+\.pdf)"/i)?.[1];
  const sources: Driver["sources"] = [{ kind: "datasheet", url: p.permalink, retrieved, note: PERMISSION_NOTE }];
  if (pdf) sources.push({ kind: "datasheet", url: encodeURI(decodeURI(pdf)), retrieved, note: "SB Acoustics datasheet (PDF)." });
  const isCoax = p.categories.some((c) => /coaxials/.test(c.slug));
  if (isCoax) notes.push("Coaxial: the woofer's parameters (the tweeter's are left out).");
  if (p.categories.length > 0 && p.categories.every((c) => /oem|family-product|new-products/.test(c.slug))) notes.push("Listed by SB Acoustics as OEM only.");

  const fs = firstNumber(s.fs);
  const qms = firstNumber(s.qms);
  const sd = firstNumber(s.sd);
  const mms = firstNumber(s.mms);
  const cms = firstNumber(s.cms);
  const vas = firstNumber(s.vas);
  const travel = firstNumber(s.travel);
  const xmaxStated = firstNumber(s.xmax);

  if (k.kind === "passive-radiator") {
    const xmech = firstNumber(s.xmech?.replace(/±/g, ""));
    const xmax = xmaxStated ?? xmech;
    if (mms === undefined || sd === undefined || xmax === undefined) {
      return { kind: "skip", reason: `passive radiator without Mms, Sd and Xmax/Xmech (found: ${Object.keys(s).join(", ") || "nothing"})`, ...base };
    }
    if (xmaxStated === undefined) notes.push(`Xmax is the published maximum mechanical excursion (Xmech ±${xmech} mm), not a linear limit.`);
    const params: PassiveRadiator["params"] = { mms_g: mms, sd_cm2: sd, xmax_mm: xmax };
    if (fs !== undefined) params.fs = fs;
    if (qms !== undefined) params.qms = qms;
    if (vas !== undefined) params.vas_l = vas;
    if (cms !== undefined) params.cms_mm_per_n = cms;
    const pr: PassiveRadiator = {
      brand: BRAND,
      model,
      type: "passive-radiator",
      ...(size_in ? { size_in } : {}),
      params,
      sources,
      status: "community",
      ...(notes.length ? { notes: notes.join(" ") } : {}),
    };
    return { kind: "passive-radiator", pr, ...base };
  }

  const qes = firstNumber(s.qes);
  const qts = firstNumber(s.qts);
  const reC = perCoil(s.re);
  const zC = perCoil(s.nominal);
  const missing = Object.entries({ fs, qms, qes, vas, re: reC, sd })
    .filter(([, v]) => v === undefined)
    .map(([key]) => key);
  if (missing.length) return { kind: "skip", reason: `missing ${missing.join(", ")}`, ...base };

  // Dual voice coils: SB gives Re and impedance per coil, and Bl as "parallel/series".
  // Qes is the same either way (Bl²/Re scales alike), so the entry is wired in parallel.
  const dvc = reC!.coils === 2 || zC?.coils === 2;
  const coilRe = reC!.value;
  const re = dvc ? coilRe / 2 : coilRe;
  const nominal = dvc ? (zC?.value ?? coilRe * 1.25) / 2 : (zC?.value ?? 4);
  const blText = s.bl ?? "";
  const blPair = blText.match(/(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)/);
  const bl = blPair ? Number(blPair[1]) : firstNumber(blText);
  if (dvc) notes.push(`Dual voice coil (2 × ${coilRe} Ω): values for the coils in parallel${blPair ? ` (Bl ${blPair[1]} T·m parallel, ${blPair[2]} series)` : ""}.`);

  const ts: Driver["ts"] = { fs: fs!, qms: qms!, qes: qes!, vas_l: vas!, re: round(re, 3), sd_cm2: sd! };
  if (qts !== undefined) ts.qts = qts;
  const le = firstNumber(s.le);
  if (le !== undefined) ts.le_mh = le;
  if (bl !== undefined) ts.bl = bl;
  if (mms !== undefined) ts.mms_g = mms;
  if (xmaxStated !== undefined) ts.xmax_mm = xmaxStated;
  else if (travel !== undefined) {
    ts.xmax_mm = round(travel / 2, 2);
    notes.push(`Xmax ${ts.xmax_mm} mm is half the published linear coil travel (${travel} mm peak to peak).`);
  }
  const pe = firstNumber(s.pe);
  if (pe !== undefined) ts.pe_w = pe;

  if (!reconcile(ts, cms, notes)) {
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
  dropImplausible(ts, physical, notes, size_in);

  const driver: Driver = {
    brand: BRAND,
    model,
    type: k.kind,
    nominal_ohms: nominal,
    ...(size_in ? { size_in } : {}),
    ts,
    sources,
    status: "community",
    ...(dvc ? { voice_coils: 2 as const, ts_wiring: "parallel" as const } : {}),
    ...(notes.length ? { notes: notes.join(" ") } : {}),
  };
  return { kind: "driver", driver, ...base };
}

// ---------------------------------------------------------------------------
// Crawling and writing
// ---------------------------------------------------------------------------

const UA = "SpeakerBoxGenius-importer/1.0 (+https://github.com/daliusiv/speaker-box-genius; with SB Acoustics' permission)";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** One GET with plain headers (the site's firewall refuses fetch()'s browser-style ones). */
function get(url: string): Promise<{ status: number; body: string; location?: string }> {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { "User-Agent": UA, Accept: "text/html,application/json;q=0.9,*/*;q=0.8" }, timeout: 40000 }, (res) => {
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

async function main() {
  const dry = process.argv.includes("--dry-run");
  const delay = Number(process.env.DELAY_MS ?? 1500);
  const today = new Date().toISOString().slice(0, 10);

  const products: StoreProduct[] = [];
  for (let page = 1; page <= 10; page++) {
    const batch = JSON.parse(await fetchText(`${SITE}/wp-json/wc/store/v1/products?per_page=100&page=${page}`)) as StoreProduct[];
    await sleep(delay);
    if (batch.length === 0) break;
    products.push(...batch);
  }
  console.log(`${products.length} products`);

  const written: string[] = [];
  const adjusted: string[] = [];
  const skipped: string[] = [];
  const notImported: string[] = [];
  const seen = new Set<string>();
  for (const p of products) {
    const k = kindOf(p);
    if ("skip" in k) {
      notImported.push(decode(p.name));
      continue;
    }
    let r: Parsed;
    try {
      r = parseProduct(p, await fetchText(p.permalink), today);
    } catch (e) {
      skipped.push(`${p.permalink} — ${(e as Error).message}`);
      continue;
    } finally {
      await sleep(delay);
    }
    const line = `[${r.model || decode(p.name)}](${p.permalink})`;
    if (r.kind === "skip") {
      skipped.push(`${line} — ${r.reason}`);
      continue;
    }
    const slug = slugOf(r.model);
    if (seen.has(slug)) continue;
    seen.add(slug);
    const data = r.kind === "driver" ? r.driver! : r.pr!;
    const errs = r.kind === "driver" ? validateDriver(data) : validatePassiveRadiator(data);
    if (errs.length) {
      skipped.push(`${line} — ${errs.join("; ")}`);
      continue;
    }
    written.push(line);
    if (r.notes.length) adjusted.push(`${line} — ${r.notes.join(" ")}`);
    if (!dry) {
      const dir = join(REPO_ROOT, r.kind === "driver" ? "drivers" : "passive-radiators", "sb-acoustics");
      mkdirSync(dir, { recursive: true });
      const file = join(dir, `${slug}.json`);
      if (existsSync(file)) keepExisting(data, JSON.parse(readFileSync(file, "utf8")));
      if (!existsSync(join(dir, "_brand.json"))) writeFileSync(join(dir, "_brand.json"), readFileSync(join(REPO_ROOT, "drivers/sb-acoustics/_brand.json")));
      writeFileSync(file, JSON.stringify(data, null, 2) + "\n");
    }
  }

  // driver-base entries for models not on the site (discontinued): kept, listed.
  const kept = readdirSync(join(REPO_ROOT, "drivers/sb-acoustics"))
    .filter((f) => f.endsWith(".json") && f !== "_brand.json" && !seen.has(f.replace(/\.json$/, "")))
    .map((f) => f.replace(/\.json$/, ""));

  const report = [
    `## SB Acoustics import (${today})`,
    "",
    `Products listed: ${products.length}. Written: ${written.length}. Adjusted: ${adjusted.length}. Skipped: ${skipped.length}. Not box drivers (tweeters, kits, accessories…): ${notImported.length}.`,
    "",
    "Source: product pages on sbacoustics.com, used with SB Acoustics' permission (see docs/data-permissions.md). Entries for the same models from driver-base are replaced.",
    "",
    "### Adjusted or noted (check these against the datasheet)",
    ...(adjusted.length ? adjusted.map((x) => `- ${x}`) : ["- none"]),
    "",
    "### Skipped",
    ...(skipped.length ? skipped.map((x) => `- ${x}`) : ["- none"]),
    "",
    `### Kept from driver-base (not found on sbacoustics.com): ${kept.length}`,
    kept.length ? kept.join(", ") : "none",
    "",
  ].join("\n");
  writeFileSync(join(REPO_ROOT, "sb-import-report.md"), report);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, report);
  console.log(report);
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
