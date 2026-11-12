import { test } from "node:test";
import assert from "node:assert/strict";
import { simulate, type EqStage } from "@sbg/engine";
import { outputs, runMnaText } from "../../engine/validation/spice/run.ts";
import { DEFAULT_STATE, newDesign, type AppState, type DesignState } from "../src/state.ts";
import { builtVbOf, driverInputOf, enclosureOf, lossesFor, runDesigns, simOptionsOf, solveDriver } from "../src/sim.ts";
import { spiceFor } from "../src/spiceExport.ts";
import { stuffFactor } from "../src/stuffing.ts";

const LINK = "https://speakerboxgenius.com/#s=test";

/** The app's own result for a design at the given frequencies (as runDesigns builds it). */
function app(s: AppState, d: DesignState, frequencies: number[]) {
  const eq = s.eq.filter((e) => e.on && (e.target === "all" || e.target === d.id)).map(({ id: _i, on: _o, target: _t, ...st }) => st as EqStage);
  return simulate(driverInputOf(s, solveDriver(s)), enclosureOf(d, builtVbOf(s, d) * stuffFactor(d), lossesFor(s, d), s.volume.wall_mm), { ...simOptionsOf(s), eq, frequencies });
}

/** Every box design of a state, exported, solved by the test solver (mna.py), against the app. */
function check(s: AppState) {
  const designs = s.designs.filter((d) => d.on && d.kind !== "line");
  const outs = designs.map((d) => spiceFor(s, d, LINK, new Date("2026-11-10T12:00:00Z")));
  for (const o of outs) assert.ok(typeof o !== "string", String(o));
  const texts = outs.map((o) => (o as { text: string }).text);
  const raw = runMnaText(texts);
  designs.forEach((d, k) => {
    const t = texts[k]!;
    // Probes from the header's "What to plot" lines.
    const v = (label: string) => new RegExp(`${label}:\\s+V\\((\\w+)\\)`).exec(t)![1]!;
    const sp = outputs(raw[k]!, {
      phaseFlip: d.kind !== "bandpass",
      terminals: "spk",
      coilSense: "Vin",
      pressure: v("SPL at 1 m"),
      excursion: v("Cone excursion"),
      portSpeed: null,
      boxPressure: null,
      frontPressure: null,
      rearPortSpeed: null,
      prExcursion: [],
      cone: "Vcone1",
      port: null,
      leak: null,
      prs: [],
    });
    const eng = app(s, d, sp.freq);
    const dSpl = Math.max(...sp.spl.map((x, i) => Math.abs(x - eng.spl[i]!)));
    const dZ = Math.max(...sp.impedanceOhm.map((x, i) => Math.abs(x / eng.impedanceOhm[i]! - 1)));
    const dX = Math.max(...sp.excursionMm.map((x, i) => Math.abs(x / eng.excursionMm[i]! - 1)));
    assert.ok(dSpl < 1e-6 && dZ < 1e-7 && dX < 1e-6, `${d.name}: SPL ${dSpl} dB, |Z| ${dZ}, excursion ${dX}`);
  });
  // The app's chart starts at 10 Hz, as the netlist's sweep does: the same value there.
  const charts = runDesigns(s, solveDriver(s)).filter((r) => !r.compare && r.design.kind !== "line");
  charts.forEach((r, k) => {
    const sp = outputs(raw[k]!, { phaseFlip: true, terminals: "spk", coilSense: "Vin", pressure: "prs", excursion: "xn", portSpeed: null, boxPressure: null, frontPressure: null, rearPortSpeed: null, prExcursion: [], cone: "Vcone1", port: null, leak: null, prs: [] });
    assert.equal(r.result.freq[0], sp.freq[0]);
    assert.ok(Math.abs(r.result.spl[0]! - sp.spl[0]!) < 1e-6, r.label);
  });
  return texts;
}

test("SPICE export: the example's sealed, ported (flared port) and PR boxes match the app", () => {
  const texts = check({ ...DEFAULT_STATE, power: 50 });
  const t = texts[1]!;
  assert.match(t, /^\* Speaker Box Genius: /);
  assert.match(t, /Exported 2026-11-10 from speakerboxgenius\.com\. Open the design: https:\/\/speakerboxgenius\.com\/#s=test/);
  assert.match(t, /Port air speed:\s+V\(vn\)/);
  assert.match(t, /\.ac dec 100 10 1000\n\.end\n$/);
  assert.doesNotMatch(t, /Not in this netlist/);
  for (const line of t.split("\n")) if (/^L\S*\s/.test(line)) assert.match(line, / Rser=0$/);
});

test("SPICE export: filters, EQ, passive parts, two isobaric pairs in series and bandpass boxes match the app", () => {
  const base: AppState = { ...DEFAULT_STATE, power: 100 };
  const bp4 = newDesign("bandpass", base.designs);
  const bp6 = { ...newDesign("bandpass", [...base.designs, bp4]), order: "6s" as const };
  const s: AppState = {
    ...base,
    drivers: 2,
    wiring: "series",
    isobaric: true,
    isoCoils: "parallel",
    highPass: { on: true, type: "linkwitz-riley", order: 4, freq: 20 },
    eq: [
      { id: "e1", on: true, target: "all", type: "peak", freq: 40, gain_db: -3, q: 2 },
      { id: "e2", on: true, target: base.designs[0]!.id, type: "linkwitz", f0: 40, q0: 0.7, fp: 25, qp: 0.6 },
    ],
    passive: { on: true, branches: [{ r: 0.3 }, {}, {}, {}] },
    designs: [...base.designs, bp4, bp6],
  };
  const texts = check(s);
  assert.match(texts[0]!, /^E\d+ \S+ 0 \S+ 0 Laplace=/m);
  assert.match(texts[0]!, /ahead of the filters and EQ/);
  assert.match(texts[3]!, /Front chamber:\s+V\(/);
});

test("SPICE export: names what the netlist leaves out, and refuses lines", () => {
  const s: AppState = { ...DEFAULT_STATE, baffle: { ...DEFAULT_STATE.baffle, on: true }, settings: { ...DEFAULT_STATE.settings, coneLoad: "piston", leakage: "absorbed" } };
  const out = spiceFor(s, s.designs[0]!, LINK);
  assert.ok(typeof out !== "string");
  assert.deepEqual(out.notes.length, 3);
  assert.match(out.text, /Not in this netlist \(the app's curves include them\): the cone's piston air load.*leakage that's absorbed.*the baffle step\./);
  const line = newDesign("line", s.designs);
  assert.match(String(spiceFor(s, line, LINK)), /not transmission lines or horns/);
});
