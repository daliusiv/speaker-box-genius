import { test } from "node:test";
import assert from "node:assert/strict";
import { simulate } from "../src/simulate.ts";
import { ventedFb } from "../src/model.ts";

const drv = { fs: 35, qms: 1.87, qes: 0.4, vas_l: 37.4, re: 5.9, sd_cm2: 211.2, le_mh: 0, xmax_mm: 5.5, pe_w: 80 };
const opts = { power: 100, fMin: 15, fMax: 300, points: 120 };
const port = (d: number, l: number) => ({ shape: "round" as const, diameter_cm: d, length_cm: l });
// A tiny front chamber with an opening so wide and short that it is acoustically
// transparent: its air spring is far stiffer than the opening's air mass.
const open = { vb_l: 0.01, port: port(2000, 0), ql: Infinity, qa: Infinity, qp: Infinity };
const maxDiff = (a: Float64Array, b: Float64Array) => a.reduce((m, v, i) => Math.max(m, Math.abs(v - b[i]!)), 0);
const maxRel = (a: Float64Array, b: Float64Array) => a.reduce((m, v, i) => Math.max(m, Math.abs(v / b[i]! - 1)), 0);

test("bandpass with a transparent front chamber reduces to a sealed box", () => {
  const bp = simulate(drv, { kind: "bandpass", rear: { vb_l: 20 }, front: open, qicl: Infinity }, opts);
  const sealed = simulate(drv, { kind: "sealed", vb_l: 20 }, opts);
  assert.ok(maxDiff(bp.spl, sealed.spl) < 0.015, `SPL ${maxDiff(bp.spl, sealed.spl)}`);
  assert.ok(maxRel(bp.excursionMm, sealed.excursionMm) < 0.002);
  assert.ok(maxRel(bp.impedanceOhm, sealed.impedanceOhm) < 0.002);
  assert.ok(Math.abs(bp.summary.fc! - sealed.summary.fc!) < 1e-9);
});

test("6th-order bandpass with a transparent front chamber reduces to a vented box (parallel and series)", () => {
  const rp = port(7.5, 30);
  const vented = simulate(drv, { kind: "vented", vb_l: 25, port: rp }, opts);
  for (const rearPortTo of ["outside", "front"] as const) {
    const bp = simulate(drv, { kind: "bandpass", rear: { vb_l: 25, port: rp }, front: open, rearPortTo, qicl: Infinity }, opts);
    assert.ok(maxDiff(bp.spl, vented.spl) < 0.015, `${rearPortTo}: SPL ${maxDiff(bp.spl, vented.spl)}`);
    assert.ok(maxRel(bp.excursionMm, vented.excursionMm) < 0.005, `${rearPortTo}: x ${maxRel(bp.excursionMm, vented.excursionMm)}`);
    assert.ok(maxDiff(bp.rearPortVelocity!, vented.portVelocity!) < 0.05, `${rearPortTo}: v ${maxDiff(bp.rearPortVelocity!, vented.portVelocity!)}`);
    assert.ok(maxRel(bp.impedanceOhm, vented.impedanceOhm) < 0.005, `${rearPortTo}: Z ${maxRel(bp.impedanceOhm, vented.impedanceOhm)}`);
    assert.ok(Math.abs(bp.summary.fbRear! - vented.summary.fb!) < 1e-9);
  }
});

test("4th-order bandpass: band-limited response peaking near the front tuning", () => {
  const fp = port(7.5, 20);
  const r = simulate(drv, { kind: "bandpass", rear: { vb_l: 15 }, front: { vb_l: 20, port: fp } }, { ...opts, points: 400 });
  assert.ok(Math.abs(r.summary.fb! - ventedFb(20, fp)) < 1e-9);
  let peak = 0;
  r.spl.forEach((v, i) => { if (v > r.spl[peak]!) peak = i; });
  const fPeak = r.freq[peak]!;
  assert.ok(fPeak > 30 && fPeak < 120, `peak at ${fPeak}`);
  // Falls away on both sides: 12 dB/octave asymptotes, so at least 15 dB down an octave and a half out.
  assert.ok(r.spl[0]! < r.spl[peak]! - 15);
  assert.ok(r.spl[r.spl.length - 1]! < r.spl[peak]! - 15);
  assert.ok(r.summary.f3 !== null && r.summary.f3High != null && r.summary.f3 < r.summary.f3High);
  assert.equal(r.rearPortVelocity, null);
  assert.ok(r.portVelocity!.every((v) => v >= 0));
});

