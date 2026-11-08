import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DEFAULT_END_CORRECTION, parseWpr, portLengthForFb, ventedFb, STANDARD_AIR } from "@sbg/engine";
import { DEFAULT_STATE, decodeState, encodeState, type AppState, type DesignState } from "../src/state.ts";
import { airOf, portOf, runDesigns, solveDriver, vbOf } from "../src/sim.ts";
import { retuned } from "../src/chartEdit.ts";
import { bestVentedPort } from "../src/presets.ts";
import { slotTuningRange } from "../src/ports.ts";
import { applyWpr } from "../src/wprImport.ts";
import { wprFor } from "../src/wprExport.ts";

type Vented = Extract<DesignState, { kind: "vented" }>;
const vented = (s: AppState) => s.designs.find((d) => d.kind === "vented") as Vented;
const withK = (k: number): AppState => ({ ...DEFAULT_STATE, settings: { ...DEFAULT_STATE.settings, endCorrection: k } });
const fbOf = (s: AppState) => runDesigns(s, solveDriver(s)).find((d) => d.design.kind === "vented")!.result.summary.fb!;

test("the end correction defaults to WinISD's 0.732, and saved values are checked", () => {
  assert.equal(DEFAULT_STATE.settings.endCorrection, DEFAULT_END_CORRECTION);
  const round = (k: unknown) => decodeState(encodeState({ ...DEFAULT_STATE, settings: { ...DEFAULT_STATE.settings, endCorrection: k as number } }))!.settings.endCorrection;
  assert.equal(round(1.2), 1.2);
  assert.equal(round(-1), DEFAULT_END_CORRECTION);
  assert.equal(round(99), DEFAULT_END_CORRECTION);
  // Projects saved before the setting existed.
  const old = JSON.parse(JSON.stringify(DEFAULT_STATE));
  delete old.settings.endCorrection;
  assert.equal(decodeState(encodeState(old))!.settings.endCorrection, DEFAULT_END_CORRECTION);
});

test("a bigger end correction tunes every port lower, and the length tools cut for it", () => {
  const s = withK(1.2);
  const v = vented(s);
  const vb = vbOf(s, v);
  const want = ventedFb(vb, portOf(v), v.count, 1.2, airOf(s));
  assert.ok(Math.abs(fbOf(s) - want) < 1e-9);
  assert.ok(fbOf(s) < fbOf(DEFAULT_STATE) - 0.3, "K 1.2 tunes lower than 0.732");
  // Dragging the tuning cuts the port for the K in use, and the simulation then lands on it.
  const r = retuned(s, v, 35) as Vented;
  assert.ok(Math.abs(fbOf({ ...s, designs: s.designs.map((d) => (d.id === v.id ? r : d)) }) - 35) < 0.06);
  // Size all boxes picks a port cut for the K in use.
  const best = bestVentedPort(s, v, vb, 35)!;
  const port = portOf({ ...v, ...best.fields } as Vented);
  assert.ok(Math.abs(ventedFb(vb, port, (best.fields.count ?? v.count) as number, 1.2, airOf(s)) - 35) < 0.1);
});

test("a slot's tuning range along the box walls (the round vs slot port guide's numbers)", () => {
  const slot = { shape: "slot" as const, diameter_cm: 10, slotWidth_cm: 25.5, slotHeight_cm: 3.18, length_cm: 41.9, count: 1, targetFb: 35, flare_cm: 0 };
  const r = slotTuningRange(slot, 40, DEFAULT_END_CORRECTION, STANDARD_AIR)!;
  assert.ok(Math.abs(r.fb - 35.0) < 0.05);
  assert.ok(Math.abs(r.low - 32.5) < 0.05, `low ${r.low}`);
  assert.ok(Math.abs(r.high - 34.4) < 0.05, `high ${r.high}`);
  assert.ok(Math.abs(r.trim_cm - 37.15) < 0.05, `trim ${r.trim_cm}`);
  // Round ports, and an end correction that already allows for the walls, get no range.
  assert.equal(slotTuningRange({ ...slot, shape: "round" }, 40, DEFAULT_END_CORRECTION, STANDARD_AIR), null);
  assert.equal(slotTuningRange(slot, 40, 1.2, STANDARD_AIR), null);
});

test("WinISD projects keep their end correction both ways", () => {
  const text = readFileSync(new URL("../../engine/test/fixtures/dsa215.wpr", import.meta.url), "utf8");
  assert.ok(/endcorrection=0\.732/.test(text));
  const custom = text.replace(/endcorrection=0\.732/g, "endcorrection=0.85");
  const p = parseWpr(custom);
  const { state, message } = applyWpr(DEFAULT_STATE, p, "dsa215.wpr");
  assert.equal(state.settings.endCorrection, 0.85);
  assert.match(message, /end correction set to the project's 0\.85/);
  // The imported box tunes with the project's K: lower than the same file at 0.732, which
  // tunes where WinISD says (the file's Fr was saved at 0.732).
  const fbIn = (st: AppState) => {
    const d = st.designs[st.designs.length - 1] as Vented;
    return { d, fb: runDesigns(st, solveDriver(st)).find((x) => x.design.id === d.id)!.result.summary.fb! };
  };
  const plain = fbIn(applyWpr(DEFAULT_STATE, parseWpr(text), "dsa215.wpr").state);
  assert.ok(Math.abs(plain.fb - p.box.fb!) < 0.1, `tuning ${plain.fb} vs WinISD's ${p.box.fb}`);
  const { d, fb } = fbIn(state);
  assert.ok(Math.abs(fb - ventedFb(vbOf(state, d), portOf(d), d.count, 0.85, airOf(state))) < 1e-9);
  assert.ok(fb < plain.fb - 0.1);
  // The default leaves the message alone, and an export writes the K in use.
  assert.doesNotMatch(applyWpr(DEFAULT_STATE, parseWpr(text), "dsa215.wpr").message, /end correction/);
  const out = wprFor(state, d);
  assert.ok(typeof out !== "string");
  assert.equal(parseWpr(out.text).port!.endCorrection, 0.85);
});

test("a port cut for a K tunes there in the simulation", () => {
  const s = withK(1.5);
  const v = vented(s);
  const vb = vbOf(s, v);
  const len = portLengthForFb(vb, portOf(v, 0), 30, v.count, 1.5, airOf(s));
  const t = { ...s, designs: s.designs.map((d) => (d.id === v.id ? { ...v, length_cm: len } : d)) };
  assert.ok(Math.abs(fbOf(t) - 30) < 1e-6);
});
