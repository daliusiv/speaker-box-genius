import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { loadDatabase, REPO_ROOT } from "../packages/db-tools/src/load.ts";

/**
 * The database's size as the README, docs and site pages state it ("about 1,530 drivers",
 * "55 passive radiators", "18 brands") must stay close to the real numbers, so a driver
 * import that moves them fails CI until the text is updated.
 */
const db = loadDatabase();
const actual = { drivers: db.drivers.length, prs: db.passiveRadiators.length, brands: db.brands.size };

const files = [
  "README.md",
  ...["docs", "site", "site/pages"].flatMap((dir) =>
    readdirSync(join(REPO_ROOT, dir))
      .filter((f) => f.endsWith(".md"))
      .map((f) => `${dir}/${f}`),
  ),
];

const num = (s: string) => Number(s.replace(/,/g, ""));

test("stated database counts match the database", () => {
  const wrong: string[] = [];
  let seen = 0;
  for (const f of files) {
    const text = readFileSync(join(REPO_ROOT, f), "utf8");
    for (const m of text.matchAll(/(about |over |~)?(\d[\d,]{2,}) drivers/gi)) {
      seen++;
      const n = num(m[2]!);
      const ok = m[1]?.toLowerCase() === "over " ? n <= actual.drivers && n >= actual.drivers * 0.9 : Math.abs(n - actual.drivers) <= actual.drivers * 0.02;
      if (!ok) wrong.push(`${f}: "${m[0]}" (the database has ${actual.drivers})`);
    }
    for (const m of text.matchAll(/(\d+) passive radiators/g)) {
      if (Math.abs(num(m[1]!) - actual.prs) > Math.max(1, actual.prs * 0.02)) wrong.push(`${f}: "${m[0]}" (the database has ${actual.prs})`);
    }
    for (const m of text.matchAll(/(\d+) brands/g)) {
      if (num(m[1]!) !== actual.brands) wrong.push(`${f}: "${m[0]}" (the database has ${actual.brands})`);
    }
  }
  assert.ok(seen > 3, "the counts are stated somewhere");
  assert.deepEqual(wrong, []);
});
