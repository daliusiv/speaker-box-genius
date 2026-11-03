/**
 * Compile drivers/ and passive-radiators/ into the files the web app loads:
 *
 *   <out>/index.json          small search index of every entry
 *   <out>/<brand-slug>.json   full records for one brand (fetched on demand)
 *
 *   node … bundle.ts --out packages/web/public/db [--base docs/examples]
 */
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { loadDatabase, REPO_ROOT } from "./load.ts";

function argValue(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const out = resolve(process.cwd(), argValue("--out") ?? "packages/web/public/db");
const base = argValue("--base") ? resolve(process.cwd(), argValue("--base")!) : REPO_ROOT;

const db = loadDatabase(base);
if (db.errors.length > 0) {
  for (const e of db.errors) console.error(`❌ ${e}`);
  console.error("\nDatabase has errors — run `pnpm validate:db` for details.");
  process.exit(1);
}

const index = {
  generated: new Date().toISOString(),
  brands: Object.fromEntries(db.brands),
  drivers: db.drivers.map(({ id, data: d }) => ({
    id,
    brand: d.brand,
    model: d.model,
    type: d.type,
    ohms: d.nominal_ohms,
    // DVC: per-coil impedance, for labels like "2+2 Ω".
    coil_ohms: d.voice_coils === 2 ? (d.ts_wiring === "series" ? d.nominal_ohms / 2 : d.nominal_ohms * 2) : undefined,
    size_in: d.size_in,
    fs: d.ts.fs,
    qts: d.ts.qts ?? (d.ts.qms * d.ts.qes) / (d.ts.qms + d.ts.qes),
    vas_l: d.ts.vas_l,
    xmax_mm: d.ts.xmax_mm,
    pe_w: d.ts.pe_w,
    status: d.status,
  })),
  passiveRadiators: db.passiveRadiators.map(({ id, data: p }) => ({
    id,
    brand: p.brand,
    model: p.model,
    size_in: p.size_in,
    sd_cm2: p.params.sd_cm2,
    xmax_mm: p.params.xmax_mm,
    status: p.status,
  })),
};

const shards = new Map<string, { drivers: Record<string, unknown>; passiveRadiators: Record<string, unknown> }>();
const shard = (brand: string) => {
  let s = shards.get(brand);
  if (!s) shards.set(brand, (s = { drivers: {}, passiveRadiators: {} }));
  return s;
};
for (const e of db.drivers) shard(e.id.split("/")[0]!).drivers[e.id] = e.data;
for (const e of db.passiveRadiators) shard(e.id.split("/")[0]!).passiveRadiators[e.id] = e.data;

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
writeFileSync(join(out, "index.json"), JSON.stringify(index));
for (const [brand, data] of shards) writeFileSync(join(out, `${brand}.json`), JSON.stringify(data));

console.log(
  `Bundled ${db.drivers.length} drivers and ${db.passiveRadiators.length} passive radiators ` +
    `into ${shards.size} brand shard(s) → ${out}`,
);
