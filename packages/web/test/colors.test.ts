import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_STATE, newDesign, type AppState, type DesignKind, type DesignState } from "../src/state.ts";
import { KIND_COLORS, colorOf } from "../src/sim.ts";

const project = (kinds: DesignKind[]): AppState => {
  const designs: DesignState[] = [];
  for (const k of kinds) designs.push(newDesign(k, designs));
  return { ...DEFAULT_STATE, designs };
};
const colors = (s: AppState) => s.designs.map((d) => colorOf(s, d.id));

test("each box type keeps its own colour, however many types the project has", () => {
  const [blue, orange, green, purple, pink] = (["sealed", "vented", "pr", "bandpass", "line"] as const).map((k) => KIND_COLORS[k][0]);
  assert.deepEqual(colors(project(["sealed", "vented", "pr"])), [blue, orange, green]);
  // One box type alone: its own colour, not the first in a list.
  assert.deepEqual(colors(project(["vented"])), [orange]);
  assert.deepEqual(colors(project(["pr"])), [green]);
  assert.deepEqual(colors(project(["bandpass", "line"])), [purple, pink]);
  // Order doesn't matter.
  assert.deepEqual(colors(project(["pr", "sealed"])), [green, blue]);
  // A second design of a type takes the next shade of the same colour.
  const two = colors(project(["vented", "sealed", "vented"]));
  assert.deepEqual(two, [orange, blue, KIND_COLORS.vented[1]]);
  // Every colour differs from every other.
  const all = Object.values(KIND_COLORS).flat();
  assert.equal(new Set(all).size, all.length);
});
