import { test } from "node:test";
import assert from "node:assert/strict";
import { prCautionNote } from "../src/assistant.ts";
import { DEFAULT_STATE, decodeState, encodeState } from "../src/state.ts";

test("PR caution: on by default at 75 % of Xmax", () => {
  assert.equal(DEFAULT_STATE.settings.prCaution_pct, 75);
});

test("the assistant notes PRs past the caution share, and only then", () => {
  assert.equal(prCautionNote(0.7, 75), "");
  assert.match(prCautionNote(0.8, 75), /past the 75 % where a PR's suspension stiffens/);
  assert.equal(prCautionNote(0.95, 0), "");
});

test("old links (no PR caution) open with the default, and a changed one survives a link", () => {
  const s = { ...DEFAULT_STATE, settings: { ...DEFAULT_STATE.settings, prCaution_pct: 60 } };
  assert.equal(decodeState(encodeState(s))!.settings.prCaution_pct, 60);
  const { prCaution_pct: _drop, ...old } = DEFAULT_STATE.settings;
  assert.equal(decodeState(encodeState({ ...DEFAULT_STATE, settings: old as typeof DEFAULT_STATE.settings }))!.settings.prCaution_pct, 75);
});
