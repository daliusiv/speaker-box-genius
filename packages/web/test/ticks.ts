import assert from "node:assert/strict";
import type { Tick } from "../src/search.ts";

/** Every job: starts at 0 of total, done never goes down or past total, ends at total of total. */
export function checkTicks(ticks: Tick[]) {
  assert.ok(ticks.length > 0);
  assert.equal(ticks[0]!.done, 0);
  const total = ticks[0]!.total;
  for (let i = 1; i < ticks.length; i++) {
    assert.equal(ticks[i]!.total, total, "total stays put");
    assert.ok(ticks[i]!.done >= ticks[i - 1]!.done && ticks[i]!.done <= total, `tick ${i}: ${ticks[i]!.done} of ${total}`);
  }
  assert.equal(ticks.at(-1)!.done, total);
}
