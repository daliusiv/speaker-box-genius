/**
 * Read a spreadsheet (CSV, TSV or .xlsx) into rows of strings, with no dependencies.
 *
 * Manufacturers send T/S data as Excel or CSV exports. This reads either, so the
 * importer (import-sheet.ts) only deals with rows and columns.
 */
import { readFileSync } from "node:fs";
import { inflateRawSync } from "node:zlib";

export type Rows = string[][];

export interface ReadOptions {
  /** Worksheet name for .xlsx files (default: the first sheet). */
  sheet?: string;
}

export interface Sheet {
  rows: Rows;
  /** True when numbers use a decimal comma ("0,43"), as in many European CSV exports. */
  decimalComma: boolean;
}

export function readSheet(path: string, opts: ReadOptions = {}): Sheet {
  const buf = readFileSync(path);
  if (buf.readUInt32LE(0) === 0x04034b50) return { rows: readXlsx(buf, opts.sheet), decimalComma: false };
  if (/\.xls$/i.test(path)) throw new Error("Old .xls files aren't supported: save it as .xlsx or CSV first.");
  let text = buf.toString("utf8");
  if (text.includes("�")) text = buf.toString("latin1"); // Excel's "CSV" on Windows is often cp1252
  return parseCsv(text.replace(/^﻿/, ""));
}

// ---------------------------------------------------------------------------
// CSV / TSV
// ---------------------------------------------------------------------------

/** Parse CSV, semicolon-separated or tab-separated text (delimiter detected), with quoted fields. */
export function parseCsv(text: string): Sheet {
  const sample = text.split(/\r?\n/).slice(0, 20).join("\n");
  const count = (c: string) => sample.split(c).length - 1;
  const delim = (["\t", ";", ","] as const).reduce((a, b) => (count(b) > count(a) ? b : a));
  const rows: Rows = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"' && cell.trim() === "") {
      quoted = true;
      cell = "";
    } else if (ch === delim) {
      row.push(cell.trim());
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell.trim());
      rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  if (cell !== "" || row.length) {
    row.push(cell.trim());
    rows.push(row);
  }
  // Decimal commas: a semicolon file, or a tab file whose numbers look like "0,43" and never "0.43".
  const cells = rows.flat();
  const commaNums = cells.filter((c) => /^-?\d+,\d+$/.test(c) && !/^-?\d{1,3},\d{3}$/.test(c)).length;
  const dotNums = cells.filter((c) => /^-?\d+\.\d+$/.test(c)).length;
  const decimalComma = delim === ";" || (delim === "\t" && commaNums > 0 && dotNums === 0);
  return { rows: rows.filter((r) => r.some((c) => c !== "")), decimalComma };
}

// ---------------------------------------------------------------------------
// XLSX (a zip of XML files)
// ---------------------------------------------------------------------------

/** The files in a zip archive, by name. Handles stored and deflated entries. */
export function unzip(buf: Buffer): Map<string, Buffer> {
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("Not a valid .xlsx (zip) file");
  const entries = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const files = new Map<string, Buffer>();
  for (let n = 0; n < entries; n++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error("Corrupt zip central directory");
    const method = buf.readUInt16LE(p + 10);
    const size = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const name = buf.toString("utf8", p + 46, p + 46 + nameLen);
    const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    const raw = buf.subarray(start, start + size);
    if (method === 0) files.set(name, raw);
    else if (method === 8) files.set(name, inflateRawSync(raw));
    p += 46 + nameLen + extraLen + commentLen;
  }
  return files;
}

const xmlText = (s: string) =>
  s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&amp;/g, "&");

/** All the text in <t> elements of a fragment (rich text runs joined). */
const tText = (xml: string) => [...xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map((m) => xmlText(m[1]!)).join("");

const colIndex = (ref: string) => {
  const letters = ref.match(/^[A-Z]+/)![0];
  let n = 0;
  for (const ch of letters) n = n * 26 + ch.charCodeAt(0) - 64;
  return n - 1;
};

/** Numbers as Excel stores them carry float noise (0.43000000000000005): tidy to 10 significant digits. */
const tidy = (v: string) => {
  const n = Number(v);
  return Number.isFinite(n) ? String(Number(n.toPrecision(10))) : v;
};

export function readXlsx(buf: Buffer, sheetName?: string): Rows {
  const files = unzip(buf);
  const get = (name: string) => files.get(name)?.toString("utf8");
  const workbook = get("xl/workbook.xml");
  if (!workbook) throw new Error("Not an Excel workbook (xl/workbook.xml missing)");
  const sheets = [...workbook.matchAll(/<sheet\b[^>]*>/g)].map((m) => ({
    name: xmlText(m[0].match(/\bname="([^"]*)"/)?.[1] ?? ""),
    rid: m[0].match(/\br:id="([^"]*)"/)?.[1] ?? m[0].match(/\bid="([^"]*)"/)?.[1] ?? "",
  }));
  const sheet = sheetName ? sheets.find((s) => s.name.toLowerCase() === sheetName.toLowerCase()) : sheets[0];
  if (!sheet) throw new Error(`No sheet "${sheetName}". Sheets: ${sheets.map((s) => s.name).join(", ")}`);
  const rels = get("xl/_rels/workbook.xml.rels") ?? "";
  const rel = [...rels.matchAll(/<Relationship\b[^>]*>/g)].find((m) => m[0].includes(`Id="${sheet.rid}"`))?.[0];
  const target = rel?.match(/Target="([^"]*)"/)?.[1] ?? "worksheets/sheet1.xml";
  const path = target.startsWith("/") ? target.slice(1) : `xl/${target}`;
  const xml = get(path);
  if (!xml) throw new Error(`Worksheet ${path} missing`);

  const shared = [...(get("xl/sharedStrings.xml") ?? "").matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => tText(m[1]!));
  return rowsOfWorksheet(xml, shared);
}

/** The cells of a worksheet's XML, as text rows (empty rows dropped). */
export function rowsOfWorksheet(xml: string, shared: string[] = []): Rows {
  const rows: Rows = [];
  for (const rm of xml.matchAll(/<row\b[^>]*?(?:\/>|>([\s\S]*?)<\/row>)/g)) {
    const row: string[] = [];
    for (const cm of (rm[1] ?? "").matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = cm[1]!;
      const body = cm[2] ?? "";
      const ref = attrs.match(/\br="([A-Z]+)\d+"/)?.[1];
      const t = attrs.match(/\bt="([^"]*)"/)?.[1];
      // <v> can carry attributes (xml:space="preserve" on formula strings).
      const v = body.match(/<v\b[^>]*>([\s\S]*?)<\/v>/)?.[1];
      let value = "";
      if (t === "s" && v !== undefined) value = shared[Number(v)] ?? "";
      else if (t === "inlineStr") value = tText(body);
      else if (t === "str" || t === "e") value = xmlText(v ?? "");
      else if (t === "b") value = v === "1" ? "TRUE" : "FALSE";
      else if (v !== undefined) value = tidy(v);
      const i = ref ? colIndex(ref) : row.length;
      while (row.length < i) row.push("");
      row[i] = value.trim();
    }
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c !== ""));
}
