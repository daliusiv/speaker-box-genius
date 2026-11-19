import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_STATE, decodeState, encodeState, type AppState } from "../src/state.ts";
import { runDesigns, solveDriver, prAreas } from "../src/sim.ts";
import { excursionChart, excursionFactor, excursionText, prChart, xviewUnit, type XView } from "../src/chartProps.ts";

/** Excursion units (Settings units, % of Xmax, air moved) and peak / peak-to-peak / RMS: display only. */

const at = (s: AppState["settings"]["excursion"], units: AppState["settings"]["units"] = "metric"): AppState => ({
  ...DEFAULT_STATE,
  power: 100,
  settings: { ...DEFAULT_STATE.settings, excursion: s, units },
});
const chartsFor = (state: AppState, view: XView) => {
  const designs = runDesigns(state, solveDriver(state));
  return { designs, cone: excursionChart({ state, designs }, view), pr: prChart({ state, designs }, view) };
};
const close = (a: number, b: number, tol = 1e-9) => assert.ok(Math.abs(a - b) <= tol * Math.max(1, Math.abs(b)), `${a} vs ${b}`);

test("Excursion setting: peak by default; old links open as peak; a changed one survives a link", () => {
  assert.equal(DEFAULT_STATE.settings.excursion, "peak");
  const { excursion: _drop, ...old } = DEFAULT_STATE.settings;
  assert.equal(decodeState(encodeState({ ...DEFAULT_STATE, settings: old as AppState["settings"] }))!.settings.excursion, "peak");
  for (const e of ["pp", "rms"] as const) assert.equal(decodeState(encodeState(at(e)))!.settings.excursion, e);
});

test("factors: peak 1, peak-to-peak 2, RMS 1/√2; text in the Settings units with its tag", () => {
  assert.equal(excursionFactor("peak"), 1);
  assert.equal(excursionFactor("pp"), 2);
  close(excursionFactor("rms"), 1 / Math.SQRT2);
  assert.equal(excursionText(12, at("peak")), "12 mm");
  assert.equal(excursionText(4.2, at("pp")), "8.4 mm p-p");
  assert.equal(excursionText(12, at("rms")), "8.5 mm RMS");
  assert.equal(excursionText(12.7, at("peak", "imperial")), "0.500 in");
  assert.equal(excursionText(null, at("peak")), "–");
  assert.equal(xviewUnit("x", "imperial"), "in");
  assert.equal(xviewUnit("vol", "imperial"), "in³");
  assert.equal(xviewUnit("pct", "metric"), "%");
});

test("the peak mm chart is unchanged; other settings scale curves and limits alike, judged on one-way peak", () => {
  const base = chartsFor(at("peak"), "x").cone;
  for (const e of ["pp", "rms"] as const) {
    const c = chartsFor(at(e), "x").cone;
    const k = excursionFactor(e);
    c.series.forEach((s, n) => {
      const b = base.series[n]!;
      if (!s.y || !b.y) return;
      s.y.forEach((v, i) => close(v, b.y![i]! * k));
      assert.deepEqual(Array.from(s.judge!), Array.from(b.y), "glow still judged on the one-way peak");
      assert.equal(s.over, b.over);
    });
    close(c.limits![0]!.value, base.limits![0]!.value * k);
    assert.match(c.limits![0]!.label, e === "rms" ? /Xmax 8\.5 mm RMS/ : /Xmax 24 mm p-p/);
    assert.match(c.title, e === "rms" ? /\(RMS\)/ : /\(peak-to-peak\)/);
  }
  assert.equal(base.title, "Cone excursion (peak, one way)");
});

test("inches follow Settings → Units", () => {
  const c = chartsFor(at("peak", "imperial"), "x").cone;
  const m = chartsFor(at("peak"), "x").cone;
  assert.equal(c.unit, "in");
  c.series[0]!.y!.forEach((v, i) => close(v, m.series[0]!.y![i]! / 25.4));
  close(c.limits![0]!.value, 12 / 25.4);
});

test("% of Xmax: 100 % is Xmax, deep bass 200 %, PR caution band at its share; ignores peak/RMS", () => {
  for (const e of ["peak", "rms"] as const) {
    const { cone, pr } = chartsFor(at(e), "pct");
    const m = chartsFor(at("peak"), "x").cone;
    assert.equal(cone.unit, "%");
    cone.series.forEach((s, n) => s.y && s.y.forEach((v, i) => close(v, (100 * m.series[n]!.y![i]!) / m.series[n]!.over!)));
    close(cone.limits![0]!.value, 100);
    if (cone.zones?.length) close(cone.zones[0]!.value, 200);
    close(pr.limits![0]!.value, 100);
    close(pr.bands![0]!.from, DEFAULT_STATE.settings.prCaution_pct);
  }
});

test("air moved: Sd × excursion, each PR group with its own Sd, in cm³ or in³", () => {
  const { designs, cone, pr } = chartsFor(at("peak"), "vol");
  const m = chartsFor(at("peak"), "x");
  const sd = DEFAULT_STATE.ts.sd_cm2!;
  cone.series[0]!.y!.forEach((v, i) => close(v, (sd * m.cone.series[0]!.y![i]!) / 10));
  close(cone.limits![0]!.value, (sd * 12) / 10);
  const prDesign = designs.find((d) => d.result.prGroups)!;
  const areas = prAreas(prDesign.design);
  pr.series[0]!.y!.forEach((v, i) => close(v, (areas[0]! * m.pr.series[0]!.y![i]!) / 10));
  const imp = chartsFor(at("rms", "imperial"), "vol").cone;
  assert.equal(imp.unit, "in³");
  imp.series[0]!.y!.forEach((v, i) => close(v, ((sd * m.cone.series[0]!.y![i]!) / 10 / 16.387064) * Math.SQRT1_2));
});

test("velocity, acceleration and force follow peak / peak-to-peak / RMS", () => {
  const p = chartsFor(at("peak"), "f").cone;
  const r = chartsFor(at("pp"), "f").cone;
  p.series[0]!.y!.forEach((v, i) => close(r.series[0]!.y![i]!, 2 * v));
  assert.match(r.title, /peak-to-peak/);
});
