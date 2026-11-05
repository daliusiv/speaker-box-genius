import { test } from "node:test";
import assert from "node:assert/strict";
import { historyReducer, initHistory, MAX_STEPS, MERGE_MS, type History, type HistoryAction } from "../src/history.ts";

const run = (actions: HistoryAction<number>[], start = 0) => actions.reduce((h, a) => historyReducer(h, a), initHistory(start));
const set = (v: number, now: number, step?: boolean): HistoryAction<number> => ({ type: "set", update: () => v, now, step });

test("each separate change is one undo step; redo goes forward again", () => {
  let h: History<number> = run([set(1, 1000), set(2, 5000), set(3, 9000)]);
  assert.equal(h.present, 3);
  h = historyReducer(h, { type: "undo" });
  assert.equal(h.present, 2);
  h = historyReducer(h, { type: "undo" });
  h = historyReducer(h, { type: "undo" });
  assert.equal(h.present, 0);
  assert.equal(historyReducer(h, { type: "undo" }), h, "nothing left to undo");
  h = historyReducer(h, { type: "redo" });
  h = historyReducer(h, { type: "redo" });
  assert.equal(h.present, 2);
});

test("a burst of changes (typing, dragging) is one step", () => {
  const h = run([set(1, 1000), set(12, 1000 + MERGE_MS / 2), set(123, 1000 + MERGE_MS)]);
  assert.equal(h.present, 123);
  // The first change of a session always makes a step; the burst after it merges into it.
  assert.equal(historyReducer(h, { type: "undo" }).present, 0);
});

test("a marked step never merges, and nothing merges into it", () => {
  let h = run([set(1, 1000), set(2, 1100, true), set(3, 1200)]);
  h = historyReducer(h, { type: "undo" });
  assert.equal(h.present, 2);
  h = historyReducer(h, { type: "undo" });
  assert.equal(h.present, 1);
});

test("a change after undo starts a new step and clears redo", () => {
  let h = run([set(1, 1000), set(2, 5000)]);
  h = historyReducer(h, { type: "undo" });
  h = historyReducer(h, set(7, 5100));
  assert.equal(h.future.length, 0);
  assert.equal(historyReducer(h, { type: "undo" }).present, 1, "the edit right after undo is its own step");
});

test("no-op changes leave history alone; history is capped", () => {
  const h0 = run([set(1, 1000)]);
  assert.equal(historyReducer(h0, { type: "set", update: (s) => s, now: 9000 }), h0);
  const many = run(Array.from({ length: MAX_STEPS + 50 }, (_, i) => set(i + 1, i * 10_000)));
  assert.equal(many.past.length, MAX_STEPS);
});

test("a drag is one undo step: it starts a step, and its later changes join it even after a pause", () => {
  const set = (v: number, now: number, o: { start?: boolean; hold?: boolean } = {}): HistoryAction<number> => ({ type: "set", update: () => v, now, ...o });
  // Typing (1, 2), then a drag (3, 4, 5) with a 5 s pause in the middle, then typing again.
  const h = run([set(1, 0), set(2, 100), set(3, 200, { start: true }), set(4, 300, { hold: true }), set(5, 5300, { hold: true }), set(6, 9000)]);
  assert.deepEqual(h.past, [0, 2, 5]);
  assert.equal(h.present, 6);
});
