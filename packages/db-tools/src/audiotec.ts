/**
 * Audiotec Fischer (BRAX, HELIX, MATCH) importer.
 *
 * Audiotec Fischer gave permission (Patrick Hegener, 24 Nov 2026) to use the technical
 * parameters on audiotec-fischer.de, credited with links to the product pages, and sent
 * their WinISD driver files for the subwoofers ("Win ISD ATF 24022025.zip", not committed);
 * see docs/data-permissions.md. Run by hand (Audiotec Fischer import workflow):
 *
 *   node … audiotec.ts                       read audiotec-fischer.de, update drivers/brax|helix|match/
 *   node … audiotec.ts --wdr ~/atf-winisd    also add the WinISD files' models the website lacks
 *   node … audiotec.ts --pages DIR --dry-run use pages already read by fetch-pages.ts; report only
 *
 * The website's product pages are the main source: each has a "Technical data" list
 * ("Resonance frequency Fs 36 Hz", "Compliance Cms 218 µm/N" …), including archived models.
 * Pages for a model sold in two versions (IK W10 SVC2/DVC2) list one; two-way kits (K…)
 * repeat the woofer sold on its own and are left out, as are tweeters and four-coil models.
 * The WinISD files then add the models and versions the website doesn't list (the SVC2
 * versions, the IQ subwoofers with add-on weights, discontinued ranges). Each brand's rows
 * go through `db:import-sheet`. Fixes applied to the WinISD files, all reported:
 *  - "DVC2" models are two 2 Ω coils, published wired in series (Re 3.2–3.85 Ω): voice
 *    coils 2, series, 4 Ω, whatever the file's Znom says. "SVC2" is one 2 Ω coil.
 *  - The "+1G/+2G/+3G" files are the same subwoofer with 1–3 of the add-on weights fitted;
 *    they become their own entries ("IQ W10-DVC2 (+2 weights)").
 *  - A driver with four coils (MATCH PP 8W-Q) is left out: the database models one or two.
 */
import { readdirSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { parseWdr } from "../../engine/src/wdr.ts";
import type { Target } from "./fetch-pages.ts";
import { appendReport, firstNumber, importRows, pagesFor, textOf, type SavedPage, type SheetRow } from "./site-sheet.ts";

export interface Row {
  brand: string;
  model: string;
  url?: string;
  impedance: number;
  coils: 1 | 2;
  wiring?: "series";
  values: Record<string, number | undefined>;
  notes: string[];
}

const num = (s: string | undefined) => (s === undefined || s === "" ? undefined : Number(s.replace(",", ".")));

/** "HELIX IQ W10-DVC2 +2G" → { brand: "HELIX", model: "IQ W10-DVC2 (+2 weights)" }. */
export function nameOf(fileStem: string): { brand: string; model: string; key: string } {
  const [brand, ...rest] = fileStem.trim().split(/\s+/);
  let model = rest.join(" ");
  const w = model.match(/\s\+(\d)G$/i);
  if (w) model = `${model.slice(0, w.index)} (+${w[1]} weight${w[1] === "1" ? "" : "s"})`;
  return { brand: brand!.toUpperCase(), model, key: fileStem.trim().replace(/\s\+\dG$/i, "") };
}

/** Read the raw key=value pairs (parseWdr drops a few we need, like numVC). */
export function rawFields(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^([A-Za-z]\w*)=(.*)$/);
    if (m) out[m[1]!] = m[2]!.trim();
  }
  return out;
}

