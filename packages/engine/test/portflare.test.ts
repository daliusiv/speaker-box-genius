import { test } from "node:test";
import assert from "node:assert/strict";
import { portEffectiveLength, portLengthForFb, portLossCoefficient, portMouthArea, portArea, portPipeResonance, ventedFb } from "../src/model.ts";
import { simulate } from "../src/simulate.ts";

const DRV = { fs: 22, qms: 4.5, qes: 0.42, vas_l: 90, re: 3.3, sd_cm2: 330, bl: 12, mms_g: 120, xmax_mm: 13, pe_w: 400 };
const straight = { shape: "round" as const, diameter_cm: 10, length_cm: 30 };

test("a port with no flare is exactly the WinISD straight tube", () => {
  assert.equal(portEffectiveLength({ ...straight, flare_cm: 0 }), 0.3 + 0.732 * 0.1);
  assert.equal(portMouthArea(straight), portArea(straight));
  assert.ok(Math.abs(portLengthForFb(50, { ...straight, length_cm: 0 }, 30) - portLengthForFb(50, { ...straight, flare_cm: 0, length_cm: 0 }, 30)) < 1e-12);
});

test("flares: same physical length tunes higher, so the port must be longer; the length found hits the tuning", () => {
  const flared = { ...straight, flare_cm: 2.5 };
  assert.ok(portEffectiveLength(flared) < portEffectiveLength(straight));
  assert.ok(ventedFb(50, flared) > ventedFb(50, straight));
  for (const [flare_cm, flareEnds] of [[1, 2], [2.5, 2], [2.5, 1], [5, 2]] as const) {
    const p = { ...straight, flare_cm, flareEnds, length_cm: 0 };
    const L = portLengthForFb(50, p, 30);
    assert.ok(L > portLengthForFb(50, { ...straight, length_cm: 0 }, 30), `${flare_cm}/${flareEnds} longer`);
    assert.ok(Math.abs(ventedFb(50, { ...p, length_cm: L }) - 30) < 1e-9, `${flare_cm}/${flareEnds} tuning`);
  }
});

test("loss coefficient: 1.5 sharp, smaller with rounded ends, one flared end in between", () => {
  assert.equal(portLossCoefficient(straight), 1.5);
  const both = portLossCoefficient({ ...straight, flare_cm: 2.5 });
  const one = portLossCoefficient({ ...straight, flare_cm: 2.5, flareEnds: 1 });
  assert.ok(both < one && one < 1.5);
});

test("compression off changes nothing; on, it's nil at low level and grows with power", () => {
  const box = { kind: "vented" as const, vb_l: 60, port: { ...straight, length_cm: portLengthForFb(60, { ...straight, length_cm: 0 }, 28) } };
  const a = simulate(DRV, box, { power: 100 });
  const b = simulate(DRV, box, { power: 100, portCompression: false });
  assert.deepEqual([...a.spl], [...b.spl]);
  assert.equal(a.summary.portCompression, undefined);
  const loss = (p: number) => simulate(DRV, box, { power: p, portCompression: true }).summary.portCompression!.db;
  assert.ok(loss(1) < 0.05);
  const l100 = loss(100);
  const l500 = loss(500);
  assert.ok(l100 > 0.5 && l500 > l100, `${l100} ${l500}`);
  // The loss sits near the tuning, where the port does the work.
  const at = simulate(DRV, box, { power: 500, portCompression: true }).summary.portCompression!.f;
  assert.ok(at > 20 && at < 36, `at ${at} Hz`);
});

test("flared ports compress less and are judged at their mouths", () => {
  const mk = (flare_cm: number) => {
    const p = { ...straight, flare_cm, length_cm: 0 };
    return { kind: "vented" as const, vb_l: 60, port: { ...p, length_cm: portLengthForFb(60, p, 28) } };
  };
  const s = simulate(DRV, mk(0), { power: 400, portCompression: true });
  const f = simulate(DRV, mk(3), { power: 400, portCompression: true });
  assert.ok(f.summary.portCompression!.db < s.summary.portCompression!.db);
  assert.equal(f.summary.portVelocityAt, "ends");
  assert.equal(s.summary.portVelocityAt, "throat");
  // Linear velocity at the ends = throat velocity × throat/mouth area.
  const fl = simulate(DRV, mk(3), { power: 10 });
  const port = mk(3).port;
  const ratio = portArea(port) / portMouthArea(port);
  const sl = simulate(DRV, { ...mk(3), port: { ...port, flare_cm: 0 } }, { power: 10 });
  assert.ok(ratio < 0.5);
  assert.ok(Math.max(...fl.portVelocity!) < Math.max(...sl.portVelocity!));
});

