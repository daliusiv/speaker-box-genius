import { test } from "node:test";
import assert from "node:assert/strict";
import {
  asCompare,
  compactState,
  DEFAULT_STATE,
  decodeState,
  encodeState,
  swapCompare,
  type AppState,
} from "../src/state.ts";
import { COMPARE_DASH, runDesigns, solveDriver } from "../src/sim.ts";
import { sizeAllForDriver } from "../src/presets.ts";

const roundTrip = (s: AppState) => decodeState(encodeState(s))!;
const shortTrip = (s: AppState) => decodeState(encodeState(compactState(s) as AppState))!;
const run = (s: AppState) => runDesigns(s, solveDriver(s));

const OTHER = { ...asCompare(DEFAULT_STATE), driverName: "Other 12", driverBrand: "Acme", ts: { fs: 24, qms: 4, qes: 0.35, vas_l: 120, re: 3.2, sd_cm2: 480 }, xmax_mm: 15 };
const withCompare = (): AppState => ({ ...DEFAULT_STATE, compare: OTHER });

test("no comparison by default: one run per box, plain names", () => {
  const r = run(DEFAULT_STATE);
  assert.equal(DEFAULT_STATE.compare, null);
  assert.deepEqual(r.map((d) => d.label), DEFAULT_STATE.designs.map((d) => d.name));
  assert.ok(r.every((d) => !d.compare && d.dash === undefined));
});

test("a comparison driver adds a dashed run in every box, in the box's colour", () => {
  const s = withCompare();
  const r = run(s);
  const main = r.filter((d) => !d.compare);
  const vs = r.filter((d) => d.compare);
  assert.equal(main.length, s.designs.length);
  assert.equal(vs.length, s.designs.length);
  vs.forEach((d, i) => {
    assert.equal(d.dash, COMPARE_DASH);
    assert.equal(d.color, main[i]!.color);
    assert.equal(d.design.id, main[i]!.design.id);
    assert.equal(d.label, `${d.design.name} · Other 12`);
    assert.equal(main[i]!.label, `${d.design.name} · ${DEFAULT_STATE.driverName.split(" ").find((w) => /\d/.test(w) && /[a-z]/i.test(w)) ?? DEFAULT_STATE.driverName}`);
  });
  // Different driver, different curves; the main runs are unchanged.
  assert.notDeepEqual(Array.from(vs[0]!.result.spl), Array.from(main[0]!.result.spl));
  run(DEFAULT_STATE).forEach((d, i) => assert.deepEqual(Array.from(d.result.spl), Array.from(main[i]!.result.spl)));
});

test("the comparison uses the main driver's count and wiring", () => {
  const two = { ...withCompare(), drivers: { ...withCompare().drivers, count: 2 } } as AppState;
  const one = run(withCompare()).find((d) => d.compare)!;
  const both = run(two).find((d) => d.compare)!;
  assert.notDeepEqual(Array.from(one.result.spl), Array.from(both.result.spl));
});

test("the comparison travels in long and short links", () => {
  for (const back of [roundTrip(withCompare()), shortTrip(withCompare())]) {
    assert.equal(back.compare!.driverName, "Other 12");
    assert.equal(back.compare!.ts.fs, 24);
    assert.equal(back.compare!.xmax_mm, 15);
  }
  assert.equal(roundTrip(DEFAULT_STATE).compare, null);
});

test("swap makes the comparison the main driver and back", () => {
  const s = swapCompare(withCompare());
  assert.equal(s.driverName, "Other 12");
  assert.equal(s.ts.fs, 24);
  assert.equal(s.compare!.driverName, DEFAULT_STATE.driverName);
  const back = swapCompare(s);
  assert.equal(back.driverName, DEFAULT_STATE.driverName);
  assert.deepEqual(back.ts, DEFAULT_STATE.ts);
  assert.equal(back.compare!.driverName, "Other 12");
});

test("old A–D links: B becomes the comparison, C and D go, box copies go, hand-moved boxes stay", () => {
  const old = JSON.parse(JSON.stringify(DEFAULT_STATE));
  delete old.compare;
  const vented = old.designs.find((d: { kind: string }) => d.kind === "vented");
  old.extraDrivers = [
    { id: "B", ...OTHER },
    { id: "C", ...OTHER, driverName: "Third" },
  ];
  // A copy of the vented box for B (same kind and name), and the PR box moved to C by hand.
  old.designs.push({ ...vented, id: "copy", driverId: "B" });
  old.designs = old.designs.map((d: { kind: string }) => (d.kind === "pr" ? { ...d, driverId: "C" } : d));
  const s = decodeState(encodeState(old))!;
  assert.equal(s.compare!.driverName, "Other 12");
  assert.equal(s.designs.length, DEFAULT_STATE.designs.length);
  assert.ok(s.designs.every((d) => !("driverId" in d)));
  assert.ok(s.designs.some((d) => d.kind === "pr"));
  assert.equal(s.designs.filter((d) => d.kind === "vented").length, 1);
});

test("presets size for the main driver only", () => {
  const a = sizeAllForDriver(DEFAULT_STATE).state.designs;
  const b = sizeAllForDriver(withCompare()).state.designs;
  assert.deepEqual(a, b);
});

test("presets no longer go in the name: old names like “Ported QB3” load as “Ported” with a QB3 tag", () => {
  const old = { ...DEFAULT_STATE, designs: DEFAULT_STATE.designs.map((d, i) => ({ ...d, name: ["Sealed Qtc 0.707", "Ported QB3", "My PR box"][i]! })) };
  const back = roundTrip(old as AppState);
  assert.deepEqual(back.designs.map((d) => [d.name, d.preset]), [["Sealed", "Qtc 0.707"], ["Ported", "QB3"], ["My PR box", undefined]]);
  const sized = sizeAllForDriver(DEFAULT_STATE).state.designs;
  assert.equal(sized.find((d) => d.kind === "vented")!.name, "Ported");
  assert.ok(["QB3", "B4", "Keele"].includes(sized.find((d) => d.kind === "vented")!.preset!));
});
