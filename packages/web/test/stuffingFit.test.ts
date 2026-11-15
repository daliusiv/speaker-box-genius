import { test } from "node:test";
import assert from "node:assert/strict";
import { simulate } from "@sbg/engine";
import { DEFAULT_STATE, type AppState, type DesignState } from "../src/state.ts";
import { driverInputOf, enclosureOf, simOptionsOf, solveDriver } from "../src/sim.ts";
import { FIT_TOLERANCE, fitStuffing, type StuffingFit } from "../src/stuffingFit.ts";
import type { StuffableKind } from "../src/stuffing.ts";

/** A "measurement": the app's own impedance for the box acting `gain` % bigger with Qa `qa`, with some ripple. */
function sweep(s: AppState, d: DesignState, gain: number, qa: number, ripple = 0, vasScale = 1) {
  const drv = driverInputOf(s, solveDriver(s));
  const r = simulate(
    { ...drv, vas_l: drv.vas_l * vasScale },
    enclosureOf(d, d.vb_l * (1 + gain / 100), { ...s.settings.losses, qa }),
    { ...simOptionsOf(s), fMin: 5, fMax: 2000, points: 400, highPass: null },
  );
  return { f: [...r.freq], v: [...r.impedanceOhm].map((z, i) => z * (1 + ripple * Math.sin(i * 1.7))) };
}

for (const kind of ["sealed", "vented", "pr"] as const) {
  test(`fit recovers the stuffing of a ${kind} box from its impedance`, () => {
    const s = DEFAULT_STATE;
    const d = s.designs.find((x) => x.kind === kind)! as DesignState & { kind: StuffableKind };
    const fit = fitStuffing(s, d, sweep(s, d, 23, 18));
    assert.equal(typeof fit, "object", String(fit));
    if (typeof fit === "string") return;
    assert.ok(Math.abs(fit.gain_pct - 23) < 1.5, `gain ${fit.gain_pct}`);
    assert.ok(Math.abs(fit.qa - 18) / 18 < 0.15, `qa ${fit.qa}`);
    assert.ok(fit.error_pct < 1, `error ${fit.error_pct}`);
    assert.deepEqual(fit.warnings, []);
  });
}

test("fit copes with a noisy sweep and flags a box that can't be explained by stuffing", () => {
  const s = DEFAULT_STATE;
  const d = s.designs[0]! as DesignState & { kind: StuffableKind };
  const noisy = fitStuffing(s, d, sweep(s, d, 15, 40, 0.03));
  assert.ok(typeof noisy === "object" && Math.abs(noisy.gain_pct - 15) < 3, JSON.stringify(noisy));
  // A box acting 80 % bigger: beyond physics, so the driver's numbers must be off.
  const odd = fitStuffing(s, d, sweep(s, d, 80, 40));
  assert.ok(typeof odd === "object" && odd.warnings.some((w) => /40%/.test(w)), JSON.stringify(odd));
});

