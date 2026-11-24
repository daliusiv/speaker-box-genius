import { test } from "node:test";
import assert from "node:assert/strict";
import { programEquilibrium, simulate } from "@sbg/engine";
import { DEFAULT_STATE, decodeState, encodeState, coilModeFrom, heatBandFrom, rthFrom, tmaxFrom, type AppState } from "../src/state.ts";
import { runDesigns, simOptionsOf, solveDriver, coilLabel, eta0Of } from "../src/sim.ts";
import { maxSplChart, designProgram } from "../src/chartProps.ts";
import { simStateOf } from "../src/programSignal.ts";

// Headroom step 5 (#167): voice-coil modes, the driver's thermal fields, the heated coil, coil limit labels.
const S = DEFAULT_STATE;
const withSettings = (more: Partial<AppState["settings"]>, top: Partial<AppState> = {}): AppState => ({ ...S, ...top, settings: { ...S.settings, ...more } });
const main = (s: AppState) => runDesigns(s, solveDriver(s)).filter((d) => !d.compare);

test("links: coil mode, air around it, heating band, R_th and max coil temp round-trip; defaults left out", () => {
  const enc = encodeState(S);
  for (const k of ["coilMode", "ambient_C", "heatBand", "rth_k_w", "tmax_C"]) assert.ok(!enc.includes(k), k);
  const s = withSettings({ coilMode: "heated", ambient_C: 40, heatBand: [25, 150], thermalLimit: "coil" }, { rth_k_w: 1.2, tmax_C: 180 });
  const back = decodeState(encodeState(s))!;
  assert.equal(back.settings.coilMode, "heated");
  assert.equal(back.settings.ambient_C, 40);
  assert.deepEqual(back.settings.heatBand, [25, 150]);
  assert.equal(back.settings.thermalLimit, "coil");
  assert.equal(back.rth_k_w, 1.2);
  assert.equal(back.tmax_C, 180);
});

test("links: a link from before coil modes with a hot coil opens Fixed; Cold with a remembered temperature stays Cold", () => {
  assert.equal(coilModeFrom(undefined, 90), "fixed");
  assert.equal(coilModeFrom(undefined, 20), "cold");
  assert.equal(coilModeFrom("heated", 90), "heated");
  const old = decodeState(encodeState(withSettings({ coilTemp_C: 90, coilMode: "fixed" })))!;
  assert.equal(old.settings.coilMode, "fixed");
  const cold = decodeState(encodeState(withSettings({ coilTemp_C: 90, coilMode: "cold" })))!;
  assert.equal(cold.settings.coilMode, "cold");
  assert.equal(cold.settings.coilTemp_C, 90);
});

test("links: junk clamps", () => {
  assert.equal(rthFrom(-1), 0);
  assert.equal(rthFrom(0.001), 0.05);
  assert.equal(rthFrom(99), 50);
  assert.equal(tmaxFrom(20), 100);
  assert.equal(tmaxFrom(999), 350);
  assert.equal(tmaxFrom("x"), 200);
  assert.deepEqual(heatBandFrom([300, 100]), [20, 200]);
  assert.deepEqual(heatBandFrom([1, 9999]), [5, 2000]);
  assert.deepEqual(heatBandFrom("x"), [20, 200]);
  const back = decodeState(encodeState(withSettings({ thermalLimit: "bogus" as never, coilMode: "bogus" as never })))!;
  assert.equal(back.settings.thermalLimit, "nominal");
  assert.equal(back.settings.coilMode, "cold");
});

test("options: only Fixed passes a coil temperature; the coil limit, its crest and the breakdown go to the engine", () => {
  assert.equal(simOptionsOf(withSettings({ coilMode: "cold", coilTemp_C: 90 })).coilTemp_C, undefined);
  assert.equal(simOptionsOf(withSettings({ coilMode: "fixed", coilTemp_C: 90 })).coilTemp_C, 90);
  assert.equal(simOptionsOf(withSettings({ coilMode: "heated", coilTemp_C: 90 })).coilTemp_C, undefined);
  const o = simOptionsOf(withSettings({ thermalLimit: "coil", signal: { program: true, crest_dB: 9, target_dB: null } }, { rth_k_w: 0.9, tmax_C: 180 }));
  assert.equal(o.thermalLimit, "coil");
  assert.equal(o.crest_dB, 9);
  assert.deepEqual(o.thermal, { rth: 0.9, tmax_C: 180, ambient_C: 20 });
  assert.equal(o.powerBreakdown, true);
  assert.equal(simOptionsOf(S, true).powerBreakdown, undefined);
  assert.equal(simOptionsOf(withSettings({ thermalLimit: "coil" })).crest_dB, undefined);
  assert.equal(simOptionsOf(withSettings({ thermalLimit: "real" })).thermalLimit, "real");
  assert.equal(simOptionsOf(S).thermalLimit, undefined);
});

