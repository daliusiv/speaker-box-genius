/**
 * SPICE validation: read the committed case inputs and (re)write their netlists.
 *
 *   node --experimental-strip-types packages/engine/validation/spice/fixtures.ts
 *
 * rewrites test/fixtures/spice/cases/<id>.cir from inputs/<id>.json. The inputs are immutable
 * once committed; new cases are added as new files.
 */
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { SpiceCase } from "./elements.ts";
import { buildNetlist } from "./netlist.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
export const FIXTURES = join(HERE, "../../test/fixtures/spice");
export const INPUTS = join(FIXTURES, "inputs");
export const CASES = join(FIXTURES, "cases");

export function loadCases(): SpiceCase[] {
  return readdirSync(INPUTS)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .map((f) => {
      const c = JSON.parse(readFileSync(join(INPUTS, f), "utf8")) as SpiceCase;
      if (`${c.id}.json` !== f) throw new Error(`${f}: id ${c.id} doesn't match the file name`);
      return c;
    });
}

export const cirPath = (id: string) => join(CASES, `${id}.cir`);

if (import.meta.url === `file://${process.argv[1]}`) {
  mkdirSync(CASES, { recursive: true });
  for (const c of loadCases()) writeFileSync(cirPath(c.id), buildNetlist(c).text);
  console.log(`wrote ${readdirSync(CASES).length} netlists to ${CASES}`);
}