test("fit explains what's missing", () => {
  const s = DEFAULT_STATE;
  const d = s.designs[0]! as DesignState & { kind: StuffableKind };
  const flat = { f: Array.from({ length: 50 }, (_, i) => 10 + i * 10), v: Array.from({ length: 50 }, () => 4) };
  assert.match(String(fitStuffing(s, d, flat)), /No impedance peak/);
  const noTs = { ...s, ts: { fs: 30 } } as AppState;
  assert.match(String(fitStuffing(noTs, d, sweep(s, d, 0, 100))), /driver's parameters/);
});

test("a free-air sweep of the driver is recognised instead of fitted", () => {
  const s = DEFAULT_STATE;
  const d = s.designs[0]! as DesignState & { kind: StuffableKind };
  // Free air: the same driver in a box so big it doesn't stiffen the cone (peak at Fs).
  const freeAir = sweep(s, { ...d, vb_l: 1e5 }, 0, 100);
  assert.match(String(fitStuffing(s, d, freeAir)), /free-air sweep/);
});

test("a fit that runs into its limits or matches badly isn't offered as usable", () => {
  const s = DEFAULT_STATE;
  const d = s.designs[0]! as DesignState & { kind: StuffableKind };
  const good = fitStuffing(s, d, sweep(s, d, 20, 30));
  assert.ok(typeof good === "object" && good.usable);
  const tooBig = fitStuffing(s, d, sweep(s, d, 80, 40));
  assert.ok(typeof tooBig === "object" && !tooBig.usable);
  const ripply = fitStuffing(s, d, sweep(s, d, 20, 30, 0.4));
  assert.ok(typeof ripply === "object" && !ripply.usable, JSON.stringify(ripply));
});

const fitted = (x: StuffingFit | string): StuffingFit => {
  assert.equal(typeof x, "object", String(x));
  return x as StuffingFit;
};
const inside = (v: number, [a, b]: [number, number]) => v >= a && v <= b;

for (const kind of ["sealed", "vented", "pr"] as const) {
  test(`fit range: a ${kind} box's true volume and Qa are inside it, wider for datasheet values`, () => {
    const s = DEFAULT_STATE;
    const d = s.designs.find((x) => x.kind === kind)! as DesignState & { kind: StuffableKind };
    const truth = d.vb_l * 1.23;
    const yours = fitted(fitStuffing(s, d, sweep(s, d, 23, 18)));
    assert.equal(yours.source, "yours");
    assert.deepEqual(yours.tolerance, FIT_TOLERANCE.yours);
    assert.ok(inside(truth, yours.acting_range_l) && inside(18, yours.qa_range), JSON.stringify(yours));
    assert.ok(!yours.ambiguous, JSON.stringify(yours));
    const half = (yours.acting_range_l[1] - yours.acting_range_l[0]) / 2 / yours.acting_l;
    assert.ok(half > 0.01 && half < 0.15, `half-width ${half}`);
    const sheet = fitted(fitStuffing(s, d, sweep(s, d, 23, 18), { source: "datasheet" }));
    assert.equal(sheet.gain_pct, yours.gain_pct, "the best fit doesn't depend on the tolerances");
    assert.ok(sheet.acting_range_l[0] < yours.acting_range_l[0] && sheet.acting_range_l[1] > yours.acting_range_l[1]);
    assert.ok(sheet.ambiguous, JSON.stringify(sheet));
  });
}

test("fit range: a sealed box's volume rests on Vas, and covers a driver whose Vas is 8 % off", () => {
  const s = DEFAULT_STATE;
  const d = s.designs.find((x) => x.kind === "sealed")! as DesignState & { kind: StuffableKind };
  const f = fitted(fitStuffing(s, d, sweep(s, d, 23, 18, 0, 1.08)));
  assert.equal(f.spread_by, "vas");
  assert.ok(inside(d.vb_l * 1.23, f.acting_range_l), JSON.stringify(f));
});

test("fit range: with no driver tolerance it's the fit's own flatness, wider for a noisy sweep", () => {
  const s = DEFAULT_STATE;
  const d = s.designs.find((x) => x.kind === "sealed")! as DesignState & { kind: StuffableKind };
  const none = { vas: 0, fs: 0, qes: 0, qms: 0 };
  const clean = fitted(fitStuffing(s, d, sweep(s, d, 23, 18), { tolerance: none }));
  assert.equal(clean.spread_by, "fit");
  assert.ok(clean.acting_range_l[1] - clean.acting_range_l[0] < 0.05 * clean.acting_l, JSON.stringify(clean));
  const noisy = fitted(fitStuffing(s, d, sweep(s, d, 23, 18, 0.1), { tolerance: none }));
  assert.ok(noisy.acting_range_l[1] - noisy.acting_range_l[0] > clean.acting_range_l[1] - clean.acting_range_l[0], JSON.stringify(noisy));
  assert.ok(inside(d.vb_l * 1.23, noisy.acting_range_l), JSON.stringify(noisy));
});

test("fit with its ranges stays quick (a PR box, the slowest)", () => {
  const s = DEFAULT_STATE;
  const d = s.designs.find((x) => x.kind === "pr")! as DesignState & { kind: StuffableKind };
  const m = sweep(s, d, 23, 18);
  const t = performance.now();
  fitted(fitStuffing(s, d, m));
  assert.ok(performance.now() - t < 1500, `${Math.round(performance.now() - t)} ms`);
});

test("fit range: with frequency-dependent damping, Qms's tolerance still counts (through Rms)", () => {
  const base = DEFAULT_STATE;
  const v = solveDriver(base).values;
  const rms = (2 * Math.PI * v.fs! * (v.mms_g! / 1000)) / v.qms!;
  const s: AppState = { ...base, fdd: { rms, ams_mm_per_n: 0.05 } };
  const d = s.designs.find((x) => x.kind === "sealed")! as DesignState & { kind: StuffableKind };
  const m = sweep(s, d, 23, 18);
  const none = fitted(fitStuffing(s, d, m, { tolerance: { vas: 0, fs: 0, qes: 0, qms: 0 } }));
  const qms = fitted(fitStuffing(s, d, m, { tolerance: { vas: 0, fs: 0, qes: 0, qms: 0.2 } }));
  assert.ok(qms.qa_range[1] - qms.qa_range[0] > none.qa_range[1] - none.qa_range[0], JSON.stringify([none.qa_range, qms.qa_range]));
});
