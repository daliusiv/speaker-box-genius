import { test } from "node:test";
import assert from "node:assert/strict";
import { TS_PARAMS, type TsParam, type TsValues } from "@sbg/engine";
import { loadDatabase } from "../../db-tools/src/load.ts";
import { DEFAULT_STATE } from "../src/state.ts";
import type { LoadedDriver } from "../src/library.ts";
import { PORT_LIMIT, limitsOf, portLimitOf, portRoom_cm, runDesigns, solveDriver } from "../src/sim.ts";
import { GD_CYCLES, LINE_MAX_CM, LINE_MIN_AREA, bandpassShortlist, evaluateDriver, goalFor, lineShortlist, portCandidates, loadOptions, openResults, prefilter, rankResults, type AssistantGoal, type AssistantResult, type IndexRow } from "../src/assistant.ts";

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
      if (priority === "loud") for (let i = 1; i < top.length; i++) assert.ok(top[i - 1]!.loud_db >= top[i]!.loud_db);
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

test("what a result promises is what the app shows: same grade, and the port fits", () => {
  for (const use of ["hifi", "car"] as const) {
    const goal = goalFor(use, "balanced");
    const results = runAll(goal).results;
    for (const r of results.slice(0, 25)) {
      const s = openResults(DEFAULT_STATE, loaded(r.driverId), [r], goal);
      assert.equal(s.highPass.on, false);
      const d = runDesigns(s, solveDriver(s))[0]!;
      // The app samples more finely: a peak right at a limit may land either side of it.
      const app = limitsOf(d.result, s.xmax_mm!, false);
      if (!r.over.includes("xmax")) assert.ok(app.x! <= s.xmax_mm! * 1.02, `${use}: ${r.name} ${r.box} ${app.x} mm`);
      if (!r.over.includes("port") && app.vp !== null) assert.ok(app.vp <= PORT_LIMIT * 1.02, `${use}: ${r.name} port ${app.vp} m/s`);
      assert.equal(!!app.deep, !!r.deep, `${use}: ${r.name} ${r.box} deep bass`);
      if (r.port) assert.ok(r.port.length_cm <= portRoom_cm(r.vb_l, r.port.kind === "slot" ? r.port.slotHeight_cm : r.port.diameter_cm), `${r.name}: port ${r.port.length_cm} cm`);
    }
    // Graded, not hidden: within limits first, and deep-bass results carry their safe power.
    const firstOver = results.findIndex((r) => r.over.length > 0);
    if (firstOver >= 0) assert.ok(results.slice(firstOver).every((r) => r.over.length > 0), `${use}: a result within limits after one over`);
    for (const r of results) if (r.deep) assert.ok(r.deep.safe_w < goal.power_w && r.deep.below_hz > 20);
  }
});

test("ports: flared and slot ports when a plain tube can't fit or would chuff, and they open as built", () => {
  // 20 L at 45 Hz: a plain tube that fits is narrow; a slot along a wall and a flared tube are offered too.
  const c = portCandidates(20, 45, { rho: 1.204, c: 343.2 });
  assert.deepEqual(c.map((p) => p.kind), ["straight", "flared", "slot"]);
  for (const p of c) {
    const clear = p.kind === "slot" ? p.slotHeight_cm : p.diameter_cm;
    assert.ok(p.length_cm <= portRoom_cm(20, clear), `${p.kind} ${p.length_cm} cm`);
  }
  const goal = goalFor("hifi", "balanced");
  const results = runAll(goal).results;
  const kinds = new Set(results.filter((r) => r.port).map((r) => r.port!.kind));
  assert.ok(kinds.has("flared") || kinds.has("slot"), [...kinds].join());
  // Every ported result within the port-speed line used the simplest port that does it.
  const flaredOrSlot = results.find((r) => r.port && r.port.kind !== "straight" && !r.over.includes("port"))!;
  assert.ok(flaredOrSlot, "a flared or slot port within the chuffing line");
  const s = openResults(DEFAULT_STATE, loaded(flaredOrSlot.driverId), [flaredOrSlot], goal);
  const v = s.designs[0] as import("../src/state.ts").VentedDesign;
  assert.equal(v.shape, flaredOrSlot.port!.kind === "slot" ? "slot" : "round");
  assert.ok(Math.abs(runDesigns(s, solveDriver(s))[0]!.result.summary.fb! - flaredOrSlot.fb!) < 1, "opens at the tuning scored");
});

