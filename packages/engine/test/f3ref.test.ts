import { test } from "node:test";
import assert from "node:assert/strict";
import { simulate } from "../src/simulate.ts";
import type { LineInput } from "../src/line.ts";

const DRV = { fs: 30, qms: 5, qes: 0.45, vas_l: 50, re: 6, sd_cm2: 500 };
const OPT = { fMin: 5, fMax: 500, points: 2000, convention: "volts" as const, power: 2.83, rg: 0, endCorrection: 0.85 };
const PK = { ...OPT, f3From: "peak" as const };
const INF = { ql: Infinity, qa: Infinity, qp: Infinity };
const port = (l: number) => ({ shape: "round" as const, diameter_cm: 7, length_cm: l });
const near = (a: number | null, b: number, tol: number, what: string) =>
  assert.ok(a !== null && Math.abs(a - b) <= tol, `${what}: ${a} vs ${b} (tol ${tol})`);

const CASES = [
  { name: "sealed lossless", box: { kind: "sealed", vb_l: 20, ...INF }, o: {}, exp: [52.6, 41.2, 31.7], tol: [0.3, 0.3, 0.3] },
  { name: "sealed lossy absorbed", box: { kind: "sealed", vb_l: 20.3, ql: 7, qa: 100 }, o: { leakage: "absorbed" }, exp: [56.6, 43.6, 33.6], tol: [0.5, 0.3, 0.3] },
  { name: "vented lossless", box: { kind: "vented", vb_l: 50.1, port: port(19.6), ...INF }, o: {}, exp: [27.9, 25.2, 22.8], tol: [0.3, 0.3, 0.3] },
  { name: "vented lossy absorbed", box: { kind: "vented", vb_l: 50.7, port: port(19.3), ql: 7, qa: 100, qp: 100 }, o: { leakage: "absorbed" }, exp: [29.5, 25.9, 22.4], tol: [0.3, 0.3, 0.3] },
] as const;

for (const c of CASES) {
  test(`f3From peak matches VituixCAD: ${c.name}`, () => {
    const r = simulate(DRV, c.box as never, { ...PK, ...c.o } as never);
    near(r.summary.f3, c.exp[0], c.tol[0], "f3");
    near(r.summary.f6, c.exp[1], c.tol[1], "f6");
    near(r.summary.f10, c.exp[2], c.tol[2], "f10");
  });
}

test("default reference: f3RefSpl is referenceSpl (box) or bandPeakSpl (bandpass)", () => {
  const s = simulate(DRV, { kind: "sealed", vb_l: 20, ...INF }, OPT);
  assert.equal(s.summary.f3RefSpl, s.summary.referenceSpl);
  const bp = simulate(DRV, { kind: "bandpass", rear: { vb_l: 15 }, front: { vb_l: 20, port: port(15) } }, OPT);
  assert.ok(bp.summary.bandPeakSpl !== undefined);
  assert.equal(bp.summary.f3RefSpl, bp.summary.bandPeakSpl);
});

test("peak vs passband: vented high-Q alignment, flat box, tiny box", () => {
  const vented = { kind: "vented", vb_l: 50.1, port: port(19.6), ...INF } as const;
  assert.ok(simulate(DRV, vented, PK).summary.f3! > simulate(DRV, vented, OPT).summary.f3! + 1);
  const flat = { kind: "sealed", vb_l: 200, ...INF } as const;
  const dFlat = Math.abs(simulate(DRV, flat, PK).summary.f3! - simulate(DRV, flat, OPT).summary.f3!);
  assert.ok(dFlat < 0.8, `flat ${dFlat}`);
  const tiny = { kind: "sealed", vb_l: 6, ...INF } as const;
  assert.ok(simulate(DRV, tiny, PK).summary.f3! > simulate(DRV, tiny, OPT).summary.f3! + 8);
});

test("fallback: response still rising at the cap keeps the passband values", () => {
  const drv = { ...DRV, qes: 0.26 };
  const box = { kind: "vented", vb_l: 80, port: port(60), ql: 7, qa: 100, qp: 100 } as const;
  const a = simulate(drv, box, OPT);
  const b = simulate(drv, box, PK);
  assert.equal(b.summary.f3RefSpl, a.summary.referenceSpl);
  assert.equal(b.summary.f3, a.summary.f3);
  assert.equal(b.summary.f6, a.summary.f6);
});

test("lines and bandpass boxes ignore f3From", () => {
  const tl: LineInput = { kind: "line", segments: [{ length_cm: 150, startArea_cm2: 150, endArea_cm2: 150 }], driverAt_cm: 0 };
  const bpBox = { kind: "bandpass", rear: { vb_l: 15 }, front: { vb_l: 20, port: port(15) } } as const;
  for (const box of [tl, bpBox]) {
    const a = simulate(DRV, box as never, OPT);
    const b = simulate(DRV, box as never, PK);
    assert.equal(b.summary.f3, a.summary.f3);
    assert.equal(b.summary.f6, a.summary.f6);
    assert.equal(b.summary.f3High, a.summary.f3High);
    assert.equal(b.summary.f3RefSpl, a.summary.f3RefSpl);
  }
});

test("f10 is set and below f6 for a sealed box", () => {
  const r = simulate(DRV, { kind: "sealed", vb_l: 20, ...INF }, OPT);
  assert.ok(r.summary.f10 !== null && r.summary.f6 !== null && r.summary.f10 < r.summary.f6);
});
