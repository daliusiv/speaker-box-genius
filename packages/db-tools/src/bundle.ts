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
import { buildIndex, buildShards } from "./bundleData.ts";

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

const index = buildIndex(db);
const shards = buildShards(db);

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
writeFileSync(join(out, "index.json"), JSON.stringify(index));
for (const [brand, data] of shards) writeFileSync(join(out, `${brand}.json`), JSON.stringify(data));

console.log(
  `Bundled ${db.drivers.length} drivers and ${db.passiveRadiators.length} passive radiators ` +
    `into ${shards.size} brand shard(s) → ${out}`,
);
