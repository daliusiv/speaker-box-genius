import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_STATE } from "../src/state.ts";
import { alignmentDriver, solveDriver } from "../src/sim.ts";
import { alignmentHelp, moreVentedFor, ventedAlignmentFor } from "../src/presets.ts";

test("ported and PR cards offer the families that suit the driver, each with its own help", () => {
  const al = alignmentDriver(solveDriver(DEFAULT_STATE), DEFAULT_STATE)!;
  const more = moreVentedFor(al, 1);
  assert.ok(more.length >= 2);
  const flat = ventedAlignmentFor(al, 1)!;
  for (const a of more) {
    assert.notEqual(a.name, flat.name, "not the flat preset again");
    assert.match(alignmentHelp(a), /L tuned to .* Hz/);
    assert.ok(a.vb_l > 0 && a.fb > 0);
  }
  // A high-Qts driver gets the families above B4; one with Qts over 0.72 gets none.
  const hi = { ...al, qes: al.qes * 1.4 };
  const names = (x: typeof al) => moreVentedFor(x, 1).map((a) => a.name);
  assert.ok(names(hi).includes("C4"));
  assert.deepEqual(names({ ...al, qms: 3, qes: 1.2 }), []);
});
