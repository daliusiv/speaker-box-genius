import { test } from "node:test";
import assert from "node:assert/strict";
import { boxSuits } from "../src/boxType.ts";

test("box type from EBP and Qts", () => {
  // Dayton RSS210HF-4: Fs 29.6, Qes 0.69, Qms 3.25 → EBP 42.9, Qts 0.57: sealed by EBP, either by Qts.
  const a = boxSuits(29.6, 0.69, 3.25)!;
  assert.equal(Math.round(a.ebp * 10) / 10, 42.9);
  assert.equal(a.suits, "sealed");
  assert.equal(a.text, "leans sealed, ported can work too");
  // RSS265HF-4: EBP 48.3, Qts 0.45.
  const b = boxSuits(25.6, 0.53, 3.06)!;
  assert.equal(Math.round(b.ebp * 10) / 10, 48.3);
  assert.equal(b.suits, "sealed");
  // DSA215-8: EBP 87.5, Qts 0.33: either by EBP, ported by Qts.
  const c = boxSuits(35, 0.4, 1.87)!;
  assert.equal(c.suits, "ported");
  assert.equal(c.text, "leans ported, sealed can work too");
  // One rule says either: the other one leans.
  assert.equal(boxSuits(20, 0.25, 5)!.text, "leans ported, sealed can work too"); // EBP 80, Qts 0.24
  // Both agree.
  assert.equal(boxSuits(50, 0.4, 5)!.text, "suits ported"); // EBP 125, Qts 0.37
  assert.equal(boxSuits(25, 0.8, 4)!.text, "suits sealed"); // EBP 31, Qts 0.67
  // They disagree outright (EBP says ported, Qts sealed): either.
  const d = boxSuits(70, 0.68, 10)!; // EBP 103, Qts 0.64
  assert.deepEqual([d.byEbp, d.byQts, d.suits, d.text], ["ported", "sealed", "either", "suits sealed or ported"]);
  assert.equal(boxSuits(0, 0.5, 3), null);
});