export function convert(fileStem: string, text: string, urls: Record<string, string> = {}): Row | { skip: string } {
  const { brand, model, key } = nameOf(fileStem);
  const f = rawFields(text);
  parseWdr(text); // throws on a broken file
  const numVC = num(f.numVC) ?? 1;
  const notes: string[] = [];
  if (numVC > 2) return { skip: `${fileStem}: ${numVC} voice coils (the database models one or two)` };
  const re = num(f.Re)!;
  let coils: 1 | 2 = numVC === 2 ? 2 : 1;
  let impedance = num(f.Znom)!;
  let wiring: "series" | undefined;
  if (/DVC2\b/i.test(model)) {
    if (coils !== 2) notes.push(`numVC ${numVC} in the file, but a DVC model: 2 coils`);
    coils = 2;
    if (re >= 2.6) {
      wiring = "series";
      if (impedance !== 4) notes.push(`Znom ${impedance} in the file; two 2 Ω coils in series (Re ${re} Ω) are 4 Ω`);
      impedance = 4;
    }
  } else if (/SVC2\b/i.test(model)) {
    if (coils !== 1) notes.push(`numVC ${numVC} in the file, but an SVC model: 1 coil`);
    coils = 1;
    if (impedance !== 2) notes.push(`Znom ${impedance} in the file; one 2 Ω coil (Re ${re} Ω) is 2 Ω`);
    impedance = 2;
  } else if (coils === 2) {
    wiring = "series";
    if (re >= 2.6 && impedance < 4) {
      notes.push(`Znom ${impedance} with Re ${re} Ω and 2 coils: 4 Ω in series`);
      impedance = 4;
    }
  }
  const values: Record<string, number | undefined> = {
    fs: num(f.Fs),
    qts: num(f.Qts),
    qes: num(f.Qes),
    qms: num(f.Qms),
    vas_l: num(f.Vas) !== undefined ? num(f.Vas)! * 1000 : undefined,
    re,
    le_mh: num(f.Le) !== undefined ? num(f.Le)! * 1000 : undefined,
    bl: num(f.BL),
    mms_g: num(f.Mms) !== undefined ? num(f.Mms)! * 1000 : undefined,
    sd_cm2: num(f.Sd) !== undefined ? num(f.Sd)! * 1e4 : undefined,
    xmax_mm: num(f.Xmax) !== undefined ? num(f.Xmax)! * 1000 : undefined,
    pe_w: num(f.Pe),
  };
  for (const [k, v] of Object.entries(values)) if (v === 0) values[k] = undefined;
  const url = urls[key] ?? urls[fileStem.trim()];
  return { brand, model, ...(url ? { url } : {}), impedance, coils, ...(wiring ? { wiring } : {}), values, notes };
}

const round = (v: number | undefined) => (v === undefined ? "" : String(Math.round(v * 1e4) / 1e4));

