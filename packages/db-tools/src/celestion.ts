/**
 * Celestion importer (pro audio drivers).
 *
 * Celestion gave permission (Dr. Decibel, info@celestion.com, 24 Nov 2026) to use the
 * parameters published on celestion.com; they have no spreadsheet. See
 * docs/data-permissions.md. Run by hand (Celestion import workflow) when Celestion updates
 * its range:
 *
 *   node … celestion.ts                 read celestion.com and update drivers/celestion/
 *   node … celestion.ts --dry-run       report only
 *   node … celestion.ts --pages DIR     use pages already read by fetch-pages.ts
 *
 * Product pages (celestion.com/product/<slug>/) have a breadcrumb ("Pro Audio / LF
 * Loudspeakers / TSQ1230"), "Specifications", "Parameters" (Sd, Fs, Mms, Qms, Qes, Qts, Re,
 * Vas, BI, Cms, Le, Xmax, Xmech) and "Mounting Information". LF, coaxial (woofer values),
 * full-range, axiperiodic and legacy drivers are imported; compression drivers, horns and
 * guitar speakers aren't. Celestion's Xmech is peak to peak; the database stores one way.
 * The guitar speakers and other driver-base entries already in drivers/celestion/ stay.
 */
import { readFileSync } from "node:fs";
import { appendReport, firstNumber, importRows, pagesFor, textOf, type SavedPage, type SheetRow } from "./site-sheet.ts";
import type { Target } from "./fetch-pages.ts";

export const SITE = "https://celestion.com";
const CATS = ["lf-drivers", "coaxial-loudspeakers", "full-range-loudspeakers", "legacy-loudspeakers-2", "axiperiodic-drivers"];
export const TARGET: Target = {
  name: "celestion",
  start: CATS.map((c) => `${SITE}/products/?fwp_product_catalogue=${c}`),
  follow: `^https://celestion\\.com/(product/|products/\\?fwp_product_catalogue=(${CATS.join("|")})&fwp_paged=)`,
  depth: 3,
  max: 400,
};
export const NOTE =
  "Values from the product pages on celestion.com, used with Celestion's permission (24 Nov 2026); the link is the product page. Not covered by CC BY-NC-SA 4.0: do not reuse outside Speaker Box Genius without Celestion's permission. See LICENSE-DATA.";

/** Breadcrumb category → the sheet's Type, or undefined to skip. */
export function kindOfCategory(cat: string): string | undefined {
  if (/compression|horn|guitar/i.test(cat)) return undefined;
  if (/coax/i.test(cat)) return "coaxial";
  if (/full range|axiperiodic/i.test(cat)) return "full range";
  return "woofer"; // LF Loudspeakers, Legacy
}

/** A labelled number in a section: "Fs 55Hz" → 55, "Le (at 1kHz) 0.72mH" → 0.72. */
export function labelled(text: string, label: string, flags = "i"): number | undefined {
  const m = text.match(new RegExp(`(?:^|\\s)${label}(?:\\s*\\([^)]*\\))?\\s+(-?\\d[\\d.,]*)`, flags));
  return m ? firstNumber(m[1]) : undefined;
}

const between = (t: string, a: string, b: string) => {
  const i = t.indexOf(a);
  if (i < 0) return "";
  const j = t.indexOf(b, i + a.length);
  return t.slice(i, j < 0 ? undefined : j);
};

export function parsePage(html: string, url: string): SheetRow | { skip: string } {
  const t = textOf(html);
  // "Home / Pro Audio / LF Loudspeakers / TSQ1230 TSQ1230 Compare", "Home / Legacy / Legacy Pro Audio / TN0820 TN0820 …"
  const crumb = t.match(/Home \/ (.{0,80}?) \/ (\S.{0,40}?) \2 Compare/);
  if (!crumb) return { skip: `${url}: no product breadcrumb ` };
  const cat = crumb?.[1]?.replace(/^Pro Audio \/ /, "").trim() ?? "";
  const model = crumb?.[2] ?? url.split("/").filter(Boolean).pop()!.toUpperCase();
  const kind = kindOfCategory(cat);
  if (!kind) return { skip: `${model}: ${cat || "no category"}` };
  // The list proper starts at "Nominal diameter" / "Power rating": a summary line above it
  // runs value-then-label ("8Ω Rated impedance 94dB Sensitivity").
  const specAll = between(t, "Specifications", "Parameters");
  const start = specAll.search(/Nominal diameter|Power rating \d/);
  const spec = start < 0 ? specAll : specAll.slice(start);
  const ts = between(t, "Parameters Sd", "Mounting Information");
  const mount = between(t, "Mounting Information", "Packed Dimensions");
  if (!ts) return { skip: `${model}: no Parameters table (${url})` };
  const qts = labelled(ts, "Qts");
  if (qts === undefined) return { skip: `${model}: no Qts published (${url})` };
  const xmech = labelled(ts, "Xmech");
  const size = spec.match(/Nominal diameter\s+[\d.]+\s*mm\s*\/\s*([\d.]+)\s*in/i)?.[1];
  return {
    model,
    url,
    kind,
    ...(size ? { size_in: Number(size) } : {}),
    impedance: labelled(spec, "Rated impedance"),
    fs: labelled(ts, "Fs"),
    qts,
    qes: labelled(ts, "Qes"),
    qms: labelled(ts, "Qms"),
    vas_l: labelled(ts, "Vas"),
    cms_mm_per_n: labelled(ts, "Cms"),
    re: labelled(ts, "Re"),
    le_mh: labelled(ts, "Le"),
    bl: labelled(ts, "B[Il]"),
    mms_g: labelled(ts, "Mms"),
    sd_cm2: labelled(ts, "Sd"),
    xmax_mm: labelled(ts, "Xmax"),
    ...(xmech !== undefined ? { xmech_mm: xmech / 2 } : {}), // published peak to peak
    pe_w: labelled(spec, "Power rating", ""), // not "Continuous power rating" (3 dB above AES)
    cutout_mm: labelled(mount, "Cut-out diameter"),
    depth_mm: labelled(mount, "Overall depth"),
  };
}

export function rowsOf(pages: SavedPage[]): { rows: SheetRow[]; skipped: string[] } {
  const rows: SheetRow[] = [];
  const skipped: string[] = [];
  const seen = new Set<string>();
  for (const p of pages) {
    if (p.pdf || !/\/product\//.test(p.url)) continue;
    const r = parsePage(readFileSync(p.path, "utf8"), p.url);
    if ("skip" in r) {
      if (!/compression|horn|guitar/i.test(r.skip)) skipped.push(r.skip); // only pro audio pages are reported
      continue;
    }
    if (seen.has(r.model.toLowerCase())) continue; // listed in two categories (AF3010)
    seen.add(r.model.toLowerCase());
    rows.push(r);
  }
  return { rows, skipped };
}

async function main() {
  const args = process.argv.slice(2);
  const { rows, skipped } = rowsOf(await pagesFor(TARGET, args));
  const report = "celestion-import-report.md";
  const status = importRows(rows, ["--brand", "Celestion", "--note", NOTE], { out: "tmp-import", slug: "celestion", args: [...args, "--report", report] });
  appendReport(report, "Not read from the website", skipped);
  process.exit(status);
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
