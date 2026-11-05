import { test } from "node:test";
import assert from "node:assert/strict";
import { simulate } from "@sbg/engine";
import { DEFAULT_STATE, type AppState, type DesignState } from "../src/state.ts";
import { driverInputOf, enclosureOf, simOptionsOf, solveDriver } from "../src/sim.ts";
import { fitStuffing } from "../src/stuffingFit.ts";
import type { StuffableKind } from "../src/stuffing.ts";

/** A "measurement": the app's own impedance for the box acting `gain` % bigger with Qa `qa`, with some ripple. */
function sweep(s: AppState, d: DesignState, gain: number, qa: number, ripple = 0) {
  const r = simulate(
    driverInputOf(s, solveDriver(s)),
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
