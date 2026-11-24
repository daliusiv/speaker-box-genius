import assert from "node:assert/strict";
import { test } from "node:test";
import { loadDatabase } from "../../db-tools/src/load.ts";
import { prCandidate } from "../../../site/drivers.ts";
import { memoryDatabase, prCandidates, treeDatabase } from "../src/index.ts";

test("prCandidates maps the example PR like the site does", async () => {
  const [c, ...rest] = await prCandidates(treeDatabase(new URL("../../../docs/examples", import.meta.url).pathname));
  assert.equal(rest.length, 0);
  assert.equal(c!.id, "example-audio/ex10-pr");
  assert.equal(c!.name, "Example Audio EX10-PR");
  assert.equal(c!.od_cm, 23.2 + 2.5);
  assert.equal(c!.pr.sd_cm2, 330);
  assert.equal(c!.pr.xmax_mm, 18);
  assert.equal(c!.pr.vas_l, 80);
});

test("prCandidates equals site prCandidate for every PR in the real database", async () => {
  const want = loadDatabase().passiveRadiators.map(prCandidate).sort((a, b) => a.id.localeCompare(b.id));
  const got = await prCandidates(treeDatabase());
  assert.ok(want.length > 0);
  assert.deepEqual(
    got,
    want.map(({ id, name, pr, od_cm }) => ({ id, name, pr, od_cm })),
  );
});

test("prCandidates reads only brands that have passive radiators", async () => {
  const asked: string[] = [];
  const base = memoryDatabase(
    {
      drivers: [{ id: "a/d", brand: "A", model: "D", type: "woofer", ohms: 4 }],
      passiveRadiators: [{ id: "b/p", brand: "B", model: "P" }],
    },
    {
      a: { drivers: {}, passiveRadiators: {} },
      b: { drivers: {}, passiveRadiators: { "b/p": { brand: "B", model: "P", params: { mms_g: 100, sd_cm2: 200, xmech_mm: 12, fs: 25 } } } },
    },
  );
  const db = { ...base, shard: (b: string) => (asked.push(b), base.shard(b)) };
  const [c] = await prCandidates(db);
  assert.deepEqual(asked, ["b"]);
  assert.equal(c!.pr.xmax_mm, 12);
  assert.equal((c!.pr as { xmech?: boolean }).xmech, true);
  assert.equal(c!.od_cm, undefined);
});
