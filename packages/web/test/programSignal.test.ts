import { test } from "node:test";
import assert from "node:assert/strict";
import { SINE_CREST_DB } from "@sbg/engine";
import { DEFAULT_STATE, decodeState, encodeState, type AppState } from "../src/state.ts";
import { runDesigns, solveDriver } from "../src/sim.ts";
import { designProgram, maxSplChart, type ChartInput } from "../src/chartProps.ts";
import { fmtHeadroom, headroomTone, presetOf, signalFrom, signalLabel, simStateOf, type ProgramSignal } from "../src/programSignal.ts";

const withSignal = (signal: Partial<ProgramSignal>, more: Partial<AppState["settings"]> = {}): AppState => ({
  ...DEFAULT_STATE,
  settings: { ...DEFAULT_STATE.settings, ...more, signal: { ...DEFAULT_STATE.settings.signal, ...signal } },
});

test("program signal in links: off by default and left out; a set signal round-trips", () => {
  assert.deepEqual(DEFAULT_STATE.settings.signal, { program: false, crest_dB: 6, target_dB: null });
  assert.ok(!encodeState(DEFAULT_STATE).includes("signal"));
  assert.deepEqual(decodeState(encodeState(DEFAULT_STATE))!.settings.signal, DEFAULT_STATE.settings.signal);
  const s = withSignal({ program: true, crest_dB: 9, target_dB: 105 });
  assert.deepEqual(decodeState(encodeState(s))!.settings.signal, { program: true, crest_dB: 9, target_dB: 105 });
});

test("program signal from a link or file: junk falls back to the defaults, numbers clamp", () => {
  for (const v of [undefined, null, 5, "x", {}]) assert.deepEqual(signalFrom(v), { program: false, crest_dB: 6, target_dB: null });
  assert.deepEqual(signalFrom({ program: "yes", crest_dB: 1, target_dB: 400 }), { program: false, crest_dB: SINE_CREST_DB, target_dB: 160 });
  assert.deepEqual(signalFrom({ program: true, crest_dB: 99, target_dB: 10 }), { program: true, crest_dB: 20, target_dB: 40 });
  assert.equal(signalFrom({ crest_dB: NaN }).crest_dB, 6);
});

test("presets and labels: Sine 3 · Pink noise 6 · Music 9 · Cinema 12, else Custom; off reads Sine", () => {
  assert.equal(presetOf(SINE_CREST_DB), "sine");
  assert.equal(presetOf(6), "pink");
  assert.equal(presetOf(9), "music");
  assert.equal(presetOf(12), "cinema");
  assert.equal(presetOf(7.5), "custom");
  assert.equal(signalLabel({ program: false, crest_dB: 9, target_dB: null }), "Sine");
  assert.equal(signalLabel({ program: true, crest_dB: 6, target_dB: null }), "Pink noise 6 dB");
  assert.equal(signalLabel({ program: true, crest_dB: 7.5, target_dB: null }), "Custom 7.5 dB");
});

test("headroom tones and text: plain ≥ 3 dB, amber 0–3, red < 0, a real minus and never −0.0", () => {
  assert.equal(headroomTone(3), "ok");
  assert.equal(headroomTone(2.99), "warn");
  assert.equal(headroomTone(0), "warn");
  assert.equal(headroomTone(-0.01), "over");
  assert.equal(fmtHeadroom(3.24), "+3.2 dB");
  assert.equal(fmtHeadroom(-3.04), "−3.0 dB");
  assert.equal(fmtHeadroom(-0.04), "+0.0 dB");
});

test("a change to the program signal alone keeps the state to simulate (no new run); anything else does not", () => {
  const a = DEFAULT_STATE;
  const b = { ...a, settings: { ...a.settings, signal: { program: true, crest_dB: 9, target_dB: 105 } } };
  assert.equal(simStateOf(a, b), a);
  const c = { ...b, settings: { ...b.settings, ampWatts: 300 } };
  assert.equal(simStateOf(b, c), c);
  const d = { ...b, power: 200 };
  assert.equal(simStateOf(b, d), d);
  assert.equal(simStateOf(null, b), b);
});

test("Max SPL with Program on a sine is the sine chart; on 9 dB the curve is the program envelope with its ribbons and headroom", () => {
  const off = withSignal({ program: false }, { ampVolts: 40, ampAmps: 10, ampWatts: 300 });
  const designs = runDesigns(off, solveDriver(off));
  assert.ok(designs.length >= 2);
  const sine = maxSplChart({ state: off, designs } as unknown as ChartInput, "spl");
  const onSine = maxSplChart({ state: withSignal({ program: true, crest_dB: SINE_CREST_DB }, off.settings), designs } as unknown as ChartInput, "spl");
  for (let k = 0; k < designs.length; k++) {
    const a = sine.series[k]!.y!, b = onSine.series[k]!.y!;
    for (let i = 0; i < a.length; i++) if (Number.isFinite(a[i]!)) assert.ok(Math.abs(a[i]! - b[i]!) < 1e-9);
  }
  const s9 = withSignal({ program: true, crest_dB: 9, target_dB: 105 }, off.settings);
  const c = maxSplChart({ state: s9, designs } as unknown as ChartInput, "spl");
  assert.match(c.title, /on program/);
  assert.deepEqual(c.summary?.headings, ["On peaks", "On average"]);
  assert.equal(c.limits?.[0]?.value, 105);
  assert.match(c.limits![0]!.label, /^Target 105 dB avg · 114 peak$/);
  for (const [k, d] of designs.entries()) {
    const p = designProgram(d, s9.settings.signal);
    const y = c.series[k]!.y!;
    for (let i = 0; i < y.length; i++) {
      // Never above the sine maximum; the average side alone holds it where it is.
      if (!Number.isFinite(y[i]!)) continue;
      assert.ok(y[i]! <= d.result.maxSpl[i]! + 1e-9);
      if (p.side[i] === "avg") assert.ok(Math.abs(y[i]! - d.result.ceilings.avgSpl[i]!) < 1e-9);
      else assert.ok(Math.abs(y[i]! - (d.result.ceilings.peakSpl[i]! - (9 - SINE_CREST_DB))) < 1e-9);
    }
    assert.deepEqual(c.ribbons![k]!.kinds, p.kind);
    assert.equal(c.series[k]!.summary!.length, 2);
    // Headroom band starts at the box's F3.
    assert.equal(p.band[0], d.result.summary.f3 ?? d.result.freq[0]);
  }
  // The ring marks the least headroom of all the boxes.
  const least = Math.min(...designs.map((d) => designProgram(d, s9.settings.signal).overall!.db));
  assert.ok(c.worst && c.worst.label.startsWith(fmtHeadroom(least)));
  // Amp volts at program max are below the sine's by the program's drop; the note gives peak volts.
  assert.match(c.series[0]!.notes![40]!, / V RMS, [\d.]+ V pk, /);
});

test("Max SPL with Program on but no target measures headroom against the drive curve, with no target line", () => {
  const s = withSignal({ program: true, crest_dB: 6, target_dB: null });
  const designs = runDesigns(s, solveDriver(s));
  const c = maxSplChart({ state: s, designs } as unknown as ChartInput, "spl");
  assert.equal(c.limits, undefined);
  assert.match(c.summary!.caption!, /^Headroom vs drive/);
});
