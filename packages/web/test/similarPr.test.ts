import { test } from "node:test";
import assert from "node:assert/strict";
import type { PrFinderResult } from "@sbg/engine";
import { orderFinderResults, prInUse } from "../src/similarPr.ts";
import type { DbIndex } from "../src/library.ts";
import type { PrDesign, PrParams } from "../src/state.ts";

const P: Record<string, PrParams> = {
  "d/big": { mms_g: 300, sd_cm2: 1000, xmax_mm: 20, qms: 10, vas_l: 300 },
  "d/half": { mms_g: 150, sd_cm2: 500, xmax_mm: 20, qms: 10, vas_l: 150 },
  "d/small": { mms_g: 40, sd_cm2: 200, xmax_mm: 8, qms: 10, vas_l: 30 },
  "d/near": { mms_g: 320, sd_cm2: 950, xmax_mm: 18, qms: 10, vas_l: 280 },
};
const row = (id: string, count: number) => ({ id, name: id, count, ok: true }) as unknown as PrFinderResult;
// Ranked best first, as rankPrResults returns them.
const ranked = [row("d/small", 4), row("d/half", 2), row("d/near", 1), row("d/big", 1)];
const ref = { count: 1, ...P["d/big"]! };
const inUse = { id: "d/big", count: 1 };

test("closest: the PR in use first, then by likeness; two of half the size count as one", () => {
  const out = orderFinderResults(ranked, ref, inUse, (id) => P[id], "closest");
  assert.deepEqual(out.map((r) => `${r.count}×${r.id}`), ["1×d/big", "2×d/half", "1×d/near", "4×d/small"]);
  assert.equal(out[0]!.distance, 0);
  assert.equal(out[1]!.tier, "close");
});

test("best: the ranked order kept, tiers still given", () => {
  const out = orderFinderResults(ranked, ref, inUse, (id) => P[id], "best");
  assert.deepEqual(out.map((r) => r.id), ranked.map((r) => r.id));
  assert.ok(out.every((r) => r.tier));
});

test("no PR in use: ranked order, no tiers", () => {
  const out = orderFinderResults(ranked, null, null, (id) => P[id], "closest");
  assert.deepEqual(out.map((r) => r.id), ranked.map((r) => r.id));
  assert.ok(out.every((r) => r.tier === undefined));
});

test("prInUse: a database PR still under its own name; renamed or typed in → none", () => {
  const db = { passiveRadiators: [{ id: "dayton-audio/rss390-pr", brand: "Dayton Audio", model: "RSS390-PR" }] } as unknown as DbIndex;
  const d = { prId: "dayton-audio/rss390-pr", prName: "Dayton Audio RSS390-PR", count: 1 } as PrDesign;
  assert.deepEqual(prInUse(d, db), { id: "dayton-audio/rss390-pr", count: 1, label: "RSS390-PR" });
  assert.equal(prInUse({ ...d, prName: "My PR" }, db), null);
  assert.equal(prInUse({ ...d, prId: undefined }, db), null);
});
