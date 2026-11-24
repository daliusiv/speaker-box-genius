import { test } from "node:test";
import assert from "node:assert/strict";
import { loadDatabase } from "../../db-tools/src/load.ts";
import { buildIndex } from "../../db-tools/src/bundleData.ts";
import { driverFromRecord, type DbIndex } from "../src/library.ts";
import { withDriver } from "../src/assistant.ts";
import { DEFAULT_STATE } from "../src/state.ts";
import { searchTicks, type SearchStep } from "../src/search.ts";
import { checkTicks } from "./ticks.ts";
import {
  APP_SUBSTITUTES,
  candidateInput,
  dF3Hz,
  mainDriverInput,
  rankForApp,
  rowInput,
  similarBoxes,
  similarJob,
  similarRows,
  targetInput,
} from "../src/similarApp.ts";

const db = loadDatabase();
const index = buildIndex(db, "test") as unknown as DbIndex;
const recs = new Map(db.drivers.map((d) => [d.id, d.data]));
const rowOf = (id: string) => index.drivers.find((r) => r.id === id)!;
const loaded = (id: string) => driverFromRecord(id, recs.get(id)!);
const ID = index.drivers.find((r) => r.model === "RSS315HF-4")!.id;
const state = withDriver(DEFAULT_STATE, loaded(ID));

test("Similar mode ranks the database against the main driver: no self, no own versions, brand cap, k rows", () => {
  const target = targetInput(state, rowOf(ID))!;
  assert.ok(target);
  assert.equal(target.id, ID);
  assert.equal(target.type, rowOf(ID).type);
  const ranked = rankForApp(target, index.drivers);
  assert.equal(ranked.length, APP_SUBSTITUTES);
  const fam = rowOf(ID).family;
  for (const r of ranked) {
    assert.notEqual(r.id, ID);
    if (fam) assert.notEqual(rowOf(r.id).family, fam, `${r.id} is a version of the target`);
  }
  assert.ok(ranked.filter((r) => rowOf(r.id).brand === rowOf(ID).brand).length <= 3);
  for (let i = 1; i < ranked.length; i++) assert.ok(ranked[i]!.distance >= ranked[i - 1]!.distance);
  // Its own 8 Ω sibling family member isn't listed; the HFA (another part) is near the top.
  assert.ok(ranked.slice(0, 3).some((r) => rowOf(r.id).model.startsWith("RSS315HFA")));
});

test("an edited or typed driver is ranked from its current values (bass pool, size from Sd)", () => {
  const typed = { ...state, driverName: "My driver", driverOrigin: undefined, ts: { ...state.ts, fs: (state.ts.fs ?? 20) * 1.1 } };
  const t = targetInput(typed)!;
  assert.equal(t.id, "current");
  assert.equal(t.type, "woofer");
  assert.equal(t.size_in, 12);
  assert.ok(Math.abs(t.fs - (state.ts.fs ?? 0) * 1.1) < 1e-9);
  assert.equal(rankForApp(t, index.drivers).length, APP_SUBSTITUTES);
});

test("rows without Fs, Qts, Vas or Sd aren't scored; a doubtful Xmax counts as missing", () => {
  const r = rowOf(ID);
  assert.equal(rowInput({ ...r, fs: undefined }), null);
  assert.equal(rowInput({ ...r, sd_cm2: undefined }), null);
  assert.equal(rowInput({ ...r, flags: ["xmax-high"] })!.xmax_doubtful, true);
  assert.equal(rowInput(r)!.xmax_doubtful, r.xmax_doubtful);
});

test("same-box check in your box: the main driver against itself is 0; a bigger Xmax and Pe play louder", () => {
  const boxes = similarBoxes(state);
  assert.ok(boxes.length >= 1);
  const self = candidateInput(state, loaded(ID), rowOf(ID));
  // Twice the Xmax, with the power rating out of the way (else the coil limit sets max SPL).
  const bigger = { ...self, xmax_mm: self.xmax_mm! * 2, pe_w: 10 * self.pe_w! };
  const job = similarJob(state, boxes[0]!.box, [
    { id: "self", driver: self },
    { id: "bigger", driver: bigger },
  ]);
  const ticks = [...searchTicks({ kind: "similar", ...job })];
  checkTicks(ticks);
  // Data a worker can take.
  structuredClone({ kind: "similar", ...job });
  const steps = ticks.flatMap((t) => (t.step ? [t.step] : [])) as Extract<SearchStep, { kind: "similar" }>[];
  assert.deepEqual(
    steps.map((s) => s.id),
    ["self", "bigger"],
  );
  const s0 = steps[0]!.delta!;
  assert.ok(Math.abs(dF3Hz(s0)!) < 1e-9);
  assert.ok(Math.abs(s0.dMaxSpl!) < 1e-9);
  assert.ok(Math.abs(s0.dLevel283) < 1e-9);
  assert.ok(steps[1]!.delta!.dMaxSpl! > 0.5, `bigger Xmax: ${steps[1]!.delta!.dMaxSpl}`);
  assert.equal(mainDriverInput(state).xmax_mm, self.xmax_mm);
});

test("each row's tier comes from its parameters, then the box check can move it down; pending rows keep it", () => {
  const target = targetInput(state, rowOf(ID))!;
  const ranked = rankForApp(target, index.drivers);
  const r0 = ranked[0]!;
  const worse = { f3Target: 30, f3Candidate: 40, dF3: 1 / 3, dMaxSpl: 0, dLevel283: 0, worseLimits: [], peFromTarget: false, maxSplAt: null };
  const rows = similarRows(ranked, new Map([[r0.id, worse]]));
  assert.equal(rows[0]!.scoreTier, r0.tier);
  assert.equal(rows[0]!.tier, r0.tier === "close" ? "usable" : "risky");
  assert.equal(rows[1]!.delta, undefined);
  assert.equal(rows[1]!.tier, ranked[1]!.tier);
  assert.equal(dF3Hz(worse), 10);
});
