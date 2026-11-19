import { test } from "node:test";
import assert from "node:assert/strict";
import { matchOptions } from "../src/calculators/combo.ts";

const LIST = ["18 Sound 10NMB420 (8 Ω)", "Dayton Audio RSS315HF-4", "Dayton Audio RSS265HF-4", "SB Acoustics SB34SWNRX-S75-6", "Scan-Speak 18W/8531G00"];

test("calculator picker: empty query lists everything in order", () => {
  assert.deepEqual(matchOptions(LIST, ""), { items: LIST, more: 0 });
  assert.deepEqual(matchOptions(LIST, "   "), { items: LIST, more: 0 });
});

test("calculator picker: every word typed, any case, any order", () => {
  assert.deepEqual(matchOptions(LIST, "rss315").items, ["Dayton Audio RSS315HF-4"]);
  assert.deepEqual(matchOptions(LIST, "315 dayton").items, ["Dayton Audio RSS315HF-4"]);
  assert.deepEqual(matchOptions(LIST, "DAYTON").items, ["Dayton Audio RSS315HF-4", "Dayton Audio RSS265HF-4"]);
  assert.deepEqual(matchOptions(LIST, "8531").items, ["Scan-Speak 18W/8531G00"]);
  assert.deepEqual(matchOptions(LIST, "nothing like it").items, []);
});

test("calculator picker: names that start with the query come first", () => {
  assert.deepEqual(matchOptions(LIST, "s").items.slice(0, 2), ["SB Acoustics SB34SWNRX-S75-6", "Scan-Speak 18W/8531G00"]);
  assert.deepEqual(matchOptions(LIST, "18").items, ["18 Sound 10NMB420 (8 Ω)", "Scan-Speak 18W/8531G00"]);
});

test("calculator picker: long lists are cut, the rest counted", () => {
  const many = Array.from({ length: 250 }, (_, i) => `Brand ${i}`);
  const m = matchOptions(many, "brand", 100);
  assert.equal(m.items.length, 100);
  assert.equal(m.more, 150);
  assert.equal(m.items[0], "Brand 0");
});
