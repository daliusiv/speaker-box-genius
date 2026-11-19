import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseOwpr, parseWpr } from "@sbg/engine";
import { applyHornresp, toHornrespBox } from "../src/hornrespBox.ts";
import { applyOwpr } from "../src/owprImport.ts";
import { applyWpr } from "../src/wprImport.ts";
import { driverInputOf, lossesFor, runDesigns, solveDriver } from "../src/sim.ts";
import { compactState, decodeState, DEFAULT_STATE, encodeState, NO_LOSS_Q, type AppState, type DesignState } from "../src/state.ts";
import { wprFor } from "../src/wprExport.ts";

const winisd = (f: string) => readFileSync(new URL(`../../engine/test/fixtures/${f}`, import.meta.url), "latin1");
const openisd = (f: string) => readFileSync(new URL(`../../engine/test/fixtures/openisd/${f}`, import.meta.url), "utf8");
const hornresp = (f: string) => readFileSync(new URL(`../../../docs/hornresp-validation/records/${f}`, import.meta.url), "utf8");
const byKind = (s: AppState, k: DesignState["kind"]) => s.designs.find((d) => d.kind === k)!;
/** The example with its ported box given a leak of its own. */
const withOwn = (ql: number): AppState => ({ ...DEFAULT_STATE, designs: DEFAULT_STATE.designs.map((d) => (d.kind === "vented" ? { ...d, ql } : d)) });

test("a box without its own Ql uses Settings'; with one, its own (Qa and Qp still Settings')", () => {
  const s = DEFAULT_STATE;
  assert.equal(lossesFor(s, byKind(s, "vented")), s.settings.losses);
  const own = withOwn(5);
  assert.deepEqual(lossesFor(own, byKind(own, "vented")), { ...s.settings.losses, ql: 5 });
  // The other boxes are untouched.
  assert.equal(lossesFor(own, byKind(own, "sealed")), own.settings.losses);
});

test("a box's own Ql changes only that box's simulation", () => {
  const base = runDesigns(DEFAULT_STATE, solveDriver(DEFAULT_STATE));
  const leaky = runDesigns(withOwn(3), solveDriver(DEFAULT_STATE));
  const peak = (r: typeof base, k: DesignState["kind"]) => Math.max(...r.find((x) => x.design.kind === k)!.result.impedanceOhm);
  assert.ok(peak(leaky, "vented") < peak(base, "vented") - 0.5, "a leakier box has lower impedance peaks");
  assert.equal(peak(leaky, "sealed"), peak(base, "sealed"));
  assert.equal(peak(leaky, "pr"), peak(base, "pr"));
});

test("share links and projects keep a box's own Ql, only when set, and only on sealed/ported/PR boxes", () => {
  assert.ok(!compactState(DEFAULT_STATE).designs.some((d: Record<string, unknown>) => "ql" in d), "absent stays absent");
  const own = withOwn(7);
  const back = decodeState(encodeState(own))!;
  assert.equal(byKind(back, "vented").ql, 7);
  assert.equal(byKind(back, "sealed").ql, undefined);
  // None (no leak) survives too.
  assert.equal(byKind(decodeState(encodeState(withOwn(NO_LOSS_Q)))!, "vented").ql, NO_LOSS_Q);
  // A line or bandpass can't carry one; nonsense is dropped.
  const odd: AppState = {
    ...DEFAULT_STATE,
    designs: [...DEFAULT_STATE.designs.map((d) => (d.kind === "sealed" ? ({ ...d, ql: -2 } as DesignState) : d)), { ...byKind(DEFAULT_STATE, "vented"), id: "x", kind: "bandpass", ql: 7 } as never],
  };
  const fixed = decodeState(encodeState(odd))!;
  assert.equal(byKind(fixed, "sealed").ql, undefined);
  assert.ok(fixed.designs.every((d) => d.kind !== "bandpass" || d.ql === undefined));
});

test("WinISD export writes the box's own Ql", () => {
  const s = withOwn(6);
  const out = wprFor(s, byKind(s, "vented"));
  assert.ok(typeof out !== "string");
  assert.equal(parseWpr(out.text).box.ql, 6);
});

test("a WinISD project's leakage goes on its box; Settings' Ql stays", () => {
  const p = parseWpr(winisd("dsa215.wpr"));
  // Settings at 7: the project's 10 becomes the box's own.
  const s0: AppState = { ...DEFAULT_STATE, settings: { ...DEFAULT_STATE.settings, losses: { ...DEFAULT_STATE.settings.losses, ql: 7 } } };
  const r = applyWpr(s0, { ...p, box: { ...p.box, ql: 10 } }, "dsa215.wpr");
  assert.equal(r.state.settings.losses.ql, 7);
  assert.equal(r.state.designs.at(-1)!.ql, 10);
  assert.match(r.message, /keeps the project's leakage as its own \(Ql 10\)/);
  // The same Ql as Settings: nothing to keep.
  const same = applyWpr(DEFAULT_STATE, { ...p, box: { ...p.box, ql: 10 } }, "dsa215.wpr");
  assert.equal(same.state.designs.at(-1)!.ql, undefined);
  // Its Qa and Qp still go into Settings.
  const qa = applyWpr(s0, { ...p, box: { ...p.box, ql: 4, qa: 50, qp: 60 } }, "dsa215.wpr");
  assert.deepEqual(qa.state.settings.losses, { ql: 7, qa: 50, qp: 60 });
  assert.equal(qa.state.designs.at(-1)!.ql, 4);
});

test("an OpenISD project's leakage goes on its box; Settings' Ql stays", () => {
  const p = parseOwpr(openisd("w5-sealed.owpr"));
  const s0: AppState = { ...DEFAULT_STATE, settings: { ...DEFAULT_STATE.settings, losses: { ...DEFAULT_STATE.settings.losses, ql: 7 } } };
  const r = applyOwpr(s0, p, "w5-sealed.owpr");
  const box = r.state.designs.at(-1)!;
  assert.equal(r.state.settings.losses.ql, 7);
  assert.equal(box.kind, "sealed");
  assert.equal(box.ql, 10, "the project's Ql 10 differs from Settings' 7");
  assert.equal(applyOwpr(DEFAULT_STATE, p, "w5-sealed.owpr").state.designs.at(-1)!.ql, undefined, "the same as Settings: nothing kept");
});

test("a Hornresp box opens with no leak of its own; the export's note follows", () => {
  const r = applyHornresp(DEFAULT_STATE, hornresp("B2-ported.txt"), "B2-ported.txt");
  assert.ok(typeof r !== "string");
  const box = r.state.designs.at(-1)!;
  assert.equal(box.ql, NO_LOSS_Q);
  assert.equal(r.state.settings.losses.ql, DEFAULT_STATE.settings.losses.ql);
  assert.match(r.message, /Ql set to none on this box/);
  assert.ok(box.kind === "vented");
  const driver = driverInputOf(r.state, solveDriver(r.state));
  const out = toHornrespBox(box, driver, { vb_l: box.vb_l, distance_cm: 0, eg: 2.83, drivers: 1 });
  assert.ok(typeof out !== "string");
  assert.ok(out.warnings.some((w) => /no absorption or port loss/.test(w)));
  assert.ok(!out.warnings.some((w) => /leakage or absorption/.test(w)));
  // A box that still leaks gets the full note.
  const leaky = toHornrespBox({ ...box, ql: 10 }, driver, { vb_l: box.vb_l, distance_cm: 0, eg: 2.83, drivers: 1 });
  assert.ok(typeof leaky !== "string" && leaky.warnings.some((w) => /this box's Leakage/.test(w)));
});
