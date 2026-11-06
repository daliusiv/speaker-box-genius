import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_STATE } from "../src/state.ts";
import { runDesigns, solveDriver, transientsOf } from "../src/sim.ts";

test("impulse and step for each box that's on: same names and colours as the charts, peak 1, starting out", () => {
  const solved = solveDriver(DEFAULT_STATE);
  const designs = runDesigns(DEFAULT_STATE, solved);
  const t = transientsOf(DEFAULT_STATE, solved, designs);
  assert.equal(t.length, designs.length);
  for (const [i, c] of t.entries()) {
    assert.equal(c.label, designs[i]!.label);
    assert.equal(c.color, designs[i]!.color);
    const peak = Math.max(...c.impulse.map(Math.abs));
    assert.ok(Math.abs(peak - 1) < 1e-9);
    // The first big swing is positive: + to + moves the cone out.
    const first = c.impulse.findIndex((v) => Math.abs(v) > 0.5);
    assert.ok(c.impulse[first]! > 0, `${c.label} starts ${c.impulse[first]}`);
  }
});
