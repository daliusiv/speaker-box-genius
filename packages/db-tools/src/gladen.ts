/**
 * Gladen importer (car audio drivers).
 *
 * Gladen Europe gave permission (Patrick Gladen, 24 Nov 2026) to use the T/S parameters
 * published on gladen.com and in their datasheets, credited to GLADEN with links to the
 * product pages, and asked to be told about missing or inconsistent parameters: this
 * importer's report lists them. See docs/data-permissions.md. Run by hand (Gladen import
 * workflow) when Gladen updates its range:
 *
 *   node … gladen.ts                 read gladen.com and update drivers/gladen/
 *   node … gladen.ts --dry-run       report only
 *   node … gladen.ts --pages DIR     use pages already read by fetch-pages.ts
 *
 * The (German) product pages have a "Technische Daten" list whose labels vary by range:
 * "Fs: 56,3 Hz", "Resonanzfrequenz (Fs): 36 Hz", "Resonance frequency (Fs): …", with
 * decimal commas. Two-way kits give their woofer's values (the woofer's own page often has
 * none). A dual-voice-coil subwoofer's values may be for its coils in series, in parallel or
 * one coil alone ("Messwerte mit einer angeschlossenen Schwingspule"): the importer picks the
 * reading whose Qes agrees with Fs, Mms, Bl and Re, and stores one-coil values as the coils
 * in series (Re and Bl doubled, Qes halved). Pages showing another model's values, and
 * tweeters, are left out and reported.
 */
import { readFileSync } from "node:fs";
import { appendReport, firstNumber, importRows, pagesFor, textOf, type SavedPage, type SheetRow } from "./site-sheet.ts";
import type { Target } from "./fetch-pages.ts";

export const SITE = "https://www.gladen.com";
export const TARGET: Target = {
  name: "gladen",
  start: [`${SITE}/de/gladen/gladen-lautsprecher`, `${SITE}/de/gladen/subwoofer`],
  follow: "^https://www\\.gladen\\.com/de/gladen/(gladen-lautsprecher|subwoofer)/",
  depth: 3,
  max: 400,
};
export const NOTE =
  "Values from the product pages on gladen.com, used with Gladen Europe's permission (24 Nov 2026); the link is the product page. Not covered by CC BY-NC-SA 4.0: do not reuse outside Speaker Box Genius without Gladen's permission. See LICENSE-DATA.";

const NUM = "(-?\\d+(?:[.,]\\d+)?)";
/** "Label: value" or "Long label (Sym): value", the label as a regex source. */
export function field(sec: string, label: string, unit = ""): number | undefined {
  const m = sec.match(new RegExp(`(?:\\((?:${label})\\)|(?:^|\\s)(?:${label}))\\s*(?:\\(\\+/-\\))?\\s*:\\s*${NUM}\\s*${unit}`, "i"));
  return m ? firstNumber(m[1]) : undefined;
}

/** Model numbers in a name ("ZETA ZW 200" → "200", "Sigma ssw08" → "08"). */
const numbersOf = (s: string) => (s.match(/\d+(?:\.\d)?/g) ?? []).map((n) => n.replace(/^0+(?=\d)/, ""));

/** Nominal cone sizes in mm → inches, as car audio names them. */
const INCHES: Record<number, number> = { 50: 2, 70: 2.75, 80: 3, 100: 4, 130: 5.25, 165: 6.5, 200: 8 };

export interface Coils {
  coils: 1 | 2;
  impedance?: number;
  re?: number;
  bl?: number;
  qes?: number;
  note?: string;
}

/**
 * A DVC subwoofer: which reading the published values are. `perCoilRe` is Rdc when the page
 * marks it "(dual)" (per coil). Picks series, parallel or one coil by Qes = 2π·Fs·Mms·Re/Bl².
 */
export function dvc(ohmsPerCoil: number, perCoilRe: number, bl: number | undefined, qes: number | undefined, fs: number | undefined, mmsG: number | undefined): Coils {
  const series = { coils: 2 as const, impedance: ohmsPerCoil * 2, re: perCoilRe * 2, bl, qes };
  if (bl === undefined || qes === undefined || fs === undefined || mmsG === undefined) return { ...series, note: "assumed measured in series (no Bl, Qes, Fs or Mms to check)" };
  const qesFor = (re: number) => (2 * Math.PI * fs * (mmsG / 1000) * re) / (bl * bl);
  const options = [
    { name: "series", re: perCoilRe * 2 },
    { name: "parallel", re: perCoilRe / 2 },
    { name: "one coil", re: perCoilRe },
  ].map((o) => ({ ...o, err: Math.abs(qesFor(o.re) / qes - 1) }));
  const best = options.sort((a, b) => a.err - b.err)[0]!;
  if (best.name === "series") return series;
  if (best.name === "parallel") return { coils: 2, impedance: ohmsPerCoil * 2, re: perCoilRe * 2, bl: bl * 2, qes, note: "published for the coils in parallel; stored for the coils in series (Bl doubled)" };
  return { coils: 2, impedance: ohmsPerCoil * 2, re: perCoilRe * 2, bl: bl * 2, qes: qes / 2, note: "published for one coil connected; stored for the coils in series (Re and Bl doubled, Qes halved)" };
}

