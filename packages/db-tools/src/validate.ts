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

console.log(
  `\n${db.drivers.length} drivers, ${db.passiveRadiators.length} passive radiators, ${db.brands.size} brands` +
    ` — ${db.errors.length} errors, ${db.warnings.length} warnings`,
);

if (db.errors.length > 0) process.exit(1);
