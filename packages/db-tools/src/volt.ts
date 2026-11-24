/**
 * Volt Loudspeakers importer.
 *
 * Volt gave permission (Cat Lyth, Director, 23 Nov 2026) to use the information on
 * voltloudspeakers.co.uk, with a link and credit to each product page; see
 * docs/data-permissions.md. Run by hand (Volt import workflow) when Volt updates its range:
 *
 *   node … volt.ts                 read voltloudspeakers.co.uk and update drivers/volt/
 *   node … volt.ts --dry-run       report only
 *   node … volt.ts --pages DIR     use pages already read by fetch-pages.ts
 *
 * Each product page has a "Specifications" list (Label: value), "Mounting Information" and a
 * "Thiele-Small Parameters" table. Drive units whose page gives no Qts (the radial midranges
 * publish "n/a") are left out. Pages listing several impedances ("8, 16, or 24") give the
 * T/S values of the first.
 */
import { readFileSync } from "node:fs";
import { appendReport, firstNumber, importRows, pagesFor, textOf, type SavedPage, type SheetRow } from "./site-sheet.ts";
import type { Target } from "./fetch-pages.ts";

export const SITE = "https://voltloudspeakers.co.uk";
export const TARGET: Target = {
  name: "volt",
  start: ["sub-bass-speakers", "bass-speakers", "midrange-speakers", "full-range-speakers"].map((c) => `${SITE}/${c}/`),
  follow: "^https://(www\\.)?voltloudspeakers\\.co\\.uk/speaker/",
  depth: 1,
  max: 120,
};
export const NOTE =
  "Values from the product pages on voltloudspeakers.co.uk, used with Volt Loudspeakers' permission (23 Nov 2026); the link is the product page. Not covered by CC BY-NC-SA 4.0: do not reuse outside Speaker Box Genius without Volt's permission. See LICENSE-DATA.";

/** The listing a product was found on → the sheet's Type. */
export function kindOfListing(from: string | undefined, model: string): string {
  if (/^CX/i.test(model)) return "coaxial";
  if (!from) return "woofer";
  if (/sub-bass/.test(from)) return "subwoofer";
  if (/midrange/.test(from)) return "midrange";
  if (/full-range/.test(from)) return "full range";
  return "woofer";
}

const section = (t: string, start: RegExp, end: RegExp) => {
  const i = t.search(start);
  if (i < 0) return "";
  const rest = t.slice(i);
  const j = rest.slice(1).search(end);
  return j < 0 ? rest : rest.slice(0, j + 1);
};

/**
 * The impedance the T/S values are for. A page listing several ("4, 8, or 16") gives one
 * set of values: the lowest listed impedance at or above Re (Re 5.8 Ω → 8 Ω).
 */
export function impedanceOf(listed: string | undefined, re: number | undefined): number | undefined {
  const all = (listed ?? "").replace(/(\d),(\d)/g, "$1.$2").match(/\d+(?:\.\d+)?/g)?.map(Number) ?? [];
  if (all.length <= 1 || re === undefined) return all[0];
  return all.sort((a, b) => a - b).find((z) => z >= re) ?? all[all.length - 1];
}

/** A T/S table value: "Fs 39Hz" → "39Hz"; "n/a" → undefined. */
export function tsValue(ts: string, labels: string[]): number | undefined {
  for (const l of labels) {
    const m = ts.match(new RegExp(`(?:^|\\s)${l}\\s+(n/a|±?\\s?-?[\\d.,]+)`, "i"));
    if (m) return /n\/a/i.test(m[1]!) ? undefined : firstNumber(m[1]);
  }
  return undefined;
}

/** A "Label (unit): value" from the Specifications list. */
export function specValue(spec: string, label: RegExp): string | undefined {
  const m = spec.match(new RegExp(`(?:${label.source})[^:]{0,30}:\\s*(?<v>[^:]+?)(?=\\s[A-Z][A-Za-z ()/.]{2,40}:|$)`, "i"));
  return m?.groups?.v?.trim();
}

