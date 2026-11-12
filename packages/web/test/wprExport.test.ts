import { test } from "node:test";
import assert from "node:assert/strict";
import { parseWpr } from "@sbg/engine";
import { DEFAULT_STATE, type AppState, type DesignState } from "../src/state.ts";
import { runDesigns, solveDriver } from "../src/sim.ts";
import { wprFor } from "../src/wprExport.ts";

const byKind = (s: AppState, k: DesignState["kind"]) => s.designs.find((d) => d.kind === k)!;

test("the example's boxes export as WinISD projects that read back as the same boxes", () => {
  const s: AppState = { ...DEFAULT_STATE, power: 50 };
  const results = runDesigns(s, solveDriver(s));
  for (const kind of ["sealed", "vented", "pr"] as const) {
    const d = byKind(s, kind);
    const out = wprFor(s, d);
    assert.ok(typeof out !== "string", String(out));
    const p = parseWpr(out.text);
    assert.equal(p.box.type, kind === "vented" ? "vented" : kind === "pr" ? "passive-radiator" : "sealed");
    assert.ok(Math.abs(p.box.vb_l - d.vb_l) < 1e-6, `${kind} volume`);
    assert.equal(p.power, 50);
    assert.equal(p.driver.ts.fs, solveDriver(s).values.fs);
    const r = results.find((x) => x.design.id === d.id)!.result;
    if (kind === "vented") assert.ok(Math.abs(p.box.fb! - r.summary.fb!) < 0.05, `tuning ${p.box.fb} vs ${r.summary.fb}`);
  }
});

test("what WinISD can't hold is listed, and lines are refused", () => {
  const s: AppState = { ...DEFAULT_STATE, eq: [{ on: true, type: "peak", freq: 40, gain_db: 3, q: 1 } as never], baffle: { ...DEFAULT_STATE.baffle, on: true } };
  const out = wprFor(s, byKind(s, "vented"));
  assert.ok(typeof out !== "string");
  assert.ok(out.notes.some((n) => /EQ/.test(n)) && out.notes.some((n) => /baffle/.test(n)), out.notes.join("; "));
  const line = { ...byKind(s, "sealed"), kind: "line" } as unknown as DesignState;
  assert.equal(typeof wprFor(s, line), "string");
});

test("volts become WinISD's watts into Re, and custom air keeps its conditions", () => {
  const s: AppState = { ...DEFAULT_STATE, drive: "volts", volts: 2.83, settings: { ...DEFAULT_STATE.settings, air: "custom", airConditions: { temp_C: 5, humidity_pct: 40, pressure_hPa: 980 } } };
  const out = wprFor(s, byKind(s, "sealed"));
  assert.ok(typeof out !== "string");
  const re = solveDriver(s).values.re!;
  assert.ok(Math.abs(parseWpr(out.text).power - (2.83 * 2.83) / re) < 0.1);
  assert.match(out.text, /\r\nT=278\.15\r\n/);
  assert.match(out.text, /\r\np=98000\r\n/);
  assert.match(out.text, /\r\nphi=0\.4\r\n/);
});

test("WinISD gets the driver's full record and a plain Le, and no series 6th-order bandpass", async () => {
  const { newDesign } = await import("../src/state.ts");
  const s: AppState = { ...DEFAULT_STATE };
  const out = wprFor(s, byKind(s, "sealed"));
  assert.ok(typeof out !== "string");
  // Bl, Mms, Cms and Rms written (WinISD fills in its own otherwise), and no lossy-Le correction.
  for (const k of ["BL", "Mms", "Cms", "Rms"]) assert.ok(Number(out.text.match(new RegExp(`^${k}=(.*)$`, "m"))?.[1]) > 0, k);
  assert.match(out.text, /^KLe=0\r?$/m);
  const bp = newDesign("bandpass", s.designs) as Extract<DesignState, { kind: "bandpass" }>;
  assert.ok(typeof wprFor(s, { ...bp, order: "6p" }) !== "string");
  const series = wprFor(s, { ...bp, order: "6s" });
  assert.equal(typeof series, "string");
  assert.match(series as string, /ported into the front/);
});

test("a slot port goes to WinISD as its rectangular vent and comes back as a slot", async () => {
  const { applyWpr } = await import("../src/wprImport.ts");
  const v = byKind(DEFAULT_STATE, "vented");
  if (v.kind !== "vented") throw new Error("no vented example");
  const slotted: DesignState = { ...v, shape: "slot", slotWidth_cm: 30, slotHeight_cm: 5, length_cm: 40, count: 1 };
  const s: AppState = { ...DEFAULT_STATE, designs: [slotted] };
  const out = wprFor(s, slotted);
  assert.ok(typeof out !== "string", String(out));
  assert.ok(!out.notes.some((n) => /slot/.test(n)), out.notes.join("; "));
  assert.match(out.text, /\[VentRear\]\r\nNum=1\r\nShape=2\r\n/);
  assert.match(out.text, /dia1=0\.3\r\ndia2=0\.05\r\ncarea=0\.015\r\n/);
  const p = parseWpr(out.text);
  assert.deepEqual(p.port?.slot, { width_cm: 30, height_cm: 5 });
  const r = runDesigns(s, solveDriver(s))[0]!.result;
  assert.ok(Math.abs(p.box.fb! - r.summary.fb!) < 0.05, `tuning ${p.box.fb} vs ${r.summary.fb}`);
  const back = applyWpr({ ...DEFAULT_STATE, designs: [] }, p, "slot.wpr").state.designs.at(-1)!;
  assert.ok(back.kind === "vented" && back.shape === "slot" && back.slotWidth_cm === 30 && back.slotHeight_cm === 5 && back.length_cm === 40);
});

test("projects the app exported with slots, re-saved by WinISD 0.7.0.950, open as the same slots", async () => {
  // Exported by this PR, opened and saved by WinISD (11 Nov 2026): it keeps Shape=2, the sizes, the
  // count and Fb, and recomputes the length from Fb with its own air (+0.01 cm).
  const { applyWpr } = await import("../src/wprImport.ts");
  const { readFileSync } = await import("node:fs");
  const read = (f: string) => parseWpr(readFileSync(new URL(`../../engine/test/fixtures/winisd-resaved/${f}.wpr`, import.meta.url), "latin1"));
  const open = (f: string) => applyWpr({ ...DEFAULT_STATE, designs: [] }, read(f), `${f}.wpr`).state.designs.at(-1)!;
  for (const [f, w, h, n, len, fb] of [["slot-30x5", 30, 5, 1, 40, 38.5788], ["slot-2x25x4", 25, 4, 2, 50, 41.3164]] as const) {
    const p = read(f);
    assert.deepEqual(p.port?.slot, { width_cm: w, height_cm: h });
    assert.equal(p.port?.count, n);
    assert.ok(Math.abs(p.port!.length_cm - len) < 0.02, `${f} length ${p.port!.length_cm}`);
    assert.ok(Math.abs(p.box.fb! - fb) < 1e-3);
    const d = open(f);
    assert.ok(d.kind === "vented" && d.shape === "slot" && d.slotWidth_cm === w && d.slotHeight_cm === h && d.count === n, f);
  }
  const bp = read("bp-slot");
  assert.deepEqual(bp.bandpass?.front.port?.slot, { width_cm: 20, height_cm: 5 });
  const d = open("bp-slot");
  assert.ok(d.kind === "bandpass" && d.front.shape === "slot" && d.front.slotWidth_cm === 20 && d.front.slotHeight_cm === 5, JSON.stringify(d.kind === "bandpass" ? d.front : d));
});
