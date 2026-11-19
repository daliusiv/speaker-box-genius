import { test } from "node:test";
import assert from "node:assert/strict";
import { limitSide, simulate } from "../src/simulate.ts";
import { headroom, headroomBySide, programEnvelope, SINE_CREST_DB, upperBandEdge } from "../src/program.ts";
import type { EnclosureInput, PassiveRadiatorInput } from "../src/model.ts";

// Max SPL split into the limits that hold a signal's peaks and those that hold its average,
// and the program envelope a signal with a given crest factor reaches.
const DRV = { fs: 30, qms: 5.2, qes: 0.4, vas_l: 50, re: 3.4, sd_cm2: 330, le_mh: 1, xmax_mm: 12, pe_w: 250 };
const PR: PassiveRadiatorInput = { mms_g: 150, sd_cm2: 330, xmax_mm: 15, qms: 10, fs: 18 };
const PORT = { shape: "round" as const, diameter_cm: 7.5, length_cm: 21.5 };
const BOXES: [string, EnclosureInput][] = [
  ["sealed", { kind: "sealed", vb_l: 40 }],
  ["vented", { kind: "vented", vb_l: 60, port: PORT }],
  ["passive radiator", { kind: "passive-radiator", vb_l: 50, pr: PR, prCount: 2, addedMass_g: 50 }],
  ["bandpass", { kind: "bandpass", rear: { vb_l: 20 }, front: { vb_l: 25, port: PORT } }],
  ["line", { kind: "line", driverAt_cm: 40, segments: [{ length_cm: 200, startArea_cm2: 500, endArea_cm2: 500 }] }],
  ["infinite baffle (open)", { kind: "infinite-baffle" }],
  ["infinite baffle (rear space)", { kind: "infinite-baffle", rear_l: 400 }],
];
const OPTS = { power: 100, rg: 0.1, fMin: 10, fMax: 500, points: 160, amp: { volts: 30, amps: 8, watts: 120 }, airDistortion: { limit: true, threshold: 0.1 } };

test("ceilings: min(average, peak) is maxSpl and the winner's kind is limitedBy, every box type", () => {
  for (const [name, box] of BOXES) {
    const r = simulate(DRV, box, OPTS);
    const c = r.ceilings;
    for (let i = 0; i < r.freq.length; i++) {
      const m = Math.min(c.avgSpl[i]!, c.peakSpl[i]!);
      if (!Number.isFinite(r.maxSpl[i]!)) {
        assert.ok(!Number.isFinite(m), `${name} ${r.freq[i]} Hz: no limit on either side`);
        continue;
      }
      assert.ok(Math.abs(m - r.maxSpl[i]!) < 1e-12, `${name} ${r.freq[i]} Hz: ${m} vs ${r.maxSpl[i]}`);
      const winner = c.avgSpl[i]! < c.peakSpl[i]! ? c.avgKind[i] : c.peakKind[i];
      if (c.avgSpl[i] !== c.peakSpl[i]) assert.equal(winner, r.limitedBy[i], `${name} ${r.freq[i]} Hz`);
      // Each side only holds its own kinds.
      assert.ok(c.avgKind[i] === "none" || c.avgKind[i] === "thermal" || c.avgKind[i] === "amp", `${name}: ${c.avgKind[i]} on the average side`);
      assert.ok(c.peakKind[i] !== "thermal", `${name}: thermal on the peak side`);
    }
  }
});

test("program envelope: a sine (3.01 dB) gives maxSpl exactly, every box type", () => {
  assert.ok(Math.abs(SINE_CREST_DB - 3.0103) < 1e-4);
  for (const [name, box] of BOXES) {
    const r = simulate(DRV, box, OPTS);
    const p = programEnvelope(r.ceilings, SINE_CREST_DB);
    for (let i = 0; i < r.freq.length; i++) {
      if (!Number.isFinite(r.maxSpl[i]!)) assert.ok(Number.isNaN(p.spl[i]!));
      else assert.ok(Math.abs(p.spl[i]! - r.maxSpl[i]!) < 1e-12, `${name} ${r.freq[i]} Hz`);
    }
  }
});

