import { test } from "node:test";
import assert from "node:assert/strict";
import {
  addDriver,
  compactState,
  DEFAULT_STATE,
  decodeState,
  encodeState,
  patchDriver,
  removeDriver,
  routeDriverEdit,
  viewFor,
  type AppState,
  type DesignState,
} from "../src/state.ts";
import { runDesigns, solveDriver } from "../src/sim.ts";
import { sizeAllForDriver } from "../src/presets.ts";

const roundTrip = (s: AppState) => decodeState(encodeState(s))!;
const shortTrip = (s: AppState) => decodeState(encodeState(compactState(s) as AppState))!;
const run = (s: AppState) => runDesigns(s, solveDriver(s));

/** Driver A as is, plus driver B: a different 12" driver. */
function twoDrivers(): AppState {
  const r = addDriver(DEFAULT_STATE)!;
  const s = patchDriver(r.state, r.id, { driverName: "Other 12", ts: { fs: 24, qms: 4, qes: 0.35, vas_l: 120, re: 3.2, sd_cm2: 480 }, xmax_mm: 15 });
  // The ported design uses B.
  return { ...s, designs: s.designs.map((d) => (d.kind === "vented" ? { ...d, driverId: "B" } : d)) };
}

test("old states and links (one driver) load as driver A, unchanged", () => {
  const old = JSON.parse(JSON.stringify(DEFAULT_STATE));
  delete old.extraDrivers;
  const s = decodeState(encodeState(old))!;
  assert.deepEqual(s.extraDrivers, []);
  assert.ok(s.designs.every((d) => d.driverId === undefined));
  // Same results as before.
  const a = run(DEFAULT_STATE);
  const b = run(s);
  assert.equal(a.length, b.length);
  a.forEach((x, i) => assert.deepEqual(Array.from(x.result.spl), Array.from(b[i]!.result.spl)));
});

test("a second driver travels in long and short links, with the designs that use it", () => {
  const s = twoDrivers();
  for (const back of [roundTrip(s), shortTrip(s)]) {
    assert.equal(back.extraDrivers.length, 1);
    assert.equal(back.extraDrivers[0]!.id, "B");
    assert.equal(back.extraDrivers[0]!.driverName, "Other 12");
    assert.equal(back.extraDrivers[0]!.ts.fs, 24);
    assert.equal(back.designs.find((d) => d.kind === "vented")!.driverId, "B");
    assert.equal(back.designs.find((d) => d.kind === "sealed")!.driverId, undefined);
  }
});

test("a design pointing at a driver that isn't there falls back to driver A", () => {
  const s = { ...DEFAULT_STATE, designs: DEFAULT_STATE.designs.map((d) => ({ ...d, driverId: "C" }) as DesignState) };
  assert.ok(roundTrip(s).designs.every((d) => d.driverId === undefined));
});

test("each design runs with its own driver", () => {
  const s = twoDrivers();
  const both = run(s);
  const vented = both.find((d) => d.design.kind === "vented")!;
  // The same ported design with driver A, and on its own with driver B.
  const withA = run({ ...s, designs: s.designs.map((d) => ({ ...d, driverId: undefined })) }).find((d) => d.design.kind === "vented")!;
  const asB = run(viewFor(s, "B")).find((d) => d.design.kind === "vented")!;
  assert.notDeepEqual(Array.from(vented.result.spl), Array.from(withA.result.spl));
  assert.deepEqual(Array.from(vented.result.spl), Array.from(asB.result.spl));
  // The sealed design still uses A.
  const sealed = both.find((d) => d.design.kind === "sealed")!;
  assert.deepEqual(Array.from(sealed.result.spl), Array.from(run(DEFAULT_STATE).find((d) => d.design.kind === "sealed")!.result.spl));
});

test("editing driver B leaves A alone; designs added there use B; A's box details stay", () => {
  const s = twoDrivers();
  const view = viewFor(s, "B");
  const edited = { ...view, xmax_mm: 20, volume: { ...view.volume, driverDisp_l: 9 }, designs: [...view.designs, { ...view.designs[0]!, id: "new1", name: "New" }] };
  const out = routeDriverEdit(s, "B", edited);
  assert.equal(out.extraDrivers[0]!.xmax_mm, 20);
  assert.equal(out.xmax_mm, DEFAULT_STATE.xmax_mm);
  assert.equal(out.driverName, DEFAULT_STATE.driverName);
  assert.equal(out.volume.driverDisp_l, s.volume.driverDisp_l);
  assert.equal(out.designs.find((d) => d.id === "new1")!.driverId, "B");
  // Editing A is a plain edit.
  const a = routeDriverEdit(s, "A", { ...s, xmax_mm: 3 });
  assert.equal(a.xmax_mm, 3);
  assert.equal(a.extraDrivers[0]!.xmax_mm, 15);
});

test("removing a driver moves its designs back to A; at most four drivers", () => {
  const s = removeDriver(twoDrivers(), "B");
  assert.equal(s.extraDrivers.length, 0);
  assert.ok(s.designs.every((d) => d.driverId === undefined));
  let t: AppState = DEFAULT_STATE;
  const ids: string[] = [];
  for (let i = 0; i < 4; i++) {
    const r = addDriver(t);
    if (!r) break;
    t = r.state;
    ids.push(r.id);
  }
  assert.deepEqual(ids, ["B", "C", "D"]);
});

test("Size all boxes sizes each design for its own driver", () => {
  const s = twoDrivers();
  const r = sizeAllForDriver(s);
  const vented = r.state.designs.find((d) => d.kind === "vented")!;
  const alone = sizeAllForDriver({ ...viewFor(s, "B"), extraDrivers: [], designs: s.designs.map((d) => ({ ...d, driverId: undefined })) });
  assert.equal(vented.vb_l, alone.state.designs.find((d) => d.kind === "vented")!.vb_l);
  const sealed = r.state.designs.find((d) => d.kind === "sealed")!;
  assert.equal(sealed.vb_l, sizeAllForDriver(DEFAULT_STATE).state.designs.find((d) => d.kind === "sealed")!.vb_l);
});