test("transmission lines: for towers, sized to the box limit, foldable, and they open as scored", () => {
  const goal = goalFor("tower", "balanced");
  assert.ok(goal.boxes.includes("line"));
  const boxes = runAll(goal).results;
  const cands = prefilter(rows, goal);
  const short = lineShortlist(boxes, cands, 6);
  assert.ok(short.length === 6 && short.every((r) => r.qts! >= 0.25 && r.qts! <= 0.55));
  // Half from the boxes' ranking, half by suiting a line (the lowest Fs) even if they ranked low.
  const lowFs = cands.filter((r) => r.qts! >= 0.25 && r.qts! <= 0.55).sort((a, b) => a.fs! - b.fs!)[0]!;
  assert.ok(short.includes(lowFs), "the lowest-Fs line candidate is tried");
  const lines = short.flatMap((r) => evaluateDriver(DEFAULT_STATE, r, loaded(r.id), goal, "lines"));
  assert.ok(lines.length >= 3, `${lines.length} lines`);
  for (const r of lines) {
    assert.equal(r.box, "line");
    assert.ok(r.vb_l <= goal.maxVolume_l * 1.02, `${r.name} ${r.line!.label} ${r.vb_l} L`);
    assert.ok(r.line!.length_cm <= LINE_MAX_CM, `${r.name} ${r.line!.length_cm} cm`);
    const des = r.line!.design;
    const areas = [des.closedArea_cm2, ...des.sections.map((x) => x.endArea_cm2)];
    const sd = rows.find((x) => x.id === r.driverId)!.sd_cm2!;
    assert.ok(areas.reduce((a, b) => a + b, 0) / areas.length >= LINE_MIN_AREA * sd * 0.99, `${r.name} ${r.line!.label} too thin`);
    const s = openResults(DEFAULT_STATE, loaded(r.driverId), [r], goal);
    assert.equal(s.designs[0]!.kind, "line");
    const d = runDesigns(s, solveDriver(s))[0]!;
    assert.ok(Math.abs(d.result.summary.f3! - r.f3) < 0.05 * r.f3, `${r.name} F3 ${d.result.summary.f3} vs ${r.f3}`);
    const app = limitsOf(d.result, s.xmax_mm!, false);
    if (!r.over.includes("xmax")) assert.ok(app.x! <= s.xmax_mm! * 1.02, `${r.name} line ${app.x} mm`);
  }
  // Ranked with the boxes, by the same rules.
  const all = rankResults([...boxes, ...lines], goal);
  const firstOver = all.findIndex((r) => r.over.length > 0);
  if (firstOver >= 0) assert.ok(all.slice(firstOver).every((r) => r.over.length > 0));
  // Not offered for a car (no room to fold one), even if asked for.
  const car = { ...goalFor("car", "balanced"), boxes: ["sealed", "vented", "line"] as AssistantGoal["boxes"] };
  assert.deepEqual(evaluateDriver(DEFAULT_STATE, short[0]!, loaded(short[0]!.id), car, "lines"), []);
});

