import { test } from "node:test";
import assert from "node:assert/strict";
import { ampWattsFrom, DEFAULT_STATE, decodeState, encodeState, type AppState } from "../src/state.ts";
import { runDesigns, simOptionsOf, solveDriver } from "../src/sim.ts";
import { maxSplChart, MAX_MODES, type ChartInput } from "../src/chartProps.ts";

const withAmp = (amp: Partial<Pick<AppState["settings"], "ampVolts" | "ampAmps" | "ampWatts">>): AppState => ({ ...DEFAULT_STATE, settings: { ...DEFAULT_STATE.settings, ...amp } });

test("amp watts in links: off by default and left out of the link; a set value round-trips", () => {
  assert.equal(DEFAULT_STATE.settings.ampWatts, 0);
  assert.ok(!encodeState(DEFAULT_STATE).includes("ampWatts") && decodeState(encodeState(DEFAULT_STATE))!.settings.ampWatts === 0);
  const s = withAmp({ ampWatts: 350 });
  assert.equal(decodeState(encodeState(s))!.settings.ampWatts, 350);
});

test("amp watts from a link or file: junk and ≤ 0 are no limit, the rest clamps to 0.1–10,000 W", () => {
  for (const v of [undefined, null, "300", NaN, -5, 0, Infinity]) assert.equal(ampWattsFrom(v), 0, String(v));
  assert.equal(ampWattsFrom(0.01), 0.1);
  assert.equal(ampWattsFrom(250), 250);
  assert.equal(ampWattsFrom(1e6), 10_000);
});

test("amp watts reach the engine only when set, beside the volts and amps", () => {
  assert.equal(simOptionsOf(DEFAULT_STATE).amp, null);
  assert.deepEqual(simOptionsOf(withAmp({ ampWatts: 300 })).amp, { watts: 300 });
  assert.deepEqual(simOptionsOf(withAmp({ ampVolts: 40, ampAmps: 10, ampWatts: 300 })).amp, { volts: 40, amps: 10, watts: 300 });
});

test("Max SPL chart: a Watts view of the amp power at max SPL, with the amp's rating as its limit line, and the tooltip names amp power", () => {
  assert.deepEqual([...MAX_MODES], ["spl", "volts", "amps", "watts"]);
  const s = withAmp({ ampWatts: 60 });
  const designs = runDesigns(s, solveDriver(s));
  const c = { state: s, designs } as unknown as ChartInput;
  const w = maxSplChart(c, "watts");
  assert.equal(w.unit, "W");
  assert.deepEqual(w.limits?.map((l) => l.value), [60]);
  const d = designs[0]!;
  assert.deepEqual(w.series[0]!.y, d.result.ampAtMax.watts);
  const spl = maxSplChart(c, "spl");
  const i = d.result.ampLimitBy.findIndex((k) => k === "watts");
  assert.ok(i >= 0, "60 W binds somewhere in the default project");
  assert.match(spl.series[0]!.notes![i]!, /^amp power · amp .* W$/);
});
