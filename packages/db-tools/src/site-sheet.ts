/**
 * Shared steps for importers that read a manufacturer's website (with permission):
 * read the site with fetch-pages.ts (or use pages already read), turn each product page
 * into a spreadsheet row, and import the rows with `pnpm db:import-sheet`, so every
 * website import gets the same checks, repairs and report as a manufacturer's own file.
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { crawl, type Target } from "./fetch-pages.ts";

export interface SavedPage {
  url: string;
  /** Path of the saved file. */
  path: string;
  pdf: boolean;
  from?: string;
}

/** Pages read by fetch-pages.ts into `dir` (its index.json). */
export function readPages(dir: string): SavedPage[] {
  const index = JSON.parse(readFileSync(join(dir, "index.json"), "utf8")) as { url: string; file?: string; status: number | string; from?: string }[];
  return index.filter((x) => x.file && x.status === 200).map((x) => ({ url: x.url, path: join(dir, x.file!), pdf: x.file!.endsWith(".pdf"), ...(x.from ? { from: x.from } : {}) }));
}

/** Read the site now (into `out`), or use `--pages DIR` if given. */
export async function pagesFor(target: Target, args: string[], out = join("tmp-import", target.name)): Promise<SavedPage[]> {
  const given = args.includes("--pages") ? args[args.indexOf("--pages") + 1] : undefined;
  if (given) return readPages(given);
  await crawl(target, join(out, ".."));
  return readPages(out);
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", sup2: "²", sup3: "³", plusmn: "±", deg: "°", micro: "µ", Omega: "Ω", ohm: "Ω", times: "×", ndash: "–", mdash: "—", prime: "′", Prime: "″" };

export function decode(s: string): string {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&([a-z]+\d?);/gi, (m, n) => ENTITIES[n] ?? m);
}

/** A page's visible text on one line (tags become spaces). */
export function textOf(html: string): string {
  return decode(html.replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, " ").replace(/<br\s*\/?>/gi, " ").replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

/** Table rows as cell text (for pages that use real tables). */
export function tableRows(html: string): string[][] {
  const rows: string[][] = [];
  for (const tr of html.matchAll(/<tr\b[\s\S]*?<\/tr>/gi)) {
    const cells = [...tr[0].matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((c) => textOf(c[1]!));
    if (cells.length) rows.push(cells);
  }
  return rows;
}

/** The first number in a string ("±5.5mm" → 5.5, "0,43" → 0.43). */
export function firstNumber(s: string | undefined): number | undefined {
  if (!s) return undefined;
  const m = s.replace(/(\d),(\d)/g, "$1.$2").match(/-?\d+(?:\.\d+)?(?:e-?\d+)?/i);
  return m ? Number(m[0]) : undefined;
}

/** Spreadsheet columns in the database's own units, as db:import-sheet reads them. */
export const COLUMNS = {
  model: "Model",
  url: "URL",
  kind: "Type",
  size_in: "Size (in)",
  impedance: "Impedance",
  fs: "Fs",
  qts: "Qts",
  qes: "Qes",
  qms: "Qms",
  vas_l: "Vas (l)",
  cms_mm_per_n: "Cms (mm/N)",
  re: "Re",
  le_mh: "Le (mH)",
  bl: "Bl",
  mms_g: "Mms (g)",
  sd_cm2: "Sd (cm2)",
  xmax_mm: "Xmax (mm)",
  xmech_mm: "Xmech (mm)",
  pe_w: "Pe",
  cutout_mm: "Cutout (mm)",
  depth_mm: "Depth (mm)",
  displacement_l: "Displacement (l)",
  coils: "Coils",
  wiring: "Wiring",
} as const;
export type SheetRow = Partial<Record<keyof typeof COLUMNS, string | number>> & { model: string };

export function toCsv(rows: SheetRow[]): string {
  const keys = Object.keys(COLUMNS) as (keyof typeof COLUMNS)[];
  const q = (v: unknown) => {
    const s = v === undefined || v === null || (typeof v === "number" && !Number.isFinite(v)) ? "" : String(typeof v === "number" ? Math.round(v * 1e5) / 1e5 : v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [keys.map((k) => COLUMNS[k]).join(","), ...rows.map((r) => keys.map((k) => q(r[k])).join(","))].join("\n") + "\n";
}

/**
 * Write the rows to a CSV and import them with db:import-sheet. `sheetArgs` are its
 * options (--brand, --note, --website …); --file, --date and --report are filled in.
 */
export function importRows(rows: SheetRow[], sheetArgs: string[], opts: { out: string; slug: string; args: string[] }): number {
  mkdirSync(opts.out, { recursive: true });
  const csv = join(opts.out, `${opts.slug}.csv`);
  writeFileSync(csv, toCsv(rows));
  const script = join(import.meta.dirname, "import-sheet.ts");
  const pass = opts.args.filter((a) => a === "--dry-run");
  const report = opts.args.includes("--report") ? opts.args[opts.args.indexOf("--report") + 1]! : join(opts.out, `${opts.slug}-import-report.md`);
  const r = spawnSync(
    process.execPath,
    ["--experimental-strip-types", "--disable-warning=ExperimentalWarning", script, ...sheetArgs, "--file", csv, "--date", new Date().toISOString().slice(0, 10), "--report", report, ...pass],
    { stdio: "inherit" },
  );
  return r.status ?? 1;
}

/** Append lines to the report db:import-sheet wrote (what the page reader skipped). */
export function appendReport(path: string, title: string, lines: string[]) {
  if (!lines.length || !existsSync(path)) return;
  writeFileSync(path, readFileSync(path, "utf8") + `\n### ${title}\n${lines.map((l) => `- ${l}`).join("\n")}\n`);
}