test("heated coil: each box's coil settles on the drive's pink noise, and its curves are the box simulated at that temperature", () => {
  const s = withSettings({ coilMode: "heated" }, { power: 150 });
  const hot = main(s);
  assert.ok(hot.length >= 3);
  for (const d of hot) {
    const c = d.coil!;
    assert.ok(c.tempC > 30 && c.tempC < 200 && !c.runaway, `${d.label} ${c.tempC}`);
    assert.ok(c.compressionDb < 0 && c.reHot > c.re20);
    // Heated at T ≡ Fixed at T.
    const fixed = main(withSettings({ coilMode: "fixed", coilTemp_C: c.tempC }, { power: 150 })).find((x) => x.design.id === d.design.id)!;
    d.result.spl.forEach((v, i) => assert.ok(Math.abs(v - fixed.result.spl[i]!) < 1e-9));
    // And the temperature is where the hot run's own coil balances.
    const eq = programEquilibrium(d.result.coilParts!, d.result.freq, d.result.coilParts!.thermal!, s.settings.heatBand)!;
    assert.ok(Math.abs(eq.tempC - c.tempC) < 1e-6);
  }
  // More drive, hotter.
  const louder = main(withSettings({ coilMode: "heated" }, { power: 400 }));
  assert.ok(louder[0]!.coil!.tempC > hot[0]!.coil!.tempC);
  // A hot room starts hotter.
  assert.ok(main(withSettings({ coilMode: "heated", ambient_C: 40 }, { power: 150 }))[0]!.coil!.tempC > hot[0]!.coil!.tempC + 15);
});

test("heated coil with WinISD's watts: the drive's volts follow the hot Re, and the coil still balances", () => {
  const s = withSettings({ coilMode: "heated", driveModel: "winisd" }, { power: 150 });
  for (const d of main(s)) {
    const eq = programEquilibrium(d.result.coilParts!, d.result.freq, d.result.coilParts!.thermal!, s.settings.heatBand)!;
    assert.ok(Math.abs(eq.tempC - d.coil!.tempC) < 0.5, `${d.label}: ${eq.tempC} vs ${d.coil!.tempC}`);
  }
});

test("heated coil without Pe or R_th: stays cold; with R_th alone it heats", () => {
  const noPe = withSettings({ coilMode: "heated" }, { pe_w: 0, power: 150 });
  const cold = main(withSettings({}, { pe_w: 0, power: 150 }));
  main(noPe).forEach((d, k) => {
    assert.equal(d.coil, undefined);
    assert.deepEqual(d.result.spl, cold[k]!.result.spl);
  });
  assert.ok(main({ ...noPe, rth_k_w: 0.8 })[0]!.coil!.tempC > 30);
  assert.equal(coilLabel(noPe), ", coil heated by the drive");
  assert.equal(coilLabel(withSettings({ coilMode: "fixed", coilTemp_C: 90 })), ", voice coil at 90 °C");
  assert.equal(coilLabel(withSettings({ coilMode: "cold", coilTemp_C: 90 })), "");
});

test("coil limit: Max SPL names the coil, and a program re-simulates (its crest heats the coil) and draws the engine's curve", () => {
  const sine = withSettings({ thermalLimit: "coil" });
  const prog = withSettings({ thermalLimit: "coil", signal: { program: true, crest_dB: 9, target_dB: null } });
  assert.equal(simStateOf(sine, prog), prog);
  // Without the coil limit only the signal changed: no new run.
  const plain = withSettings({ signal: { program: true, crest_dB: 9, target_dB: null } });
  assert.equal(simStateOf(S, plain), S);
  const designs = runDesigns(prog, solveDriver(prog));
  const chart = maxSplChart({ state: prog, designs } as Parameters<typeof maxSplChart>[0], "spl");
  assert.equal(chart.ribbonKinds!.thermal!.label, "Coil temperature");
  for (const d of designs) {
    assert.ok(d.result.programSpl);
    assert.equal(designProgram(d, prog.settings.signal).spl, d.result.programSpl);
  }
  const at = chart.series[0]!.notes!.findIndex((n) => n.startsWith("coil at 200 °C"));
  assert.ok(at >= 0, "a coil-limited point says so");
  assert.equal(maxSplChart({ state: S, designs: runDesigns(S, solveDriver(S)) } as Parameters<typeof maxSplChart>[0], "spl").ribbonKinds!.thermal!.label, "Driver power (Pe)");
});

test("power breakdown reaches the app; η0 from the T/S values", () => {
  const d = main(S)[0]!;
  assert.ok(d.result.power && d.result.coilParts);
  const v = solveDriver(S).values;
  const e = eta0Of(v, 343.2)!;
  assert.ok(Math.abs(e - (4 * Math.PI ** 2 * v.fs! ** 3 * (v.vas_l! / 1000)) / (343.2 ** 3 * v.qes!)) < 1e-15);
  assert.equal(eta0Of({ fs: 30 }, 343.2), null);
  // The app's efficiency approaches η0 in the passband (half space, a sealed box, plain cone): same order.
  const i = d.result.freq.findIndex((f) => f >= 300);
  assert.ok(d.result.power!.efficiency[i]! / e > 0.5 && d.result.power!.efficiency[i]! / e < 2);
  void simulate;
});
