import { test } from "node:test";
import assert from "node:assert/strict";
import { solveTs, type TsValues } from "@sbg/engine";
import { changedFields, changedPrParams, changedText, modification, prModification, resetDriver, sourceFor } from "../src/driverOrigin.ts";
import { withDriver } from "../src/assistant.ts";
import { asCompare, decodeState, DEFAULT_STATE, encodeState, encodeStateShort, decodeStateAny, newDesign, swapCompare, type AppState, type PrDesign } from "../src/state.ts";
import { EDITED } from "../src/driverName.ts";
import type { LoadedDriver } from "../src/library.ts";

const driver: LoadedDriver = {
  id: "example/w8-4",
  name: "Example W8-4",
  brand: "Example",
  nominal_ohms: 4,
  ts: { fs: 32, qms: 4.1, qes: 0.42, vas_l: 38, re: 3.3, sd_cm2: 220, bl: 9.1 },
  le_mh: 0.8,
  xmax_mm: 9,
  pe_w: 150,
  displacement_l: 1.2,
  cutout_mm: 185,
  depth_mm: 95,
  source: { url: "https://example.com/w8" },
};
const loaded = { [driver.id!]: driver };

test("a database pick stores its id, and links and projects keep it", () => {
  const s = withDriver(DEFAULT_STATE, driver);
  assert.equal(s.driverOrigin, "example/w8-4");
  assert.equal(decodeState(encodeState(s))!.driverOrigin, "example/w8-4");
  assert.equal(sourceFor(s.driverOrigin, loaded)?.url, "https://example.com/w8");
  // Old links (no origin) decode as before.
  assert.equal(decodeState(encodeState(DEFAULT_STATE))!.driverOrigin, undefined);
  // Anything that isn't a database id is dropped.
  assert.equal(decodeState(encodeState({ ...s, driverOrigin: "../../etc" }))!.driverOrigin, undefined);
});

test("short links keep the origin of the main and comparison drivers", async () => {
  const s = withDriver(DEFAULT_STATE, driver);
  const both: AppState = { ...s, compare: asCompare({ ...s, driverOrigin: "example/w10-4", driverName: "Example W10-4" }) };
  const back = (await decodeStateAny(await encodeStateShort(both)))!;
  assert.equal(back.driverOrigin, "example/w8-4");
  assert.equal(back.compare?.driverOrigin, "example/w10-4");
  // Swap carries each driver's origin with it.
  const swapped = swapCompare(both);
  assert.equal(swapped.driverOrigin, "example/w10-4");
  assert.equal(swapped.compare?.driverOrigin, "example/w8-4");
});

test("an unchanged database driver has nothing to reset", () => {
  const s = withDriver(DEFAULT_STATE, driver);
  assert.deepEqual(modification(s, loaded)?.changed, []);
  // Changed number of drivers, wiring and volume calculator don't count.
  const t = { ...s, drivers: 2, wiring: "series" as const, volume: { ...s.volume, driverDisp_l: 2 } };
  assert.deepEqual(changedFields(t, driver), []);
});

test("edits show as changed and Reset restores the database's values and name", () => {
  const s = withDriver(DEFAULT_STATE, driver);
  const edited: AppState = { ...s, driverName: s.driverName + EDITED, ts: { ...s.ts, qes: 0.5 }, xmax_mm: 11, drivers: 2, volume: { ...s.volume, driverDisp_l: 2 } };
  assert.deepEqual(modification(edited, loaded)?.changed, ["T/S", "Xmax"]);
  const back = resetDriver(edited, driver);
  assert.equal(back.driverName, "Example W8-4");
  assert.deepEqual(back.ts, driver.ts);
  assert.equal(back.xmax_mm, 9);
  // Kept: how many drivers, and the calculator's displacement.
  assert.equal(back.drivers, 2);
  assert.equal(back.volume.driverDisp_l, 2);
  assert.deepEqual(changedFields(back, driver), []);
  // A cleared T/S value counts as changed.
  const { bl: _bl, ...noBl } = driver.ts;
  assert.deepEqual(changedFields({ ...s, ts: noBl }, driver), ["T/S"]);
});

test("a renamed or replaced driver no longer offers the database reset", () => {
  const s = withDriver(DEFAULT_STATE, driver);
  assert.equal(modification({ ...s, driverName: "My woofer", ts: { ...s.ts, qes: 0.5 } }, loaded), null);
  // Not fetched yet (or offline): nothing shown.
  assert.equal(modification(s, {}), null);
  assert.equal(modification(s, { [driver.id!]: null }), null);
});

test("PR groups compare their parameters with the database's", () => {
  const rec = { name: "Example PR10", params: { mms_g: 90, sd_cm2: 330, vas_l: 60, qms: 7, xmax_mm: 15 } };
  const pr: PrDesign = { ...(newDesign("pr", []) as PrDesign), prName: rec.name, prId: "example/pr10", params: { ...rec.params } };
  assert.deepEqual(prModification(pr, rec), []);
  assert.deepEqual(prModification({ ...pr, params: { ...pr.params, vas_l: 55, sd_cm2: 300 } }, rec), ["Sdp", "Vap"]);
  assert.deepEqual(changedPrParams({ ...rec.params, xmech: true }, rec), ["Xmax"]);
  // Renamed, never from the database, or not fetched: no reset.
  assert.equal(prModification({ ...pr, prName: "Mine" }, rec), null);
  assert.equal(prModification({ ...pr, prId: undefined }, rec), null);
  assert.equal(prModification(pr, null), null);
  // The id survives a link, on the design and on extra groups.
  const s: AppState = { ...DEFAULT_STATE, designs: [{ ...pr, extra: [{ prName: rec.name, prId: "driver:example/w8-4", count: 1, addedMass_g: 0, params: rec.params }] }] };
  const d = decodeState(encodeState(s))!.designs[0] as PrDesign;
  assert.equal(d.prId, "example/pr10");
  assert.equal(d.extra[0]!.prId, "driver:example/w8-4");
  const bad = decodeState(encodeState({ ...s, designs: [{ ...pr, prId: "<script>" } as PrDesign] }))!.designs[0] as PrDesign;
  assert.equal(bad.prId, undefined);
});

test("the T/S solver never changes an entered value, whatever subset is entered", () => {
  const full: TsValues = { fs: 32, qms: 4.1, qes: 0.42, vas_l: 38, re: 3.3, sd_cm2: 220, bl: 9.1, mms_g: 31 };
  const keys = Object.keys(full) as (keyof TsValues)[];
  let seed = 7;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let n = 0; n < 200; n++) {
    const entered: TsValues = {};
    for (const k of keys) if (rand() < 0.6) entered[k] = full[k]! * (0.8 + 0.4 * rand());
    const copy = { ...entered };
    const r = solveTs(entered);
    assert.deepEqual(entered, copy, "input object untouched");
    for (const k of Object.keys(entered) as (keyof TsValues)[]) {
      // (values pass through SI units: equal to rounding noise)
      assert.ok(Math.abs(r.values[k]! - entered[k]!) <= 1e-12 * entered[k]!, `${k} kept as entered`);
      assert.equal(r.source[k], "entered");
    }
  }
});

test("the edited line names what changed", () => {
  assert.equal(changedText(["T/S"]), "T/S was edited");
  assert.equal(changedText(["T/S", "Xmax"]), "T/S and Xmax were edited");
  assert.equal(changedText(["T/S", "Xmax", "Pe"]), "T/S, Xmax and Pe were edited");
});