export function toCsv(rows: Row[]): string {
  const head = ["Model", "URL", "Impedance", "Coils", "Wiring", "Fs (Hz)", "Qts", "Qes", "Qms", "Vas (l)", "Re (ohm)", "Le (mH)", "Bl (Tm)", "Mms (g)", "Sd (cm2)", "Xmax (mm)", "Pe (W)"];
  const q = (s: string) => (/[",]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  const lines = rows.map((r) =>
    [r.model, r.url ?? "", String(r.impedance), String(r.coils), r.wiring ?? "", ...["fs", "qts", "qes", "qms", "vas_l", "re", "le_mh", "bl", "mms_g", "sd_cm2", "xmax_mm", "pe_w"].map((k) => round(r.values[k]))].map(q).join(","),
  );
  return [head.join(","), ...lines].join("\n") + "\n";
}

// ---- The website ---------------------------------------------------------------------

export const SITE = "https://www.audiotec-fischer.de";
const BRANDS = ["brax", "helix", "match"] as const;
export const TARGET: Target = {
  name: "audiotec",
  start: BRANDS.flatMap((b) => [`${SITE}/en/${b}/speakers/`, `${SITE}/en/${b}/subwoofers/`]),
  follow: "^https://www\\.audiotec-fischer\\.de/en/(brax|helix|match)/(speakers|subwoofers)(?!.*(flexmount|wirekit|accessor))(/[^?#]*)?$",
  depth: 3,
  max: 400,
};
export const NOTE =
  "Values from the product pages on audiotec-fischer.de (and Audiotec Fischer's WinISD files, 24 Nov 2026), used with Audiotec Fischer's permission (24 Nov 2026); the link is the product page. Not covered by CC BY-NC-SA 4.0: do not reuse outside Speaker Box Genius without Audiotec Fischer's permission. See LICENSE-DATA.";

/** A model name as a key that matches across the website and the WinISD files ("MATRIX ML10 SUB" = "ML 10 SUB"). */
export const keyOf = (model: string) => model.toUpperCase().replace(/\b(MATRIX|GRAPHIC)\b/g, "").replace(/[\s.\-]+/g, "");

const grab = (t: string, re: RegExp) => {
  const m = t.match(re);
  return m ? firstNumber(m[1]) : undefined;
};

export interface WebRow extends SheetRow {
  brand: string;
}

export function parseWebPage(html: string, url: string): WebRow | { skip: string } {
  const brandSlug = url.match(/\/en\/(brax|helix|match)\//)?.[1];
  const h1 = textOf(html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1] ?? "");
  const brand = (brandSlug ?? h1.split(" ")[0] ?? "").toUpperCase();
  let model = h1.replace(new RegExp(`^${brand}\\s+`, "i"), "").trim();
  const t = textOf(html);
  const at = t.lastIndexOf("Technical data");
  if (at < 0 || !/Resonance frequency/.test(t.slice(at))) return { skip: `${brand} ${model}: no T/S on its page (${url})` };
  let tech = t.slice(at);
  const end = tech.search(/Recommended enclosure volumes|Scope of delivery|Description Accessories|Features\s{2,}|Compatibility /);
  if (end > 0) tech = tech.slice(0, end);
  // A page for two versions lists one: "IK W10-DVC2 – 2 x 2 Ohms".
  const version = tech.match(/^Technical data\s+([A-Z][\w .+-]*?)[ -]((?:SVC|DVC)\d)\s+[–-]/);
  if (version) model = `${version[1]!.trim()}-${version[2]}`;
  if (/\b(K|PF-K|PR-K)\d{2,3}(\.\d)?|\bK\d{3}\.2|-K\d{3}/i.test(model) || /\bK\d{2,3}[.-]2/i.test(model)) return { skip: `${brand} ${model}: two-way kit (its woofer is listed on its own)` };
  if (/\bT\d{2}\b|T\d{2}FM|\bS 1T\b|^S-1T|tweeter/i.test(model) || /\bT\d{2}[A-Z]/.test(model)) return { skip: `${brand} ${model}: tweeter` };
  const z = tech.match(/Impedance\s+[Zz]\s+([^Ω]+?)\s*Ω/)?.[1] ?? "";
  const reTxt = tech.match(/DC resistance\s+Re\s+([^Ω]+?)\s*Ω/)?.[1] ?? "";
  const coils = Number(z.match(/^(\d)\s*x/)?.[1] ?? 1);
  if (coils > 2) return { skip: `${brand} ${model}: ${coils} voice coils (the database models one or two)` };
  const perCoilZ = firstNumber(z.replace(/^\d\s*x\s*/, ""));
  const perCoilRe = firstNumber(reTxt.replace(/^\d\s*x\s*/, ""));
  // HELIX IK/K/IQ pages sold in SVC2 and DVC2 versions name the one they list (or not: IK S12).
  if (/^(IK|K|IQ) /.test(model) && !/[SD]VC\d/.test(model) && perCoilZ !== undefined) model = `${model}-${coils === 2 ? "DVC" : "SVC"}${perCoilZ}`;
  const reTotal = perCoilRe !== undefined && /^\d\s*x/.test(reTxt) ? perCoilRe * coils : perCoilRe;
  const cms = tech.match(/Cms\s+([\d.,]+)\s*(µm|μm|um|mm)\s*\/\s*N/i);
  const afterH1 = html.slice(html.search(/<\/h1>/i));
  const sub = textOf(afterH1.slice(0, 3000)).slice(0, 300);
  const inch = sub.match(/(\d+(?:[.,]\d+)?)\s*(?:inch|″|”|")/i)?.[1];
  const mm = sub.match(/(\d{2,3})\s*mm/)?.[1];
  const size = inch ? firstNumber(inch) : mm ? Math.round((Number(mm) / 25.4) * 2) / 2 : undefined;
  return {
    brand,
    model,
    url,
    kind: /\/subwoofers\//.test(url) ? "subwoofer" : /^C|coax/i.test(model.replace(/^(Ci\d|CB) /, "")) || /\bC\d{2,3}[.-]2/i.test(model) ? "coaxial" : "woofer",
    ...(size ? { size_in: size } : {}),
    ...(perCoilZ !== undefined ? { impedance: coils === 2 ? perCoilZ * 2 : perCoilZ } : {}),
    ...(coils === 2 ? { coils: 2, wiring: "series" } : {}),
    fs: grab(tech, /Fs\s+([\d.,]+)\s*Hz/),
    qms: grab(tech, /Qms\s+([\d.,]+)/),
    qes: grab(tech, /Qes\s+([\d.,]+)/),
    qts: grab(tech, /Qts\s+([\d.,]+)/),
    ...(cms ? { cms_mm_per_n: firstNumber(cms[1])! / (/mm/i.test(cms[2]!) ? 1 : 1000) } : {}),
    vas_l: grab(tech, /Vas\s+([\d.,]+)\s*L/i),
    re: reTotal,
    bl: grab(tech, /B\s?\*\s?[Il]\s+([\d.,]+)/),
    sd_cm2: grab(tech, /Sd\s+([\d.,]+)\s*cm/),
    mms_g: grab(tech, /Mms\s+([\d.,]+)\s*g/),
    xmax_mm: grab(tech, /Xmax\s+\+\/-\s*([\d.,]+)/),
    pe_w: grab(tech.replace(/(\d),(\d{3})\b/g, "$1$2"), /Power[^\d]{0,40}?(\d[\d.]*)\s*(?:\/|Watt)/),
    cutout_mm: grab(tech, /Installation diameter\s+ø\s*([\d.,]+)\s*mm/),
    depth_mm: grab(tech, /Installation depth\s+([\d.,]+)\s*mm/),
  };
}

/** Tweeters (Fs in the hundreds, no Qts) aren't box drivers. */
const isBoxDriver = (r: WebRow) => r.qts !== undefined && Number(r.fs ?? 0) < 400;

export function webRows(pages: SavedPage[]): { rows: WebRow[]; skipped: string[] } {
  const rows: WebRow[] = [];
  const skipped: string[] = [];
  const seen = new Set<string>();
  for (const p of pages) {
    if (p.pdf || p.url.endsWith("/") || !/\/(speakers|subwoofers)\//.test(p.url)) continue; // listing pages end with "/"
    const r = parseWebPage(readFileSync(p.path, "utf8"), p.url);
    if ("skip" in r) {
      skipped.push(r.skip);
      continue;
    }
    if (!isBoxDriver(r)) {
      skipped.push(`${r.brand} ${r.model}: tweeter (Fs ${r.fs} Hz${r.qts === undefined ? ", no Qts" : ""})`);
      continue;
    }
    const k = `${r.brand}/${keyOf(r.model)}`;
    if (seen.has(k)) continue;
    seen.add(k);
    // The same driver sold for another car side or with a grille (UP W8MB-S4 LHD / RHD,
    // Ci7 W200FM-S3 + SG, GL6 / GL6 MK2): one entry: the current model, without the grille.
    const ts = (x: WebRow) => [x.fs, x.qts, x.vas_l, x.re, x.bl, x.mms_g, x.sd_cm2, x.impedance].join("|");
    const twin = rows.findIndex((x) => x.brand === r.brand && ts(x) === ts(r));
    if (twin >= 0) {
      // Keep the first listed (the current model, before the archive), unless it's the "+ SG" (grille) version.
      const [keep, drop] = / \+ /.test(rows[twin]!.model) && !/ \+ /.test(r.model) ? [r, rows[twin]!] : [rows[twin]!, r];
      rows[twin] = keep;
      skipped.push(`${drop.brand} ${drop.model}: same published values as ${keep.model}, not listed twice`);
      continue;
    }
    rows.push(r);
  }
  return { rows, skipped };
}

/** WinISD rows for models the website doesn't list, linked to the nearest product page. */
export function wdrExtras(dir: string, web: WebRow[]): { rows: WebRow[]; report: string[] } {
  const have = new Set(web.map((r) => `${r.brand}/${keyOf(r.model)}`));
  // "IK W10" page → also the IK W10-SVC2 and the IQ W10-DVC2 (+2 weights) rows.
  const pageOf = (brand: string, model: string) => {
    const base = keyOf(model.replace(/\s*\(\+\d weights?\)$/, "").replace(/-(S|D)VC\d$/i, ""));
    return web.find((r) => r.brand === brand && keyOf(r.model.replace(/-(S|D)VC\d$/i, "")) === base)?.url;
  };
  const rows: WebRow[] = [];
  const report: string[] = [];
  for (const file of readdirSync(dir).filter((x) => x.toLowerCase().endsWith(".wdr")).sort()) {
    const r = convert(basename(file, ".wdr"), readFileSync(join(dir, file), "latin1"));
    if ("skip" in r) {
      report.push(`WinISD file ${r.skip}`);
      continue;
    }
    if (have.has(`${r.brand}/${keyOf(r.model)}`)) continue;
    const url = pageOf(r.brand, r.model);
    if (!url) {
      report.push(`WinISD file ${r.brand} ${r.model}: no product page on the website, left out`);
      continue;
    }
    for (const n of r.notes) report.push(`WinISD file ${r.brand} ${r.model}: ${n}`);
    const v = r.values;
    rows.push({
      brand: r.brand,
      model: r.model,
      url,
      kind: /W\d|SUB|S\d/.test(r.model) ? "subwoofer" : "woofer",
      impedance: r.impedance,
      ...(r.coils === 2 ? { coils: 2, wiring: "series" } : {}),
      fs: v.fs, qts: v.qts, qes: v.qes, qms: v.qms, vas_l: v.vas_l, re: v.re, le_mh: v.le_mh, bl: v.bl, mms_g: v.mms_g, sd_cm2: v.sd_cm2, xmax_mm: v.xmax_mm, pe_w: v.pe_w,
    });
  }
  return { rows, report };
}

const BRAND_NAMES: Record<string, string> = { BRAX: "BRAX", HELIX: "HELIX", MATCH: "MATCH" };

async function main() {
  const args = process.argv.slice(2);
  const wdr = args.includes("--wdr") ? args[args.indexOf("--wdr") + 1] : undefined;
  const web = webRows(await pagesFor(TARGET, args));
  const extra = wdr ? wdrExtras(wdr, web.rows) : { rows: [], report: [] };
  let status = 0;
  for (const brand of Object.keys(BRAND_NAMES)) {
    const rows = [...web.rows, ...extra.rows].filter((r) => r.brand === brand).map(({ brand: _b, ...r }) => r);
    const report = `${brand.toLowerCase()}-import-report.md`;
    status ||= importRows(rows, ["--brand", BRAND_NAMES[brand]!, "--type", "car-audio", "--note", NOTE, "--website", SITE, "--country", "DE"], {
      out: "tmp-import",
      slug: brand.toLowerCase(),
      args: [...args.filter((a, i) => a !== "--report" && args[i - 1] !== "--report"), "--report", report],
    });
    appendReport(report, "Not read from the website", web.skipped.filter((l) => l.startsWith(`${brand} `)));
    appendReport(report, "WinISD files", extra.report.filter((l) => l.includes(` ${brand} `) || l.startsWith(`WinISD file ${brand}`)));
  }
  process.exit(status);
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
