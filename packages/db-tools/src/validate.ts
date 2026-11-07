/**
 * Validate the driver and passive radiator database.
 *
 *   pnpm validate:db                  # the real database
 *   pnpm validate:db docs/examples    # any folder with drivers/ and passive-radiators/
 */
import { resolve } from "node:path";
import { loadDatabase, REPO_ROOT } from "./load.ts";

const arg = process.argv[2];
const base = arg ? resolve(process.cwd(), arg) : REPO_ROOT;
const db = loadDatabase(base);

for (const w of db.warnings) console.warn(`⚠️  ${w}`);
for (const e of db.errors) console.error(`❌ ${e}`);

const flagged = [...db.drivers, ...db.passiveRadiators].filter((e) => e.flags.length > 0);
for (const e of flagged) for (const f of e.flags) console.warn(`🔎 ${e.file}: ${f.message}`);

console.log(
  `\n${db.drivers.length} drivers, ${db.passiveRadiators.length} passive radiators, ${db.brands.size} brands` +
    ` — ${db.errors.length} errors, ${db.warnings.length} warnings, ${flagged.length} to check (pnpm db:review)`,
);

if (db.errors.length > 0) process.exit(1);