export function parsePage(html: string, url: string, from?: string): SheetRow | { skip: string } {
  const t = textOf(html);
  const spec = section(t, /Specifications (Model Number|Nominal Diameter)/, /Mounting Information|Thiele-Small/);
  const mount = section(t, /Mounting Information/, /Thiele-Small/);
  const ts = section(t, /Thiele-Small Parameters/, /Dimensions|Response Curve|Download/);
  const model =
    specValue(spec, /Model Number/) ?? t.match(/(\S+) \(\d+(?:\.\d+)?\s*[″"]\) Mounting Information/)?.[1] ?? url.split("/").filter(Boolean).pop()!;
  if (!ts) return { skip: `${model}: no Thiele-Small table` };
  const qts = tsValue(ts, ["Qts", "Qt"]);
  if (qts === undefined) return { skip: `${model}: no Qts published (${url})` };
  const size = t.match(new RegExp(`${model.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\((\\d+(?:\\.\\d+)?)\\s*[″"]`))?.[1];
  const re = tsValue(ts, ["Re"]);
  const imp = impedanceOf(specValue(spec, /(Nominal )?Impedance/), re);
  const mmsKg = firstNumber(specValue(spec, /Effective Moving Mass/));
  const cmsMn = firstNumber(specValue(spec, /Compliance/));
  const blSpec = firstNumber(specValue(spec, /BL Factor/));
  const cutout = mount.match(/Baffle Cutout Diameter\s*(?:\(Front Mount\)\s*)?([\d.]+)\s*mm(?:,?\s*front mount)?/i);
  const front = /front mount/i.test(cutout?.[0] ?? "") || /\(Front Mount\)/i.test(cutout?.[0] ?? "");
  const depth = mount.match(/Depth\s*(?:\(below front flange\)\s*([\d.]+)\s*mm|([\d.]+)\s*mm\s*below front flange)/i);
  return {
    model,
    url,
    kind: kindOfListing(from, model),
    ...(size ? { size_in: Number(size) } : {}),
    ...(imp !== undefined ? { impedance: imp } : {}),
    fs: tsValue(ts, ["Fs"]),
    qts,
    qes: tsValue(ts, ["Qes", "Qe"]),
    qms: tsValue(ts, ["Qms", "Qa"]),
    vas_l: tsValue(ts, ["VAS", "Vas"]),
    cms_mm_per_n: tsValue(ts, ["Cms"]) ?? (cmsMn !== undefined ? cmsMn * 1000 : undefined),
    re,
    le_mh: tsValue(ts, ["Le"]),
    bl: tsValue(ts, ["Bl"]) ?? blSpec,
    mms_g: tsValue(ts, ["Mms"]) ?? (mmsKg !== undefined ? mmsKg * 1000 : undefined),
    sd_cm2: tsValue(ts, ["Sd"]),
    xmax_mm: tsValue(ts, ["Xmax"]) ?? firstNumber(specValue(spec, /Linear Excursion/)),
    pe_w: firstNumber(specValue(spec, /Power (Capacity|Rating)/)?.replace(/(\d) (\d)/g, "$1$2")), // "1 50" on the B220.2 page
    ...(cutout && front ? { cutout_mm: Number(cutout[1]) } : {}),
    ...(depth ? { depth_mm: Number(depth[1] ?? depth[2]) } : {}),
    displacement_l: firstNumber(specValue(spec, /Volume Displace/)),
  };
}

export function rowsOf(pages: SavedPage[]): { rows: SheetRow[]; skipped: string[] } {
  const rows: SheetRow[] = [];
  const skipped: string[] = [];
  for (const p of pages) {
    if (p.pdf || !/\/speaker\//.test(p.url)) continue;
    const r = parsePage(readFileSync(p.path, "utf8"), p.url, p.from);
    if ("skip" in r) skipped.push(r.skip);
    else rows.push(r);
  }
  return { rows, skipped };
}

async function main() {
  const args = process.argv.slice(2);
  const pages = await pagesFor(TARGET, args);
  const { rows, skipped } = rowsOf(pages);
  const out = "tmp-import";
  const report = "volt-import-report.md";
  const status = importRows(rows, ["--brand", "Volt", "--note", NOTE, "--website", SITE, "--country", "GB"], { out, slug: "volt", args: [...args, "--report", report] });
  appendReport(report, "Not read from the website", skipped);
  process.exit(status);
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
