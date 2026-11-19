import { test } from "node:test";
import assert from "node:assert/strict";
import { simulate } from "../src/simulate.ts";

// The amplifier's output power as a third limit beside its volts and amps.
// A 10" subwoofer-like driver in a sealed and a ported box.
const DRV = { fs: 30, qms: 5.2, qes: 0.4, vas_l: 50, re: 3.4, le_mh: 1.2, sd_cm2: 330, xmax_mm: 12, pe_w: 250 };
const SEALED = { kind: "sealed" as const, vb_l: 40 };
const PORTED = { kind: "vented" as const, vb_l: 60, port: { shape: "round" as const, diameter_cm: 10, length_cm: 30 } };
const O = { power: 100, rg: 0.1, fMin: 10, fMax: 2000, points: 200, portVelocityLimit: Infinity };

test("amp watts: where the power limit binds, the amplifier delivers exactly its rated watts, and never more anywhere", () => {
  for (const box of [SEALED, PORTED]) {
    const P = 60;
    const r = simulate(DRV, box, { ...O, amp: { watts: P } });
    let bound = 0;
    for (let i = 0; i < r.freq.length; i++) {
      assert.ok(r.ampAtMax.watts[i]! <= P * (1 + 1e-9), `${box.kind} ${r.freq[i]} Hz: ${r.ampAtMax.watts[i]} W`);
      if (r.ampLimitBy[i] === "watts") {
        bound++;
        assert.equal(r.limitedBy[i], "amp");
        assert.ok(Math.abs(r.ampAtMax.watts[i]! / P - 1) < 1e-9, `${box.kind} ${r.freq[i]} Hz`);
      } else assert.ok(r.ampLimitBy[i] === null);
    }
    assert.ok(bound > 0, `${box.kind}: the power limit binds somewhere`);
  }
});

test("amp watts: the voltage it allows is √(P · |Z|² / Re Z), so more volts where the impedance is high or reactive", () => {
  const P = 60;
  const r = simulate(DRV, SEALED, { ...O, amp: { watts: P } });
  for (let i = 0; i < r.freq.length; i++) {
    if (r.ampLimitBy[i] !== "watts") continue;
    // The amplifier sees the bank plus Rg: Z = |Zin|∠φ + Rg.
    const ph = (r.impedancePhaseDeg[i]! * Math.PI) / 180;
    const re = r.impedanceOhm[i]! * Math.cos(ph) + O.rg;
    const im = r.impedanceOhm[i]! * Math.sin(ph);
    const v = Math.sqrt((P * (re * re + im * im)) / re);
    assert.ok(Math.abs(r.ampAtMax.volts[i]! / v - 1) < 1e-9, `${r.freq[i]} Hz`);
  }
});

test("amp volts, amps and watts together: the lowest applies, and ampLimitBy names it", () => {
  const amp = { volts: 20, amps: 4, watts: 60 };
  const r = simulate(DRV, PORTED, { ...O, amp });
  const seen = new Set<string>();
  for (let i = 0; i < r.freq.length; i++) {
    const a = r.ampAtMax;
    assert.ok(a.volts[i]! <= amp.volts * (1 + 1e-9) && a.amps[i]! <= amp.amps * (1 + 1e-9) && a.watts[i]! <= amp.watts * (1 + 1e-9), `${r.freq[i]} Hz`);
    const by = r.ampLimitBy[i] ?? null;
    if (by === null) continue;
    seen.add(by);
    const at = by === "volts" ? a.volts[i]! / amp.volts : by === "amps" ? a.amps[i]! / amp.amps : a.watts[i]! / amp.watts;
    assert.ok(Math.abs(at - 1) < 1e-9, `${r.freq[i]} Hz: ${by}`);
  }
  assert.deepEqual([...seen].sort(), ["amps", "volts", "watts"], "each of the three binds somewhere in this box");
});

test("amp watts: no limit (0 or unset) changes nothing; volts and amps results are unchanged by the new field", () => {
  const base = simulate(DRV, PORTED, { ...O, amp: { volts: 30, amps: 7 } });
  const zero = simulate(DRV, PORTED, { ...O, amp: { volts: 30, amps: 7, watts: 0 } });
  assert.deepEqual(zero.maxSpl, base.maxSpl);
  assert.deepEqual(zero.limitedBy, base.limitedBy);
  assert.ok(base.ampLimitBy.every((k) => k === null || k === "volts" || k === "amps"));
  const none = simulate(DRV, PORTED, { ...O });
  assert.ok(none.ampLimitBy.every((k) => k === null));
});

test("amp watts: an EQ boost lowers the drive setting at the limit, not the maximum SPL or the amp's power there", () => {
  const P = 60;
  const plain = simulate(DRV, SEALED, { ...O, amp: { watts: P } });
  const eq = simulate(DRV, SEALED, { ...O, amp: { watts: P }, eq: [{ type: "peak", freq: 200, gain_db: 6, q: 1 }] });
  const i = plain.freq.findIndex((f) => f >= 200);
  assert.equal(plain.ampLimitBy[i], "watts");
  assert.equal(eq.ampLimitBy[i], "watts");
  assert.ok(Math.abs(eq.maxSpl[i]! - plain.maxSpl[i]!) < 1e-6);
  assert.ok(Math.abs(eq.ampAtMax.watts[i]! - P) < 1e-6);
  assert.ok(eq.maxPowerW[i]! < plain.maxPowerW[i]! / 3, "the +6 dB boost reaches it with about a quarter of the drive");
});

test("amp watts: WinISD's drive model and the circuit model reach the same amplifier power at the limit", () => {
  const P = 60;
  const circuit = simulate(DRV, SEALED, { ...O, amp: { watts: P } });
  const winisd = simulate(DRV, SEALED, { ...O, amp: { watts: P }, driveModel: "winisd" });
  for (let i = 0; i < circuit.freq.length; i++) {
    if (circuit.ampLimitBy[i] !== "watts") continue;
    assert.equal(winisd.ampLimitBy[i], "watts", `${circuit.freq[i]} Hz`);
    assert.ok(Math.abs(winisd.ampAtMax.watts[i]! / P - 1) < 1e-6, `${circuit.freq[i]} Hz`);
    assert.ok(Math.abs(winisd.maxSpl[i]! - circuit.maxSpl[i]!) < 0.01, `${circuit.freq[i]} Hz`);
  }
});