export function parsePage(html: string, url: string): SheetRow | { skip: string } {
  const h1 = textOf(html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1] ?? "");
  // GLADEN writes its series in capitals (ZETA, SIGMA SSW10); the site's headings don't always.
  const model = (h1.replace(/^gladen\s+/i, "").replace(/\s+-\s+/g, "-").trim() || url.split("/").pop()!).toUpperCase();
  const t = textOf(html);
  const i = t.indexOf("Technische Daten");
  if (i < 0) return { skip: `${model}: no technical data on its page (${url})` };
  const end = t.indexOf("Downloads", i);
  // A two-way kit lists the woofer, then the tweeter ("Hochtöner"): only the woofer's values.
  const sec = t.slice(i + "Technische Daten".length, end < 0 ? i + 4000 : end).split(/\sHochtöner\s/)[0]!;
  const fs = field(sec, "Fs", "Hz");
  if (fs === undefined) return { skip: `${model}: no T/S parameters on its page (${url})` };
  // The list names its model first: a different model number means the page shows another product's values.
  const title = sec.match(/^\s*:?\s*((?:GLADEN|Gladen)?\s*[A-Za-z-]+\s*[A-Za-z]*\s*[\d.]+[^:]*?)\s+(?:Material|Daten|Tieftöner|Mitteltöner|Tiefmitteltöner|Empfohlenes)/)?.[1] ?? "";
  const own = numbersOf(model);
  const listed = numbersOf(title);
  if (own.length && listed.length && !listed.some((n) => own.includes(n))) return { skip: `${model}: its page lists the values of "${title.trim()}" (${url})` };
  const qts = field(sec, "Qts");
  if (qts === undefined || fs > 400) return { skip: `${model}: tweeter or no Qts (${url})` };
  const zTxt = sec.match(/(?:\(Z\)|\(ZN\)|\bZn|Impedanz)\s*:\s*([\dx ,.]+)\s*(?:Ω|Ohm)/i)?.[1] ?? sec.match(/(\d)\s*Ohm\s+Fs\s*:/)?.[1] ?? "";
  let dual = zTxt.match(/(\d)\s*x\s*(\d+(?:[.,]\d+)?)/);
  const dualRe = /\(dual\)/.test(sec.match(/(?:\(Rdc\)|\(Re\)|Gleichstrom-?[Ww]iderstand)\s*:[^:]{0,20}/)?.[0] ?? "");
  let zNote: string | undefined;
  if (!dual && dualRe && /^\s*2[,.]2\s*$/.test(zTxt)) {
    dual = ["2x2", "2", "2"] as unknown as RegExpMatchArray; // "Nennimpedanz (Z): 2,2 Ω" beside "Rdc: 1,8 Ω (dual)"
    zNote = "impedance published as 2,2 Ω beside a per-coil (dual) Rdc: read as 2 x 2 Ω";
  }
  const reM = sec.match(/(?:\(Rdc\)|\(Re\)|\bRe|Gleichstrom-?[Ww]iderstand)\s*:\s*(\d+(?:[.,]\d+)?)\s*(?:Ω|Ohm)?\s*(\(dual\)|\(in Reihe\))?/);
  let re = reM ? firstNumber(reM[1]) : undefined;
  let bl = field(sec, "B[Ll]|BxL", "") ?? field(sec, "Kraftfaktor");
  let qes = field(sec, "Qes");
  const mms = field(sec, "Mms", "g");
  let coils: 1 | 2 = 1;
  let impedance = firstNumber(zTxt);
  let note: string | undefined;
  if (dual && Number(dual[1]) === 2) {
    const perCoil = firstNumber(dual[2])!;
    const perCoilRe = re !== undefined ? (reM?.[2] === "(in Reihe)" ? re / 2 : re) : undefined;
    if (perCoilRe !== undefined) {
      const c = dvc(perCoil, perCoilRe, bl, qes, fs, mms);
      ({ coils, impedance, re, bl, qes, note } = c);
      if (zNote) note = note ? `${zNote}; ${note}` : zNote;
    } else {
      coils = 2;
      impedance = perCoil * 2;
    }
  }
  const qms = field(sec, "Qms");
  const qtsOut = qes !== field(sec, "Qes") && qes !== undefined && qms !== undefined ? (qms * qes) / (qms + qes) : qts; // one-coil values restated for both coils
  const sub = /\/subwoofer\//.test(url);
  const mm = firstNumber(sec.match(/(?:Durchmesser|Ø)\s*:\s*(\d+)\s*mm/)?.[1]);
  const subSize = sub ? model.match(/(?:SSWX?|GS|ZETA|PRO|AERO)\s*0?(\d{1,3})/)?.[1] : undefined;
  const named = INCHES[Number(model.match(/(\d{2,3})/)?.[1])]; // "GAMMA GW165", "ZETA ZM 80"
  const size_in = mm ? INCHES[mm] ?? Math.round((mm / 25.4) * 2) / 2 : subSize ? (subSize === "65" ? 6.5 : Number(subSize)) : named;
  return {
    model,
    url,
    kind: sub ? "subwoofer" : "woofer",
    ...(size_in ? { size_in } : {}),
    ...(impedance !== undefined ? { impedance } : {}),
    ...(coils === 2 ? { coils: 2, wiring: "series" } : {}),
    fs,
    qts: qtsOut,
    qes,
    qms,
    vas_l: field(sec, "Vas", "(?:L|Liter|l|dm)"),
    cms_mm_per_n: (() => {
      const m = sec.match(new RegExp(`(?:\\(Cms\\)|\\bCms)\\s*:\\s*${NUM}\\s*(mm|µm|μm)`, "i"));
      return m ? firstNumber(m[1])! / (/mm/i.test(m[2]!) ? 1 : 1000) : undefined;
    })(),
    re,
    bl,
    mms_g: mms,
    sd_cm2: field(sec, "[Ss]d|Sq", "cm"), // the kits write "Sq"
    xmax_mm: firstNumber(sec.match(/X-?Max[^:]{0,20}:\s*(\d+(?:[.,]\d+)?)/i)?.[1]),
    pe_w: (() => {
      // "P RMS: 150 W", "Belastbarkeit: 250 | 175 Watt" (max | RMS). Not "(Rms)", the mechanical resistance.
      const m = sec.match(/(?:P RMS|Belastbarkeit|Leistung)[^:]{0,25}:\s*(\d+)(?:\s*\|\s*(\d+))?/);
      return m ? Math.min(Number(m[1]), Number(m[2] ?? m[1])) : undefined;
    })(),
    cutout_mm: firstNumber(sec.match(/(?:Einbau-?Ø|Einbaudurchmesser|Installation diameter)\s*:\s*(\d+(?:[.,]\d+)?)/i)?.[1]),
    depth_mm: firstNumber(sec.match(/(?:Einbautiefe|Installation depth)\s*:\s*(\d+(?:[.,]\d+)?)/i)?.[1]),
    ...(note ? { note } : {}),
  } as SheetRow;
}

