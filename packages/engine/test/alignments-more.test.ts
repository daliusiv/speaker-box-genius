import { test } from "node:test";
import assert from "node:assert/strict";
import { bb4Alignment, c4Alignment, chebyshevCoefficients, moreVentedAlignments, sqb3Alignment } from "../src/alignments.ts";

// A driver with a given Qts (Qms large, so Qts ≈ Qes): fs 30 Hz, Vas 100 L.
const drv = (qts: number, ql?: number) => {
  const qms = 1e6;
  return { fs: 30, qms, qes: (qts * qms) / (qms - qts), vas_l: 100, ...(ql ? { ql } : {}) };
};
const hOf = (a: { fb: number }) => a.fb / 30;
const alphaOf = (a: { vb_l: number }) => 100 / a.vb_l;

test("C4 / SC4 match the Speakerbench (Bullock) table at QL = 100", () => {
  for (const [qt, h, alpha] of [
    [0.32, 1.0953, 2.5363],
    [0.4, 0.9648, 1.1956],
    [0.5, 0.7783, 0.5928],
  ] as const) {
    const a = c4Alignment(drv(qt, 100))!;
    assert.ok(Math.abs(hOf(a) - h) < 5e-4, `Qt ${qt}: h ${hOf(a)} vs ${h}`);
    assert.ok(Math.abs(alphaOf(a) - alpha) < 1e-3, `Qt ${qt}: α ${alphaOf(a)} vs ${alpha}`);
    assert.equal(a.name, qt < 0.38 ? "SC4" : "C4");
  }
  // k = 1 is B4: at QL = 100 the table gives Qt 0.3842, h 1, α 1.3882.
  const b4 = c4Alignment(drv(0.3842, 100))!;
  assert.equal(b4.name, "B4");
  assert.ok(Math.abs(hOf(b4) - 1) < 2e-3 && Math.abs(alphaOf(b4) - 1.3882) < 3e-3, `${hOf(b4)} ${alphaOf(b4)}`);
  // Lossless k = 1: exactly B4 (Qt = cos 3π/8, h 1, α √2).
  const t = chebyshevCoefficients(1);
  assert.ok(Math.abs(t.a1 - t.a3) < 1e-12 && Math.abs(t.a2 - (2 + Math.SQRT2)) < 1e-12);
});

test("BB4 / SBB4: the port at Fs, LR4 and CD4 as special cases, as tabulated", () => {
  // LR4 (ζ = 1/√2) at QL = 100: Qt 0.3548, α 1.9718; CD4 (ζ = 1) lossless: Qt 0.25, α 4.
  const lr4 = bb4Alignment(drv(0.3548, 100))!;
  assert.ok(Math.abs(alphaOf(lr4) - 1.9718) < 1e-3 && hOf(lr4) === 1);
  const cd4 = bb4Alignment(drv(0.25))!;
  assert.ok(Math.abs(alphaOf(cd4) - 4) < 1e-9 && cd4.name === "SBB4" && cd4.db === 0);
  // Above LR4 it peaks: two sections at ζ = 1/(4·0.5) = 0.5 peak by 2 × 1.25 dB.
  const bb4 = bb4Alignment(drv(0.5))!;
  assert.equal(bb4.name, "BB4");
  assert.ok(Math.abs(bb4.db - 2 * 20 * Math.log10(1 / (2 * 0.5 * Math.sqrt(0.75)))) < 1e-9);
  assert.equal(bb4Alignment(drv(0.8)), null);
});

test("SQB3: QB3 past B4, offered while its peak stays within 6 dB (lossless)", () => {
  assert.equal(sqb3Alignment(drv(0.35)), null);
  const a = sqb3Alignment(drv(0.46))!;
  assert.equal(a.shape, "peak");
  assert.ok(Math.abs(a.db - 2.0) < 0.05, `peak ${a.db}`);
  // At Qts 0.5 the lossless peak is +6 dB (a2 = √6, h = 1/(2√6·0.25)).
  const top = sqb3Alignment(drv(0.5))!;
  assert.ok(Math.abs(top.db - 6.02) < 0.05, `peak ${top.db}`);
  assert.equal(sqb3Alignment(drv(0.52)), null);
});

test("the families offered: SC4 and SBB4 below B4; C4, BB4 and SQB3 above", () => {
  assert.deepEqual(moreVentedAlignments(drv(0.3)).map((a) => a.name), ["SC4", "SBB4"]);
  assert.deepEqual(moreVentedAlignments(drv(0.45)).map((a) => a.name), ["C4", "BB4", "SQB3"]);
});

test("each alignment's box, simulated, has the shape it's named for", async () => {
  const { simulate } = await import("../src/simulate.ts");
  const { portLengthForFb } = await import("../src/index.ts");
  // A lossless box and a driver with no coil inductance: the response is the 4th-order high-pass alone.
  const t = { fs: 30, qms: 1e6, vas_l: 100, re: 6, sd_cm2: 300 };
  const run = (qts: number, a: { vb_l: number; fb: number }) => {
    const port = { shape: "round" as const, diameter_cm: 10, length_cm: 0 };
    port.length_cm = portLengthForFb(a.vb_l, port, a.fb, 1);
    const r = simulate(
      { ...t, qes: (qts * 1e6) / (1e6 - qts), le_mh: 0 },
      { kind: "vented", vb_l: a.vb_l, port, ql: Infinity, qa: Infinity, qp: Infinity },
      { power: 1, fMin: 5, fMax: 2000, points: 3000 },
    );
    const ref = r.spl[r.freq.findIndex((f) => f >= 1000)]!;
    return { freq: r.freq, rel: Array.from(r.spl, (x) => x - ref) };
  };
  // C4: equal ripple of the stated size (between 0 dB and +ripple), from the first ripple peak up.
  const c4 = c4Alignment(drv(0.55))!;
  assert.ok(c4.db > 0.3, `ripple ${c4.db}`);
  const c = run(0.55, c4);
  const start = c.rel.findIndex((x) => x >= c4.db - 0.02);
  const band = c.rel.filter((_, i) => i >= start && c.freq[i]! < 300);
  assert.ok(Math.abs(Math.max(...band) - Math.min(...band) - c4.db) < 0.05, `ripple ${Math.max(...band) - Math.min(...band)} vs ${c4.db}`);
  assert.ok(Math.max(...c.rel) < c4.db + 0.05);
  // LR4 (BB4 at ζ = 1/√2): −6 dB at the tuning, which is Fs.
  const lr4 = bb4Alignment(drv(1 / Math.sqrt(8)))!;
  const l = run(1 / Math.sqrt(8), lr4);
  const i30 = l.freq.findIndex((f) => f >= 30);
  assert.ok(Math.abs(l.rel[i30]! + 6.02) < 0.1, `LR4 at Fs: ${l.rel[i30]}`);
  // SQB3: the stated peak.
  const s = sqb3Alignment(drv(0.46))!;
  assert.ok(Math.abs(Math.max(...run(0.46, s).rel) - s.db) < 0.1);
});
