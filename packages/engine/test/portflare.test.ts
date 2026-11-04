import { test } from "node:test";
import assert from "node:assert/strict";
import { portEffectiveLength, portLengthForFb, portLossCoefficient, portMouthArea, portArea, ventedFb } from "../src/model.ts";
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