test("bandpass: 4th and 6th order for subwoofers, within the box limit, a band up to 80 Hz, and they open as scored", () => {
  for (const use of ["home", "car"] as const) {
    const goal = { ...goalFor(use, "balanced"), boxes: ["sealed", "vented", "bandpass"] as AssistantGoal["boxes"] };
    const boxes = runAll(goal).results;
    const short = bandpassShortlist(boxes, prefilter(rows, goal), 12);
    const bps = short.flatMap((r) => evaluateDriver(DEFAULT_STATE, r, loaded(r.id), goal, "bandpass"));
    assert.ok(bps.some((r) => r.bandpass!.order === "4") && bps.some((r) => r.bandpass!.order === "6p"), `${use}: both orders`);
    for (const r of bps) {
      const b = r.bandpass!;
      assert.ok(b.rear_l + b.front_l <= goal.maxVolume_l * 1.02 && Math.abs(r.vb_l - (b.rear_l + b.front_l)) < 0.2, `${r.name} ${r.vb_l} L`);
      assert.ok(b.f3High >= 80 && r.f3 <= 1.6 * goal.targetF3_hz, `${r.name} band ${r.f3}–${b.f3High}`);
      assert.ok(r.peak_db <= 3.05, `${r.name} ripple ${r.peak_db}`);
      const fits = (p: typeof b.frontPort, vol: number) => p.length_cm <= portRoom_cm(vol, p.kind === "slot" ? p.slotHeight_cm : p.diameter_cm);
      assert.ok(fits(b.frontPort, b.front_l) && (!b.rearPort || fits(b.rearPort, b.rear_l)), `${r.name} ports fit`);
      const s = openResults(DEFAULT_STATE, loaded(r.driverId), [r], goal);
      const des = s.designs[0] as import("../src/state.ts").BandpassDesign;
      assert.equal(des.kind, "bandpass");
      assert.equal(des.order, b.order);
      const res = runDesigns(s, solveDriver(s))[0]!.result;
      assert.ok(Math.abs(res.summary.f3! - r.f3) < 0.05 * r.f3, `${r.name} F3 ${res.summary.f3} vs ${r.f3}`);
      assert.ok(Math.abs(res.summary.fb! - b.frontFb) < 0.1 * b.frontFb, `${r.name} front Fb ${res.summary.fb} vs ${b.frontFb}`);
      const app = limitsOf(res, s.xmax_mm!, false);
      if (!r.over.includes("port") && app.vp !== null) assert.ok(app.vp <= PORT_LIMIT * 1.02, `${r.name} port ${app.vp}`);
    }
  }
  // Not offered for a speaker: a bandpass box lets nothing out above its band.
  const hifi = { ...goalFor("hifi", "balanced"), boxes: ["bandpass"] as AssistantGoal["boxes"] };
  const row = rows.find((r) => r.size_in === 8 && r.qts! < 0.5)!;
  assert.deepEqual(evaluateDriver(DEFAULT_STATE, row, loaded(row.id), hifi, "bandpass"), []);
});

test("the chuffing line is the app's setting: raised, more ports pass, and the app agrees", () => {
  const goal = goalFor("car", "balanced");
  const loose = { ...DEFAULT_STATE, settings: { ...DEFAULT_STATE.settings, portLimit_ms: 30 } };
  const vented = (base: typeof DEFAULT_STATE) =>
    prefilter(rows, goal)
      .slice(0, 80)
      .flatMap((r) => evaluateDriver(base, r, loaded(r.id), goal))
      .filter((r) => r.box === "vented");
  const strict = vented(DEFAULT_STATE).filter((r) => r.over.includes("port")).length;
  const relaxed = vented(loose);
  assert.ok(relaxed.filter((r) => r.over.includes("port")).length < strict, "fewer over the port line at 30 m/s");
  for (const r of relaxed.filter((x) => !x.over.includes("port")).slice(0, 10)) {
    const s = openResults(loose, loaded(r.driverId), [r], goal);
    const app = limitsOf(runDesigns(s, solveDriver(s))[0]!.result, s.xmax_mm!, false, portLimitOf(s));
    assert.ok(!app.over.includes("port") || app.vp! <= 30 * 1.02, `${r.name}: app ${app.vp} m/s`);
  }
});

test("slow bass is noted: group delay over a cycle of the note, in the band", () => {
  const goal = goalFor("tower", "balanced");
  const results = runAll(goal).results;
  for (const r of results.filter((x) => x.gd)) {
    assert.ok(r.gd!.cycles > GD_CYCLES && r.gd!.hz >= 0.8 * r.f3, `${r.name} ${JSON.stringify(r.gd)}`);
    assert.ok(Math.abs((r.gd!.ms / 1000) * r.gd!.hz - r.gd!.cycles) < 0.05);
  }
});
