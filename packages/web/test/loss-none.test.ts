import { test } from "node:test";
import assert from "node:assert/strict";

test("a loss Q shows as none from 10⁶ up, and the none value is the one links carry", async () => {
  const { qText, NO_LOSS_Q, NO_LOSS } = await import("../src/state.ts");
  assert.equal(qText(10), "10");
  assert.equal(qText(100), "100");
  assert.equal(qText(NO_LOSS_Q), "none");
  assert.equal(qText(1e6), "none");
  assert.equal(NO_LOSS.at, NO_LOSS_Q);
});
