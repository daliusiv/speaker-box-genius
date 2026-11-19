import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { COUNT_DIRS, countProblems, driverMentions } from "../packages/db-tools/src/counts.ts";
import { loadDatabase, REPO_ROOT } from "../packages/db-tools/src/load.ts";

/**
 * The database's size as the README, docs and site pages state it ("about 1,530 drivers",
 * "55 passive radiators", "18 brands") must stay close to the real numbers, so a driver
 * import that moves them fails CI until the text is updated. The rules live in
 * packages/db-tools/src/counts.ts, which the submission bots also use to fix the text.
 */
const db = loadDatabase();
const actual = { drivers: db.drivers.length, prs: db.passiveRadiators.length, brands: db.brands.size };

const files = [
  "README.md",
  ...COUNT_DIRS.flatMap((dir) =>
    readdirSync(join(REPO_ROOT, dir))
      .filter((f) => f.endsWith(".md"))
      .map((f) => `${dir}/${f}`),
  ),
];

test("stated database counts match the database", () => {
  const wrong: string[] = [];
  let seen = 0;
  for (const f of files) {
    const text = readFileSync(join(REPO_ROOT, f), "utf8");
    seen += driverMentions(text);
    wrong.push(...countProblems(f, text, actual));
  }
  assert.ok(seen > 3, "the counts are stated somewhere");
  assert.deepEqual(wrong, []);
});
