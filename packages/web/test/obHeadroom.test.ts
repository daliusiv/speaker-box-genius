import { test } from "node:test";
import assert from "node:assert/strict";
import { SINE_CREST_DB } from "@sbg/engine";
import { DEFAULT_STATE, newDesign, type AppState, type ObDesign } from "../src/state.ts";
import { runDesigns, solveDriver } from "../src/sim.ts";
import { designProgram, maxSplChart, type ChartInput } from "../src/chartProps.ts";

// Integration of open baffles (#268) with program-signal headroom (#269): it applies as for an
// infinite baffle. No port or PR, so peaks are held by cone Xmax or air, the average by Pe or amp power.
const ob = (frame: ObDesign["frame"], id: string): ObDesign => ({ ...(newDesign("ob", []) as ObDesign), id, name: `OB ${frame}`, on: true, frame });

const stateWith = (signal: Partial<AppState["settings"]["signal"]>): AppState => ({
  ...DEFAULT_STATE,
  designs: [ob("flat", "f"), ob("h", "h")],
  settings: { ...DEFAULT_STATE.settings, ampVolts: 40, ampAmps: 10, ampWatts: 300, signal: { ...DEFAULT_STATE.settings.signal, ...signal } },
});

test("open baffle headroom: on a sine (3.01 dB) min(average, peak) ceiling = max SPL, flat board and H-frame", () => {
  const s = stateWith({ program: true, crest_dB: SINE_CREST_DB });
  const designs = runDesigns(s, solveDriver(s));
  assert.deepEqual(designs.map((d) => d.design.kind), ["ob", "ob"]);
  for (const d of designs) {
    const { maxSpl, ceilings: c } = d.result;
    let n = 0;
    for (let i = 0; i < maxSpl.length; i++) {
      if (!Number.isFinite(maxSpl[i]!)) continue;
      assert.ok(Math.abs(Math.min(c.avgSpl[i]!, c.peakSpl[i]!) - maxSpl[i]!) < 1e-9, `${d.design.name} @ ${d.result.freq[i]} Hz`);
      n++;
    }
    assert.ok(n > 100, d.design.name);
    for (const k of c.peakKind) assert.ok(["xmax", "air", "amp", "none"].includes(k), `${d.design.name} peak held by ${k}`);
    for (const k of c.avgKind) assert.ok(["thermal", "amp", "none"].includes(k), `${d.design.name} average held by ${k}`);
    // The Max SPL chart on a sine is the plain sine chart.
    const chart = maxSplChart({ state: s, designs } as unknown as ChartInput, "spl");
    const y = chart.series[designs.indexOf(d)]!.y!;
    for (let i = 0; i < y.length; i++) if (Number.isFinite(y[i]!)) assert.ok(Math.abs(y[i]! - maxSpl[i]!) < 1e-9);
  }
});

test("open baffle headroom: the band starts at the open baffle's own F3, on any crest factor", () => {
  for (const crest_dB of [SINE_CREST_DB, 6, 12]) {
    const s = stateWith({ program: true, crest_dB, target_dB: 100 });
    const designs = runDesigns(s, solveDriver(s));
    for (const d of designs) {
      const f3 = d.f3Room !== undefined ? d.f3Room : d.result.summary.f3;
      assert.ok(f3 && f3 > 0, `${d.design.name}: F3 ${f3}`);
      const p = designProgram(d, s.settings.signal);
      assert.equal(p.band[0], f3, `${d.design.name}, crest ${crest_dB}`);
      assert.ok(p.overall && Number.isFinite(p.overall.db) && p.overall.f >= f3, d.design.name);
    }
  }
});