test("bandpass impedance and excursion respond to both tunings (6th order)", () => {
  const r = simulate(
    drv,
    { kind: "bandpass", rear: { vb_l: 20, port: port(7.5, 40) }, front: { vb_l: 15, port: port(7.5, 10) } },
    { ...opts, fMin: 10, fMax: 300, points: 600 },
  );
  // Excursion minima sit near the chamber tunings.
  const minNear = (f0: number) => {
    let best = -1;
    r.freq.forEach((f, i) => { if (f > f0 * 0.8 && f < f0 * 1.25 && (best < 0 || r.excursionMm[i]! < r.excursionMm[best]!)) best = i; });
    return r.freq[best]!;
  };
  const fr = r.summary.fbRear!;
  assert.ok(Math.abs(minNear(fr) / fr - 1) < 0.2, `rear dip ${minNear(fr)} vs ${fr}`);
  assert.ok(r.portVelocity && r.rearPortVelocity);
});

test("each chamber's losses act on that chamber: a transparent front leaves the rear's losses = a plain box's", () => {
  const losses = { ql: 5, qa: 15, qp: 30 };
  const rp = port(7.5, 30);
  const cases = [
    { bp: { vb_l: 20, ql: losses.ql, qa: losses.qa }, box: { kind: "sealed" as const, vb_l: 20, ql: losses.ql, qa: losses.qa } },
    { bp: { vb_l: 25, port: rp, ...losses }, box: { kind: "vented" as const, vb_l: 25, port: rp, ...losses } },
  ];
  for (const { bp, box } of cases) {
    const a = simulate(drv, { kind: "bandpass", rear: bp, front: open, qicl: Infinity }, opts);
    const b = simulate(drv, box, opts);
    assert.ok(maxDiff(a.spl, b.spl) < 0.015, `${box.kind}: SPL ${maxDiff(a.spl, b.spl)}`);
    assert.ok(maxRel(a.impedanceOhm, b.impedanceOhm) < 0.005, `${box.kind}: Z ${maxRel(a.impedanceOhm, b.impedanceOhm)}`);
    // …and they really are in effect: the default losses give a different answer.
    const dflt = simulate(drv, { kind: "bandpass", rear: { ...bp, ql: undefined, qa: undefined, qp: undefined }, front: open, qicl: Infinity }, opts);
    assert.ok(maxDiff(a.spl, dflt.spl) > 0.3, `${box.kind}: losses changed nothing`);
  }
});

test("front chamber losses change a 4th-order bandpass only through the front chamber", () => {
  const fp = port(7.5, 20);
  const base = { kind: "bandpass" as const, rear: { vb_l: 15 }, front: { vb_l: 20, port: fp } };
  const ref = simulate(drv, base, opts);
  const stuffedFront = simulate(drv, { ...base, front: { ...base.front, qa: 5 } }, opts);
  const leakyRear = simulate(drv, { ...base, rear: { vb_l: 15, ql: 3 } }, opts);
  // Stuffing the front lowers the peak around the front tuning.
  const peak = (r: typeof ref) => Math.max(...r.spl);
  assert.ok(peak(stuffedFront) < peak(ref) - 0.5, `${peak(stuffedFront)} vs ${peak(ref)}`);
  // A leaky rear chamber mostly costs output below the passband, as in a sealed box.
  assert.ok(leakyRear.spl[0]! < ref.spl[0]!);
  assert.ok(maxDiff(stuffedFront.spl, leakyRear.spl) > 0.3);
});
