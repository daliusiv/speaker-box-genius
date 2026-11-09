/**
 * The full WinISD run (validation/winisd-run.ts): 51 WinISD projects and about 1,300 readings of
 * WinISD's own graphs. Every reading that is compared must agree within its tolerance; the ones
 * left out each carry a reason, and the leftover differences are listed (KNOWN) with theirs.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { KNOWN, OCR_MISREADS, RUN_CASES, RUN_TOL, runRunCase } from "../validation/winisd-run.ts";

for (const c of RUN_CASES) {
  test(`WinISD run ${c.id}: ${c.title}`, () => {
    for (const r of runRunCase(c)) {
      if (r.skip) continue;
      const t = RUN_TOL[r.graph];
      assert.ok(
        r.pass,
        `${t.label} at ${r.f} Hz: ours ${r.ours.toFixed(4)} vs WinISD ${r.winisd} (${t.rel ? `${(r.diff * 100).toFixed(2)} %` : r.diff.toFixed(4)})`,
      );
    }
  });
}

test("WinISD run: most readings are compared, and every exception still exists", () => {
  const all = RUN_CASES.flatMap(runRunCase);
  const compared = all.filter((r) => !r.skip);
  assert.ok(compared.length >= 950, `only ${compared.length} readings compared`);
  const keys = new Set(all.map((r) => `${r.id}|${r.graph}|${r.f}`));
  for (const k of [...Object.keys(KNOWN), ...Object.keys(OCR_MISREADS)]) assert.ok(keys.has(k), `stale exception ${k}`);
  // A known difference that has gone away should come off the list.
  for (const r of compared) if (r.known) assert.ok(Math.abs(r.diff) > RUN_TOL[r.graph].tol, `${r.id} ${r.graph} ${r.f} now within the normal tolerance: drop it from KNOWN`);
});
