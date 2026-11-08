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
