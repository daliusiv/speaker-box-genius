import { test } from "node:test";
import assert from "node:assert/strict";
import { boardNumbers, type ObForm } from "../src/calculators/obCalcMath.ts";
import { obNumbers } from "../src/calculators/obCalcRun.ts";
import type { ObCalcReply, ObCalcRequest } from "../src/calculators/obCalcRun.ts";

const FRAME: ObForm = { frame: "u", w_cm: 45, h_cm: 60, x_cm: 22.5, y_cm: 25, t_cm: 1.8, depth_cm: 30 };

test("open baffle calculator: without a worker a frame's numbers are worked out here, the same as the card's", async () => {
  assert.equal(typeof Worker, "undefined", "Node has no Web Worker: the page path runs");
  assert.deepEqual(await obNumbers(FRAME, 0.05), boardNumbers(FRAME, 0.05));
});

test("open baffle calculator: the worker answers a frame's numbers with the page's values", async () => {
  const sent: ObCalcReply[] = [];
  const g = globalThis as unknown as { self?: unknown };
  const had = g.self;
  const self: { onmessage?: (e: { data: ObCalcRequest }) => void; postMessage: (m: ObCalcReply) => void } = { postMessage: (m) => sent.push(m) };
  g.self = self;
  try {
    await import("../src/calculators/obCalcWorker.ts");
    self.onmessage!({ data: { id: 7, kind: "numbers", board: FRAME, sd_m2: 0.05 } });
    assert.equal(sent.length, 1);
    assert.equal(sent[0]!.id, 7);
    assert.deepEqual(structuredClone(sent[0]!.numbers), boardNumbers(FRAME, 0.05));
  } finally {
    g.self = had;
  }
});
