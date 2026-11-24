import { test } from "node:test";
import assert from "node:assert/strict";
import { nudge, nudgeKey, nudgeSize } from "../src/ui/nudge.ts";

const key = (k: string, mods: { shiftKey?: boolean; altKey?: boolean; ctrlKey?: boolean; metaKey?: boolean } = {}) => ({ key: k, shiftKey: false, altKey: false, ctrlKey: false, metaKey: false, ...mods });

test("the step is a tenth of the value's size", () => {
  assert.equal(nudgeSize(50, 1), 1);
  assert.equal(nudgeSize(30, 1), 1);
  assert.equal(nudgeSize(2.83, 1), 0.1);
  assert.equal(nudgeSize(0.38, 1), 0.01);
  assert.equal(nudgeSize(350, 1), 10);
});

test("Shift is ten times the step, Alt a tenth", () => {
  assert.equal(nudge(50, 1, { coarse: true }), 60);
  assert.equal(nudge(50, 1, { fine: true }), 50.1);
  assert.equal(nudge(0.38, -1, { coarse: true }), 0.3);
});

test("steps snap to the step's grid", () => {
  assert.equal(nudge(32.47, 1), 33);
  assert.equal(nudge(32.47, -1), 32);
  assert.equal(nudge(33, 1), 34);
});

test("down from a round decade takes the finer step, so up then down is reversible", () => {
  assert.equal(nudge(10, -1), 9.9);
  assert.equal(nudge(9.9, 1), 10);
  assert.equal(nudge(100, -1), 99);
  assert.equal(nudge(99, 1), 100);
  assert.equal(nudge(1, -1), 0.99);
  for (const v of [0.38, 2.8, 18, 50, 120, 7.5, 10, 1]) {
    assert.equal(nudge(nudge(v, 1), -1), v, `${v} up then down`);
    assert.equal(nudge(nudge(v, -1), 1), v, `${v} down then up`);
  }
});

test("no float noise", () => {
  assert.equal(nudge(0.1 + 0.2, 1), 0.31);
  assert.equal(nudge(0.7, 1), 0.71);
  assert.equal(nudge(2.9, -1), 2.8);
});

test("negative values (gains) step the same way, and 0 uses the zero step", () => {
  assert.equal(nudge(-3, 1), -2.9);
  assert.equal(nudge(-3, -1), -3.1);
  assert.equal(nudge(0, 1), 1);
  assert.equal(nudge(0, -1, {}, 0.5), -0.5);
});

test("only plain or Shift/Alt arrows nudge; Ctrl/⌘ and other keys are left alone; min/max clamp", () => {
  assert.equal(nudgeKey(key("ArrowUp"), 50), 51);
  assert.equal(nudgeKey(key("ArrowDown", { shiftKey: true }), 50), 40);
  assert.equal(nudgeKey(key("ArrowUp", { ctrlKey: true }), 50), null);
  assert.equal(nudgeKey(key("ArrowUp", { metaKey: true }), 50), null);
  assert.equal(nudgeKey(key("ArrowLeft"), 50), null);
  assert.equal(nudgeKey(key("a"), 50), null);
  assert.equal(nudgeKey(key("ArrowDown"), 5, { min: 4.95 }), 4.95);
  assert.equal(nudgeKey(key("ArrowUp", { shiftKey: true }), 95, { max: 100 }), 100);
});
