/**
 * Convert a folder of WinISD .wdr files into database entries.
 *
 *   pnpm db:import-wdr ~/WinISD/Drivers            # writes into drivers/
 *   pnpm db:import-wdr ~/WinISD/Drivers --dry-run  # just report
 *
 * Imported entries are marked as community data without a datasheet link.
 * Before opening a pull request, add the manufacturer's datasheet URL to each
 * file's "sources" and set the correct "type" (woofer, subwoofer…).
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { parseWdr } from "../../engine/src/wdr.ts";
import { REPO_ROOT } from "./load.ts";

const slug = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

const args = process.argv.slice(2);
const dir = args.find((a) => !a.startsWith("--"));
const dryRun = args.includes("--dry-run");
if (!dir) {
  console.error("Usage: pnpm db:import-wdr <folder-with-wdr-files> [--dry-run]");
  process.exit(2);
}

const files = readdirSync(resolve(dir)).filter((f) => f.toLowerCase().endsWith(".wdr"));
let written = 0;
let skipped = 0;
const today = new Date().toISOString().slice(0, 10);

for (const f of files) {
  const path = join(resolve(dir), f);
  try {
    // WinISD on Windows often saves in a legacy code page; latin1 keeps names readable enough.
    const d = parseWdr(readFileSync(path, "latin1"));
    const brand = d.brand || "unknown";
    const model = d.model || basename(f, ".wdr");
    const brandSlug = slug(brand);
    const modelSlug = slug(model);
    if (!brandSlug || !modelSlug) throw new Error("missing brand or model");
    if (d.nominal_ohms === undefined) throw new Error("no nominal impedance (Znom)");

    const out = join(REPO_ROOT, "drivers", brandSlug, `${modelSlug}.json`);
    if (existsSync(out)) {
      console.log(`- ${f}: already in the database as ${brandSlug}/${modelSlug}, skipped`);
      skipped++;
      continue;
    }
    const t = d.ts;
    const record = {
      brand,
      model,
      type: "other",
      nominal_ohms: d.nominal_ohms,
      ts: {
        fs: t.fs,
        qms: t.qms,
        qes: t.qes,
        qts: t.qts,
        vas_l: t.vas_l,
        re: t.re,
        le_mh: d.le_mh,
        bl: t.bl,
        mms_g: t.mms_g,
        sd_cm2: t.sd_cm2,
        xmax_mm: d.xmax_mm,
        pe_w: d.pe_w,
      },
      physical: d.displacement_l || d.depth_mm ? { displacement_l: d.displacement_l, depth_mm: d.depth_mm } : undefined,
      sources: [
        {
          kind: "community",
          retrieved: today,
          note: `Imported from WinISD file "${f}". TODO: add the manufacturer datasheet link and check the values.`,
        },
      ],
      status: "community",
      notes: d.comment || undefined,
    };
    const round = (_: string, v: unknown) => (typeof v === "number" ? Number(v.toPrecision(6)) : v);
    if (!dryRun) {
      mkdirSync(join(REPO_ROOT, "drivers", brandSlug), { recursive: true });
      const brandFile = join(REPO_ROOT, "drivers", brandSlug, "_brand.json");
      if (!existsSync(brandFile)) writeFileSync(brandFile, JSON.stringify({ name: brand }, null, 2) + "\n");
      writeFileSync(out, JSON.stringify(record, round, 2) + "\n");
    }
    console.log(`+ ${f} → drivers/${brandSlug}/${modelSlug}.json`);
    written++;
  } catch (e) {
    console.log(`! ${f}: ${(e as Error).message}`);
    skipped++;
  }
}

console.log(`\n${dryRun ? "Would write" : "Wrote"} ${written} driver(s), skipped ${skipped}.`);
if (written > 0 && !dryRun) {
  console.log('Next: set each file\'s "type", add a datasheet link to "sources", then run `pnpm validate:db`.');
}
