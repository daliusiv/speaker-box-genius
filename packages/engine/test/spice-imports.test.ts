// SPICE validation independence: the circuit builder may take only types from the engine.
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const DIR = join(dirname(fileURLToPath(import.meta.url)), "../validation/spice");
const ALLOWED_TYPES = new Set(["../../src/model.ts", "../../src/simulate.ts"]);

test("SPICE builder imports nothing from the engine but types", () => {
  const bad: string[] = [];
  for (const f of readdirSync(DIR).filter((n) => n.endsWith(".ts"))) {
    const src = readFileSync(join(DIR, f), "utf8");
    for (const m of src.matchAll(/^\s*import\s+(type\s+)?[^;]*?from\s+"([^"]+)"/gm)) {
      const typeOnly = !!m[1];
      const from = m[2]!;
      if (from.startsWith("node:") || from.startsWith("./")) continue;
      if (typeOnly && ALLOWED_TYPES.has(from)) continue;
      bad.push(`${f}: ${typeOnly ? "import type" : "import"} from ${from}`);
    }
    // Dynamic imports and require are not allowed at all.
    if (/\bimport\(|\brequire\(/.test(src)) bad.push(`${f}: dynamic import/require`);
  }
  assert.deepEqual(bad, []);
});
