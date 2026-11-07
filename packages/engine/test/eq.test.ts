import { test } from "node:test";
import assert from "node:assert/strict";
import { abs } from "../src/complex.ts";
import { eqStageResponse } from "../src/filters.ts";
import { simulate } from "../src/simulate.ts";

const near = (a: number, b: number, tol: number, what = "") =>
  assert.ok(Math.abs(a - b) <= tol, `${what} ${a} vs ${b} (tol ${tol})`);
const db = (h: { re: number; im: number }) => 20 * Math.log10(abs(h));

test("peaking EQ: full gain at its frequency, flat far away", () => {
  for (const g of [-6, 3, 9]) {
    const st = { type: "peak" as const, freq: 40, gain_db: g, q: 2 };
    near(db(eqStageResponse(st, 40)), g, 1e-9, `gain ${g}`);
    near(db(eqStageResponse(st, 4)), 0, 0.05);
    near(db(eqStageResponse(st, 400)), 0, 0.05);
  }
});

test("low shelf: full gain at DC, flat at high frequency, half gain at the corner", () => {
  const st = { type: "lowshelf" as const, freq: 50, gain_db: 6, q: Math.SQRT1_2 };
  near(db(eqStageResponse(st, 0.5)), 6, 0.01, "DC");
  near(db(eqStageResponse(st, 5000)), 0, 0.01, "HF");
  near(db(eqStageResponse(st, 50)), 3, 1e-9, "corner");
});

test("high shelf: flat at DC, full gain at high frequency, half gain at the corner", () => {
  const st = { type: "highshelf" as const, freq: 150, gain_db: -6, q: Math.SQRT1_2 };
  near(db(eqStageResponse(st, 1)), 0, 0.01, "DC");
  near(db(eqStageResponse(st, 50000)), -6, 0.01, "HF");
  near(db(eqStageResponse(st, 150)), -3, 1e-9, "corner");
});

test("Linkwitz Transform turns a sealed box into the target 2nd-order response", () => {
  const driver = { fs: 30, qms: 5.2, qes: 0.4, vas_l: 50, re: 3.4, sd_cm2: 330 };
  const box = { kind: "sealed" as const, vb_l: 40, ql: Infinity, qa: Infinity };
  const plain = simulate(driver, box);
  const { fc, qtc } = plain.summary;
  const fp = 20;
  const qp = Math.SQRT1_2;
  const lt = simulate(driver, box, { eq: [{ type: "linkwitz", f0: fc!, q0: qtc!, fp, qp }] });
  for (let i = 0; i < lt.freq.length; i += 13) {
    const s = lt.freq[i]! / fp;
    // |s²/(s² + s/Q + 1)| at s = j·f/fp
    const expected = 20 * Math.log10((s * s) / Math.hypot(1 - s * s, s / qp));
    near(lt.spl[i]! - lt.summary.referenceSpl, expected, 0.001, `at ${lt.freq[i]!.toFixed(1)} Hz`);
  }
  // The boost costs excursion: well below fc the cone moves (fc/fp)² times as far.
  near(lt.excursionMm[0]! / plain.excursionMm[0]!, (fc! / fp) ** 2, 0.15 * (fc! / fp) ** 2, "excursion ratio at 10 Hz");
});

test("EQ boost lowers the thermal power limit", () => {
  const driver = { fs: 30, qms: 5.2, qes: 0.4, vas_l: 50, re: 3.4, sd_cm2: 330, pe_w: 200 };
  const box = { kind: "sealed" as const, vb_l: 40 };
  const r = simulate(driver, box, { eq: [{ type: "peak", freq: 100, gain_db: 6, q: 1 }], fMin: 100, fMax: 100, points: 1 });
  assert.equal(r.limitedBy[0], "thermal");
  near(r.maxPowerW[0]!, 200 / 10 ** (6 / 10), 1e-6, "thermal limit with +6 dB");
});
