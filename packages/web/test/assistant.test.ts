import { test } from "node:test";
import assert from "node:assert/strict";
import { TS_PARAMS, type TsParam, type TsValues } from "@sbg/engine";
import { loadDatabase } from "../../db-tools/src/load.ts";
import { DEFAULT_STATE } from "../src/state.ts";
import type { LoadedDriver } from "../src/library.ts";
import { PORT_LIMIT, limitsOf, portRoom_cm, runDesigns, solveDriver } from "../src/sim.ts";
import { evaluateDriver, goalFor, loadOptions, openResults, prefilter, rankResults, type AssistantGoal, type AssistantResult, type IndexRow } from "../src/assistant.ts";

// The database as the app loads it: index rows, and full records by id.
const db = loadDatabase();
const rows: IndexRow[] = db.drivers.map(({ id, data: d }) => ({
  id,
  brand: d.brand,
  model: d.model,
  type: d.type,
  ohms: d.nominal_ohms,
  coil_ohms: d.voice_coils === 2 ? (d.ts_wiring === "series" ? d.nominal_ohms / 2 : d.nominal_ohms * 2) : undefined,
  size_in: d.size_in,
  fs: d.ts.fs,
  qts: d.ts.qts ?? (d.ts.qms * d.ts.qes) / (d.ts.qms + d.ts.qes),
  vas_l: d.ts.vas_l,
  xmax_mm: d.ts.xmax_mm,
  pe_w: d.ts.pe_w,
  sd_cm2: d.ts.sd_cm2,
}));
const recs = new Map(db.drivers.map((e) => [e.id, e.data]));
function loaded(id: string): LoadedDriver {
  const rec = recs.get(id)!;
  const ts: TsValues = {};
  for (const k of Object.keys(TS_PARAMS) as TsParam[]) {
    const v = (rec.ts as unknown as Record<string, number | undefined>)[k];
    if (typeof v === "number") ts[k] = v;
  }
  return {
    name: `${rec.brand} ${rec.model}`,
    brand: rec.brand,
    nominal_ohms: rec.nominal_ohms,
    ts,
    le_mh: rec.ts.le_mh,
    xmax_mm: rec.ts.xmax_mm,
    pe_w: rec.ts.pe_w,
    dvcWiring: rec.voice_coils === 2 ? (rec.ts_wiring ?? "parallel") : undefined,
  };
}
function runAll(goal: AssistantGoal): { results: AssistantResult[]; tried: number; ms: number } {
  const t = performance.now();
  const cands = prefilter(rows, goal);
  const results = cands.flatMap((r) => evaluateDriver(DEFAULT_STATE, r, loaded(r.id), goal));
  return { results: rankResults(results, goal), tried: cands.length, ms: performance.now() - t };
}

test("loads: DVC coils and two drivers are wired for the amplifier's minimum load", () => {
  // Dual 4 Ω coils: parallel 2 Ω or series 8 Ω.
  assert.deepEqual(
    loadOptions({ ohms: 2, coil_ohms: 4 }, { drivers: 1, minLoad_ohm: 2 }).map((o) => [o.load, o.dvc]),
    [[2, "parallel"], [8, "series"]],
  );
  assert.deepEqual(loadOptions({ ohms: 4 }, { drivers: 2, minLoad_ohm: 4 }).map((o) => [o.load, o.wiring]), [[8, "series"]]);
  assert.equal(loadOptions({ ohms: 4 }, { drivers: 1, minLoad_ohm: 8 }).length, 0);
});

for (const use of ["car", "home", "hifi"] as const) {
  for (const priority of ["balanced", "deep", "loud", "small"] as const) {
    test(`${use} / ${priority}: results within the limits, ranked by the priority`, () => {
      const goal = goalFor(use, priority);
      const { results, tried, ms } = runAll(goal);
      assert.ok(tried > 10, `tried ${tried}`);
      assert.ok(results.length > 5, `${results.length} results`);
      for (const r of results) {
        assert.ok(r.vb_l <= goal.maxVolume_l + 0.05, `${r.name} ${r.vb_l} L`);
        assert.ok(r.load_ohm >= goal.minLoad_ohm, `${r.name} ${r.load_ohm} Ω`);
      }
      const top = results.slice(0, 10).filter((r) => r.over.length === 0);
      const f3 = (r: AssistantResult) => r.f3;
      if (priority === "deep") for (let i = 1; i < top.length; i++) assert.ok(f3(top[i - 1]!) <= f3(top[i]!));
      if (priority === "loud") for (let i = 1; i < 10; i++) assert.ok(results[i - 1]!.loud_db >= results[i]!.loud_db);
      if (priority === "small") for (const r of results) assert.ok(f3(r) <= goal.targetF3_hz + 0.5, `${r.name} ${r.box} F3 ${r.f3}`);
      console.log(`${use}/${priority}: ${tried} drivers, ${results.length} designs, ${Math.round(ms)} ms; top: ${results[0]!.name} ${results[0]!.box} ${results[0]!.vb_l} L F3 ${results[0]!.f3.toFixed(1)} ${results[0]!.loud_db} dB`);
    });
  }
}

test("opening results starts a project with that driver and its boxes, simulated as scored", () => {
  const goal = goalFor("car", "balanced");
  const all = runAll(goal).results;
  const r = all.find((x) => x.box === "vented")!;
  const both = all.filter((x) => x.driverId === r.driverId);
  assert.equal(both.length, 2);
  const s = openResults(DEFAULT_STATE, loaded(r.driverId), both, goal);
  assert.deepEqual(s.designs.map((d) => d.kind).sort(), ["sealed", "vented"]);
  assert.equal(s.power, goal.power_w);
  assert.equal(s.roomGain.mode, "car");
  for (const x of both) {
    const d = runDesigns(s, solveDriver(s)).find((y) => y.design.kind === x.box)!;
    assert.equal(d.vb_l, x.vb_l);
    assert.ok(Math.abs(d.result.summary.f3! - x.f3) < 1.5, `${x.box}: ${d.result.summary.f3} vs ${x.f3}`);
  }
});

test("what a result promises is what the app shows: same limits, and the port fits", () => {
  for (const use of ["hifi", "car"] as const) {
    const goal = goalFor(use, "balanced");
    for (const r of runAll(goal).results.slice(0, 25)) {
      const s = openResults(DEFAULT_STATE, loaded(r.driverId), [r], goal);
      const d = runDesigns(s, solveDriver(s))[0]!;
      // The app samples more finely: a peak right at a limit may land either side of it.
      const app = limitsOf(d.result, s.xmax_mm!, s.highPass.on ? 10 : 15);
      if (!r.over.includes("xmax")) assert.ok(app.x! <= s.xmax_mm! * 1.02, `${use}: ${r.name} ${r.box} ${app.x} mm`);
      if (!r.over.includes("port") && app.vp !== null) assert.ok(app.vp <= PORT_LIMIT * 1.02, `${use}: ${r.name} port ${app.vp} m/s`);
      if (r.port) {
        assert.ok(r.port.length_cm <= portRoom_cm(r.vb_l, r.port.diameter_cm), `${r.name}: port ${r.port.length_cm} cm`);
        assert.equal(s.highPass.freq, r.highPass_hz);
      }
    }
  }
});