export function rowsOf(pages: SavedPage[]): { rows: SheetRow[]; skipped: string[]; notes: string[] } {
  const rows: SheetRow[] = [];
  const skipped: string[] = [];
  const notes: string[] = [];
  const seen = new Set<string>();
  for (const p of pages) {
    if (p.pdf || p.url.split("/").length < 8) continue; // listing pages are one level up
    const r = parsePage(readFileSync(p.path, "utf8"), p.url);
    if ("skip" in r) {
      if (!/technical data on its page/.test(r.skip)) skipped.push(r.skip);
      continue;
    }
    const k = r.model.toLowerCase().replace(/\s+/g, "");
    if (seen.has(k)) continue;
    seen.add(k);
    const { note, ...row } = r as SheetRow & { note?: string };
    // A kit's woofer that also has its own page (Gamma 165.2 = Gamma GW165), or a kit sold
    // in two versions (SIGMA 165.2 / 165.2 ac): one entry, the woofer's own page when it has one.
    const ts = (x: SheetRow) => [x.fs, x.qts, x.qes, x.vas_l, x.re, x.mms_g, x.impedance].join("|");
    const twin = rows.findIndex((x) => ts(x) === ts(row));
    if (twin >= 0) {
      const kit = (x: SheetRow) => /\.2\b/.test(x.model);
      const [keep, drop] = kit(rows[twin]!) && !kit(row) ? [row, rows[twin]!] : [rows[twin]!, row];
      rows[twin] = keep;
      skipped.push(`${drop.model}: same published values as ${keep.model}, not listed twice`);
      continue;
    }
    if (note) notes.push(`${r.model}: ${note}`);
    rows.push(row);
  }
  return { rows, skipped, notes };
}

async function main() {
  const args = process.argv.slice(2);
  const { rows, skipped, notes } = rowsOf(await pagesFor(TARGET, args));
  const report = "gladen-import-report.md";
  const status = importRows(rows, ["--brand", "GLADEN", "--type", "car-audio", "--note", NOTE, "--website", SITE, "--country", "DE"], {
    out: "tmp-import",
    slug: "gladen",
    args: [...args, "--report", report],
  });
  appendReport(report, "Dual voice coils", notes);
  appendReport(report, "Not read from the website (for Gladen: missing or inconsistent on the page)", skipped);
  process.exit(status);
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
