import { test } from "node:test";
import assert from "node:assert/strict";
import { simulate, type DriverInput } from "@sbg/engine";
import { DEFAULT_STATE, decodeState, encodeState, newDesign, type AppState, type IbDesign, type SealedDesign } from "../src/state.ts";
import { enclosureOf, runDesigns, solveDriver } from "../src/sim.ts";
import { fromHornrespBox, toHornrespBox } from "../src/hornrespBox.ts";
import { wprExportable, wprFor } from "../src/wprExport.ts";
import { sizeAllForDriver } from "../src/presets.ts";
import { KIND_COLORS } from "../src/palette.ts";

// Infinite baffle box type: state, share links, the engine input, Hornresp and WinISD.

const designs = DEFAULT_STATE.designs;
const ib = (patch: Partial<IbDesign> = {}): IbDesign => ({ ...(newDesign("ib", designs) as IbDesign), ...patch });
const withDesigns = (...ds: AppState["designs"]): AppState => ({ ...DEFAULT_STATE, designs: ds });
const losses = DEFAULT_STATE.settings.losses;

test("a new infinite baffle starts open, teal, with a 10,000 L closed space kept for later", () => {
  const d = ib();
  assert.equal(d.kind, "ib");
  assert.equal(d.rear, "open");
  assert.equal(d.name, "Infinite baffle");
  assert.equal(d.vb_l, 10000);
  assert.equal(KIND_COLORS.ib[0], "#14b8a6");
});

test("engine input: open rear has no box; a closed space is the rear volume with the losses", () => {
  assert.deepEqual(enclosureOf(ib(), 10000, losses), { kind: "infinite-baffle" });
  assert.deepEqual(enclosureOf(ib({ rear: "space", vb_l: 1500 }), 1500, losses), { kind: "infinite-baffle", rear_l: 1500, ql: losses.ql, qa: losses.qa });
});

test("share links and projects keep both rear modes; a bad rear reads as open", () => {
  for (const d of [ib(), ib({ rear: "space", vb_l: 1500 })]) {
    const back = decodeState(encodeState(withDesigns(d)));
    assert.ok(back);
    const got = back.designs.find((x) => x.kind === "ib") as IbDesign;
    assert.equal(got.rear, d.rear);
    assert.equal(got.vb_l, d.vb_l);
  }
  const odd = { ...ib(), rear: "attic" } as unknown as IbDesign;
  const back = decodeState(encodeState(withDesigns(odd)));
  assert.equal((back!.designs.find((x) => x.kind === "ib") as IbDesign).rear, "open");
});

test("the app's open infinite baffle is the engine's (Fc = Fs, Qtc = Qts with Rg)", () => {
  const s = withDesigns(ib());
  const solved = solveDriver(s);
  const [r] = runDesigns(s, solved);
  assert.ok(r);
  const fs = solved.values.fs!;
  assert.ok(Math.abs(r.result.summary.fc! - fs) < 1e-9, `Fc ${r.result.summary.fc} vs Fs ${fs}`);
  assert.ok(r.result.spl.every(Number.isFinite));
  assert.ok(r.result.boxPressurePa!.every((p) => p === 0));
});

test("Size all leaves an infinite baffle alone, without a message", () => {
  const out = sizeAllForDriver(withDesigns(ib()));
  assert.deepEqual(out.changed, []);
  assert.deepEqual(out.skipped, []);
});

test("WinISD export leaves an infinite baffle out and says why", () => {
  assert.equal(wprExportable(ib()), false);
  const out = wprFor(withDesigns(ib()), ib());
  assert.equal(typeof out, "string");
  assert.match(out as string, /WinISD can't open an infinite baffle/);
  // The other messages are unchanged.
  const sealed = newDesign("sealed", designs) as SealedDesign;
  assert.equal(wprExportable(sealed), true);
});

const DRV: DriverInput = { fs: 22, qms: 4.31, qes: 0.6, vas_l: 248, re: 4.2, sd_cm2: 1159, le_mh: 1.5 };
const values = (text: string) => Object.fromEntries([...text.matchAll(/^([A-Za-z][\w' ]*?) = (.+)$/gm)].map((m) => [m[1]!, m[2]!.trim()]));

test("Hornresp: an open rear is a box record with no rear chamber, and reads back as an open infinite baffle", () => {
  const out = toHornrespBox(ib(), DRV, { vb_l: 10000, distance_cm: 0, eg: 2.83, drivers: 4, wiring: "parallel" });
  assert.ok(typeof out !== "string");
  const v = values(out.text);
  assert.equal(v["Vrc"], "0.00");
  assert.equal(v["Lrc"], "0.00");
  const back = fromHornrespBox(out.text, designs, "IB");
  assert.ok(back && typeof back !== "string");
  assert.equal(back.design.kind, "ib");
  assert.equal((back.design as IbDesign).rear, "open");
  assert.equal(back.drivers?.count, 4);
});

test("Hornresp: a closed space is the rear chamber (and reads back as a sealed box of that volume)", () => {
  const out = toHornrespBox(ib({ rear: "space", vb_l: 1500 }), DRV, { vb_l: 1500, distance_cm: 0, eg: 2.83, drivers: 1 });
  assert.ok(typeof out !== "string");
  assert.equal(values(out.text)["Vrc"], "1500.00");
  assert.ok(out.warnings.some((w) => /closed space behind the baffle/.test(w)));
  const back = fromHornrespBox(out.text, designs, "IB");
  assert.ok(back && typeof back !== "string");
  assert.equal(back.design.kind, "sealed");
  assert.equal(back.design.vb_l, 1500);
});

test("engine check: the open IB the app builds matches a sealed box of infinite volume", () => {
  const a = simulate(DRV, enclosureOf(ib(), 10000, losses));
  const b = simulate(DRV, { kind: "sealed", vb_l: Infinity });
  assert.deepEqual(Array.from(a.spl), Array.from(b.spl));
});