// ---------------------------------------------------------------------------
// Ports as pipes
// ---------------------------------------------------------------------------

test("port as a pipe: same box as the lumped port in the bass, a resonance near c / 2L higher up", () => {
  const D = { fs: 35, qms: 1.87, qes: 0.4, vas_l: 37.4, re: 5.9, sd_cm2: 211.2, xmax_mm: 5.5, pe_w: 80 };
  const box = { kind: "vented" as const, vb_l: 40, port: { shape: "round" as const, diameter_cm: 7, length_cm: 40 } };
  const o = { power: 2.83, convention: "volts" as const, fMin: 10, fMax: 1000, points: 800 };
  const lumped = simulate(D, box, o);
  const pipe = simulate(D, box, { ...o, portModel: "pipe" });
  for (let i = 0; i < lumped.freq.length && lumped.freq[i]! < 60; i++) if (lumped.spl[i]! > 40)
    assert.ok(Math.abs(lumped.spl[i]! - pipe.spl[i]!) < 0.35, `${lumped.freq[i]} Hz`); // the pipe air is slightly springy
  const f1 = portPipeResonance(box.port);
  let iMax = 0;
  for (let i = 0; i < pipe.freq.length; i++) if (pipe.freq[i]! > 150 && pipe.portVelocity![i]! > pipe.portVelocity![iMax]! * (pipe.freq[iMax]! > 150 ? 1 : 0)) iMax = i;
  assert.ok(Math.abs(pipe.freq[iMax]! / f1 - 1) < 0.05, `air speed peaks at ${pipe.freq[iMax]} Hz, pipe resonance ${f1}`);
  assert.ok(pipe.portVelocity![iMax]! > 5 * lumped.portVelocity![iMax]!, "the lumped port has no such resonance");
});

test("bandpass ports as pipes: same box as air-mass ports in the bass, for parallel and series boxes", () => {
  const p6 = { shape: "round" as const, diameter_cm: 6, length_cm: 20 };
  const p7 = { shape: "round" as const, diameter_cm: 7, length_cm: 15 };
  const o = { power: 1, fMin: 10, fMax: 1000, points: 300 };
  for (const rearPortTo of ["outside", "front"] as const) {
    const box = { kind: "bandpass" as const, rearPortTo, rear: { vb_l: 20, port: p6 }, front: { vb_l: 15, port: p7 } };
    const lumped = simulate(DRV, box, o);
    const pipe = simulate(DRV, box, { ...o, portModel: "pipe" });
    for (let i = 0; i < lumped.freq.length && lumped.freq[i]! < 60; i++) {
      // The pipes' air is slightly springy, which nudges the tunings: a few tenths of a dB on the slopes.
      assert.ok(Math.abs(lumped.spl[i]! - pipe.spl[i]!) < 0.5, `${rearPortTo}: SPL at ${lumped.freq[i]} Hz`);
    }
    // Higher up the pipes show their own resonances: the outputs part.
    const i300 = pipe.freq.findIndex((f) => f > 300);
    assert.ok(Math.abs(lumped.spl[i300]! - pipe.spl[i300]!) > 0.5, `${rearPortTo}: pipes differ at 300 Hz`);
  }
});

test("for the same box and tuning, a smaller port area tunes with a shorter port, and a bigger box too", async () => {
  const { portLengthForFb } = await import("../src/model.ts");
  // The car guide's 45 L box at 33 Hz with a 5 cm wide slot: 30, 20 and 10 cm tall.
  const len = (h: number, vb = 45) => portLengthForFb(vb, { shape: "slot", width_cm: 5, height_cm: h, length_cm: 0 }, 33);
  assert.ok(len(10) < len(20) && len(20) < len(30), `${len(10)} ${len(20)} ${len(30)}`);
  assert.ok(Math.abs(len(30) - 81.2) < 0.5, `${len(30)}`);
  assert.ok(len(30, 60) < len(30));
});
