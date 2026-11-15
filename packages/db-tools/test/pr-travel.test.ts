import assert from "node:assert/strict";
import test from "node:test";
import { prTravel, validatePassiveRadiator } from "../../schema/src/index.ts";
import { loadDatabase } from "../src/load.ts";

const pr = (params: Record<string, number>) => ({
  brand: "Example",
  model: "PR1",
  type: "passive-radiator",
  params: { mms_g: 100, sd_cm2: 300, vas_l: 50, ...params },
  sources: [{ kind: "datasheet", url: "https://example.com/pr1.pdf" }],
  status: "community",
});

test("a passive radiator gives Xmax, Xmech or both, and Xmech isn't below Xmax", () => {
  assert.deepEqual(validatePassiveRadiator(pr({ xmax_mm: 10 })), []);
  assert.deepEqual(validatePassiveRadiator(pr({ xmech_mm: 15 })), []);
  assert.deepEqual(validatePassiveRadiator(pr({ xmax_mm: 10, xmech_mm: 15 })), []);
  assert.match(validatePassiveRadiator(pr({})).join(), /xmax_mm .*xmech_mm/);
  assert.match(validatePassiveRadiator(pr({ xmax_mm: 15, xmech_mm: 10 })).join(), /xmech_mm/);
});

test("prTravel: Xmax when published, else Xmech, marked mechanical", () => {
  assert.deepEqual(prTravel({ xmax_mm: 10, xmech_mm: 15 }), { mm: 10, mechanical: false });
  assert.deepEqual(prTravel({ xmech_mm: 15 }), { mm: 15, mechanical: true });
});

test("no PR in the database keeps a mechanical limit as its Xmax", () => {
  for (const { id, data } of loadDatabase().passiveRadiators) {
    assert.doesNotMatch(data.notes ?? "", /Xmax is the published (maximum )?mechanical/, id);
  }
  const mech = loadDatabase().passiveRadiators.filter((e) => e.data.params.xmech_mm !== undefined && e.data.params.xmax_mm === undefined);
  assert.ok(mech.some((e) => e.id === "purifi/ptt8-0pr-na2-01") && mech.some((e) => e.id === "sb-acoustics/sb34nrx-00"));
});