test("program envelope: where the average side wins it ignores the crest; where the peaks win it drops by exactly C − 3.01", () => {
  // No amplifier volts/current limit here: they hold the peaks everywhere above the bass and would hide the average side.
  const r = simulate(DRV, { kind: "vented", vb_l: 60, port: PORT }, { ...OPTS, amp: null });
  const sine = programEnvelope(r.ceilings, SINE_CREST_DB);
  for (const C of [6, 9, 12]) {
    const p = programEnvelope(r.ceilings, C);
    let avg = 0, peak = 0;
    for (let i = 0; i < r.freq.length; i++) {
      const c = r.ceilings;
      if (c.avgSpl[i]! < c.peakSpl[i]! - (C - SINE_CREST_DB)) {
        avg++;
        assert.equal(p.side[i], "avg");
        assert.ok(Math.abs(p.spl[i]! - c.avgSpl[i]!) < 1e-12);
      } else {
        peak++;
        assert.equal(p.side[i], "peak");
        assert.ok(Math.abs(p.spl[i]! - (c.peakSpl[i]! - (C - SINE_CREST_DB))) < 1e-12);
      }
      assert.ok(p.spl[i]! <= sine.spl[i]! + 1e-12, "never above the sine envelope");
      assert.ok(sine.spl[i]! - p.spl[i]! <= C - SINE_CREST_DB + 1e-12, "never more than C − 3.01 below it");
    }
    assert.ok(avg > 0 && peak > 0, `C ${C}: both sides set the envelope somewhere (${avg} / ${peak})`);
  }
});

test("limit sides: excursion, port, air and amp volts/current hold peaks; power ratings hold the average", () => {
  for (const k of ["xmax", "pr-xmax", "port", "air"] as const) assert.equal(limitSide(k), "peak");
  assert.equal(limitSide("thermal"), "avg");
  assert.equal(limitSide("amp", "volts"), "peak");
  assert.equal(limitSide("amp", "amps"), "peak");
  assert.equal(limitSide("amp", "watts"), "avg");
});

test("headroom: lowest point in the band, against a flat target or a curve; empty band → null", () => {
  const freq = [10, 20, 40, 80, 160];
  const y = [90, 100, 104, 103, 110];
  assert.deepEqual(headroom(freq, y, 105, [20, 160]), { db: -5, f: 20, i: 1 });
  assert.deepEqual(headroom(freq, y, 105, [30, 160]), { db: -2, f: 80, i: 3 });
  assert.deepEqual(headroom(freq, y, [80, 95, 100, 100, 100], [10, 160]), { db: 3, f: 80, i: 3 });
  assert.equal(headroom(freq, y, 105, [200, 300]), null);
  assert.equal(headroom(freq, [NaN, NaN, NaN, NaN, NaN], 105, [10, 160]), null);
});

test("headroom by side: each side's lowest with its limit, and overall equals the program envelope's headroom", () => {
  const r = simulate(DRV, { kind: "vented", vb_l: 60, port: PORT }, { ...OPTS, amp: null });
  const C = 6, T = 100, band = [r.summary.f3!, 500] as const;
  const h = headroomBySide(r.freq, r.ceilings, C, T, band)!;
  const env = programEnvelope(r.ceilings, C);
  const whole = headroom(r.freq, env.spl, T, band)!;
  assert.ok(h.overall && Math.abs(h.overall.db - whole.db) < 1e-12 && h.overall.i === whole.i);
  assert.equal(h.overall.kind, env.kind[whole.i]);
  assert.equal(h.overall.side, env.side[whole.i]);
  assert.ok(h.peak && h.avg);
  assert.ok(h.peak.kind !== "thermal" && (h.avg.kind === "thermal" || h.avg.kind === "amp"));
  assert.ok(Math.abs(Math.min(h.peak.db, h.avg.db) - h.overall.db) < 1e-12);
});

test("upper band edge: none for a sealed box in the bass; the −6 dB point above a bandpass box's peak", () => {
  const sealed = simulate(DRV, { kind: "sealed", vb_l: 40 }, { power: 1, fMin: 10, fMax: 500, points: 200 });
  assert.equal(upperBandEdge(sealed.freq, sealed.spl), null);
  const bp = simulate(DRV, { kind: "bandpass", rear: { vb_l: 20 }, front: { vb_l: 10, port: PORT } }, { power: 1, fMin: 10, fMax: 500, points: 400 });
  const fh = upperBandEdge(bp.freq, bp.spl);
  assert.ok(fh !== null && fh > 40 && fh < 500, `bandpass upper edge ${fh}`);
  // The level there is 6 dB under the peak (log-f interpolation between two points).
  let peak = -Infinity;
  for (const v of bp.spl) peak = Math.max(peak, v);
  const i = bp.freq.findIndex((f) => f >= fh!);
  const y0 = bp.spl[i - 1]!, y1 = bp.spl[i]!;
  const t = Math.log(fh! / bp.freq[i - 1]!) / Math.log(bp.freq[i]! / bp.freq[i - 1]!);
  assert.ok(Math.abs(y0 + t * (y1 - y0) - (peak - 6)) < 1e-9);
  assert.equal(upperBandEdge([10, 20, 40], [1, 2, 3]), null);
});
