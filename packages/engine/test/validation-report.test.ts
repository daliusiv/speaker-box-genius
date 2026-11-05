import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { REPORT_FILE, reportJson } from "../validation/report.ts";

test("docs/validation/results.json is up to date (run `pnpm validation:report`)", () => {
  const committed = readFileSync(REPORT_FILE, "utf8");
  const fresh = reportJson();
  if (committed === fresh) return;
  // Point at the first line that differs.
  const a = committed.split("\n"), b = fresh.split("\n");
  const i = a.findIndex((l, k) => l !== b[k]);
  assert.fail(`results.json is out of date at line ${i + 1}:\n  committed: ${a[i]?.trim()}\n  now:       ${b[i]?.trim()}\nRun \`pnpm validation:report\` and commit the result.`);
});
