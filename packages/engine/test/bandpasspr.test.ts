import { test } from "node:test";
import assert from "node:assert/strict";
import { simulate } from "../src/simulate.ts";
import { portAcousticMass, prFb, type PassiveRadiatorInput, type PortInput } from "../src/model.ts";
import { STANDARD_AIR } from "../src/constants.ts";

/** Bandpass boxes with passive radiators instead of ports. */

const drv = { fs: 35, qms: 1.87, qes: 0.4, vas_l: 37.4, re: 5.9, sd_cm2: 211.2, le_mh: 0, xmax_mm: 5.5, pe_w: 80 };
const opts = { power: 100, fMin: 15, fMax: 300, points: 150 };
const LOSSLESS = { ql: Infinity, qa: Infinity, qp: Infinity };
const port = (d: number, l: number): PortInput => ({ shape: "round", diameter_cm: d, length_cm: l });
const maxDiff = (a: Float64Array, b: Float64Array) => a.reduce((m, v, i) => Math.max(m, Math.abs(v - b[i]!)), 0);
const maxRel = (a: Float64Array, b: Float64Array) => a.reduce((m, v, i) => Math.max(m, Math.abs(v / b[i]! - 1)), 0);

/**
 * A PR with an extremely soft, undamped suspension is just a mass of air: the same
 * acoustic mass as a lossless port when Mmp / Sd² equals the port's acoustic mass.
 */
function prLike(p: PortInput, sd_cm2 = 200): PassiveRadiatorInput {
  const map = portAcousticMass(p, undefined, STANDARD_AIR); // kg/m⁴, one port
  const sd = sd_cm2 / 1e4;
  return { mms_g: map * sd * sd * 1000, sd_cm2, vas_l: 1e9, qms: 1e9, xmax_mm: 20 };
}

test("4th order: a port-like PR in the front chamber matches the ported box", () => {
  const p = port(7, 20);
  const ported = simulate(drv, { kind: "bandpass", rear: { vb_l: 15, ...LOSSLESS }, front: { vb_l: 20, port: p, ...LOSSLESS }, qicl: Infinity }, opts);
  const withPr = simulate(
    drv,
    { kind: "bandpass", rear: { vb_l: 15, ...LOSSLESS }, front: { vb_l: 20, prs: [{ pr: prLike(p), count: 1 }], ...LOSSLESS }, qicl: Infinity },
    opts,
  );
  assert.ok(maxDiff(withPr.spl, ported.spl) < 1e-4, String(maxDiff(withPr.spl, ported.spl)));
  assert.ok(maxRel(withPr.excursionMm, ported.excursionMm) < 1e-5);
  assert.ok(Math.abs(withPr.summary.fb! - ported.summary.fb!) / ported.summary.fb! < 1e-5);
  // No port in the front chamber, so no port velocity; one PR group instead.
  assert.equal(withPr.portVelocity, null);
  assert.equal(withPr.prGroups?.length, 1);
  assert.equal(withPr.prGroups![0]!.chamber, "front");
});

test("PR excursion is the port's air displacement: x = v·Sport / (Sd·ω)", () => {
  const p = port(7, 20);
  const ported = simulate(drv, { kind: "bandpass", rear: { vb_l: 15, ...LOSSLESS }, front: { vb_l: 20, port: p, ...LOSSLESS }, qicl: Infinity }, opts);
  const pr = prLike(p, 200);
  const withPr = simulate(
    drv,
    { kind: "bandpass", rear: { vb_l: 15, ...LOSSLESS }, front: { vb_l: 20, prs: [{ pr, count: 1 }], ...LOSSLESS }, qicl: Infinity },
    opts,
  );
  const sPort = Math.PI * 0.035 * 0.035;
  for (const i of [10, 60, 120]) {
    const w = 2 * Math.PI * withPr.freq[i]!;
    const expected = (ported.portVelocity![i]! * sPort) / (0.02 * w) * 1000; // mm
    assert.ok(Math.abs(withPr.prGroups![0]!.excursionMm[i]! / expected - 1) < 1e-4, `${withPr.freq[i]} Hz`);
  }
});

test("6th order parallel and series-tuned: port-like PRs in either chamber match the ported boxes", () => {
  const pf = port(8, 18);
  const pr = port(6, 25);
  for (const rearPortTo of ["outside", "front"] as const) {
    const base = { kind: "bandpass" as const, rearPortTo, qicl: Infinity };
    const ported = simulate(drv, { ...base, rear: { vb_l: 20, port: pr, portCount: 2, ...LOSSLESS }, front: { vb_l: 15, port: pf, ...LOSSLESS } }, opts);
    const both = simulate(
      drv,
      {
        ...base,
        rear: { vb_l: 20, prs: [{ pr: prLike(pr), count: 2 }], ...LOSSLESS },
        front: { vb_l: 15, prs: [{ pr: prLike(pf), count: 1 }], ...LOSSLESS },
      },
      opts,
    );
    assert.ok(maxDiff(both.spl, ported.spl) < 1e-4, `${rearPortTo}: ${maxDiff(both.spl, ported.spl)}`);
    assert.ok(Math.abs(both.summary.fbRear! - ported.summary.fbRear!) / ported.summary.fbRear! < 1e-5);
    assert.deepEqual(both.prGroups!.map((g) => g.chamber), ["front", "rear"]);
    assert.equal(both.rearPortVelocity, null);
    // Mixed: rear PRs, front port.
    const mixed = simulate(drv, { ...base, rear: { vb_l: 20, prs: [{ pr: prLike(pr), count: 2 }], ...LOSSLESS }, front: { vb_l: 15, port: pf, ...LOSSLESS } }, opts);
    assert.ok(maxDiff(mixed.spl, ported.spl) < 1e-4);
    assert.ok(mixed.portVelocity !== null && mixed.rearPortVelocity === null);
  }
});

test("real PRs: tuning from mass and suspension, Xmax limits, mixed groups in a chamber", () => {
  const PR = { mms_g: 60, sd_cm2: 220, vas_l: 35, qms: 8, xmax_mm: 6 };
  const box = (prs: { pr: typeof PR; count: number; addedMass_g?: number }[]) =>
    simulate(drv, { kind: "bandpass", rear: { vb_l: 12 }, front: { vb_l: 18, prs } }, opts);
  const r = box([{ pr: PR, count: 2, addedMass_g: 40 }]);
  assert.ok(Math.abs(r.summary.fb! - prFb(18, PR, 2, 40)) < 1e-9);
  assert.ok(r.limitedBy.includes("pr-xmax"));
  // Two groups of one PR each = one group of two.
  const split = box([{ pr: PR, count: 1, addedMass_g: 40 }, { pr: PR, count: 1, addedMass_g: 40 }]);
  assert.ok(maxDiff(split.spl, r.spl) < 1e-9);
  assert.ok(maxRel(split.prGroups![1]!.excursionMm, r.prGroups![0]!.excursionMm) < 1e-9);
});

test("a front chamber with neither a port nor PRs is rejected", () => {
  assert.throws(() => simulate(drv, { kind: "bandpass", rear: { vb_l: 10 }, front: { vb_l: 10 } }, opts), /front chamber needs/);
});
