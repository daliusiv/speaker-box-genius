import { test } from "node:test";
import assert from "node:assert/strict";
import { baffleStepDb, baffleTransfer, baffleTrustedTo, type Baffle } from "../src/baffle.ts";
import { applyBaffle, baffleFrdHeader, baffleOnlyCurve, frdGrid, writeFrd } from "../src/frd.ts";
import { parseCurve } from "../src/measured.ts";

const SQ: Baffle = { width: 0.3, height: 0.3, x: 0.15, y: 0.15 };
const OFF: Baffle = { width: 0.25, height: 0.4, x: 0.1, y: 0.12 };
const CONE: Baffle = { ...OFF, sd_cm2: 137 };

const logF = (lo: number, hi: number, step = 1.03) => {
  const f: number[] = [];
  for (let x = lo; x <= hi; x *= step) f.push(x);
  return f;
};
const db = (re: number, im: number) => 10 * Math.log10(re * re + im * im);
const deg = (re: number, im: number) => (Math.atan2(im, re) * 180) / Math.PI;
const wrapDiff = (a: number, b: number) => Math.abs((((a - b + 180) % 360) + 360) % 360 - 180);

/** The same edge-source sum, written independently: the perimeter integral of dθ/2π · (r/R) · e^(−jk·path), finely. */
function reference(f: number, b: Baffle, steps = 200_000): { re: number; im: number } {
  const r = b.distance ?? 1;
  const k = (2 * Math.PI * f) / (b.c ?? 343);
  const corners: [number, number][] = [
    [0, 0],
    [b.width, 0],
    [b.width, b.height],
    [0, b.height],
  ];
  let re = 0;
  let im = 0;
  for (let s = 0; s < 4; s++) {
    const [ax, ay] = corners[s]!;
    const [cx, cy] = corners[(s + 1) % 4]!;
    const n = Math.round((steps * Math.hypot(cx - ax, cy - ay)) / (2 * (b.width + b.height)));
    for (let i = 0; i < n; i++) {
      const p0 = [ax + ((cx - ax) * i) / n - b.x, ay + ((cy - ay) * i) / n - b.y];
      const p1 = [ax + ((cx - ax) * (i + 1)) / n - b.x, ay + ((cy - ay) * (i + 1)) / n - b.y];
      let dt = Math.atan2(p1[1]!, p1[0]!) - Math.atan2(p0[1]!, p0[0]!);
      while (dt > Math.PI) dt -= 2 * Math.PI;
      while (dt < -Math.PI) dt += 2 * Math.PI;
      const d = Math.hypot((p0[0]! + p1[0]!) / 2, (p0[1]! + p1[1]!) / 2);
      const R = Math.sqrt(d * d + r * r);
      const path = d + R - r;
      const w = ((Math.abs(dt) / (2 * Math.PI)) * r) / R;
      re += w * Math.cos(k * path);
      im -= w * Math.sin(k * path);
    }
  }
  return { re: 1 - 0.5 * re, im: -0.5 * im };
}

test("baffleStepDb is |baffleTransfer| in dB", () => {
  const f = logF(10, 20000);
  for (const b of [SQ, OFF, CONE, { ...CONE, distance: 2 }]) {
    const a = baffleStepDb(f, b);
    const { re, im } = baffleTransfer(f, b);
    for (let i = 0; i < f.length; i++) assert.equal(a[i], db(re[i]!, im[i]!));
  }
});

test("complex transfer matches a fine independent perimeter integral (point source)", () => {
  for (const b of [SQ, OFF]) {
    const f = logF(20, 5000, 1.15);
    const { re, im } = baffleTransfer(f, b);
    for (let i = 0; i < f.length; i++) {
      const ref = reference(f[i]!, b);
      assert.ok(Math.abs(db(re[i]!, im[i]!) - db(ref.re, ref.im)) < 0.02, `${f[i]} Hz dB`);
      assert.ok(wrapDiff(deg(re[i]!, im[i]!), deg(ref.re, ref.im)) < 0.5, `${f[i]} Hz phase`);
    }
  }
});

test("low frequencies: H → ½ with a small phase lead k·p̄/2 ÷ ½ (e^(jωt) convention)", () => {
  const b = SQ;
  const f = 2;
  const { re, im } = baffleTransfer([f], b);
  // Close up the farther edges sound a little weaker, so H sits just above ½; far away it is ½.
  const ref0 = reference(f, b);
  assert.ok(Math.abs(db(re[0]!, im[0]!) - db(ref0.re, ref0.im)) < 1e-3);
  const far = baffleTransfer([f], { ...b, distance: 1000 });
  assert.ok(Math.abs(db(far.re[0]!, far.im[0]!) + 6.0206) < 1e-3);
  // H ≈ ½ + j·½·k·p̄ for small k, so arg H ≈ k·p̄ (radians), with p̄ the weighted mean path.
  const ref = reference(f, b);
  assert.ok(im[0]! > 0, "phase lead");
  assert.ok(Math.abs(deg(re[0]!, im[0]!) - deg(ref.re, ref.im)) < 1e-3);
});

test("applyBaffle: dB and phase add, same frequencies, the file's phase kept", () => {
  const f = logF(20, 20000, 1.1);
  const curve = { f, v: f.map((x) => 85 + Math.sin(x / 300)), phase: f.map((x) => -((x / 50) % 360)) };
  const out = applyBaffle(curve, CONE);
  const h = baffleStepDb(f, CONE);
  const { re, im } = baffleTransfer(f, CONE);
  assert.deepEqual(out.f, f);
  assert.equal(out.phaseKind, "measured");
  for (let i = 0; i < f.length; i++) {
    assert.ok(Math.abs(out.v[i]! - (curve.v[i]! + h[i]!)) < 1e-9);
    assert.ok(wrapDiff(out.phase[i]!, curve.phase[i]! + deg(re[i]!, im[i]!)) < 1e-9);
    assert.ok(out.phase[i]! > -180 && out.phase[i]! <= 180);
  }
});

test("applyBaffle without phase: diffraction phase only", () => {
  const f = logF(20, 20000, 1.2);
  const out = applyBaffle({ f, v: f.map(() => 90) }, CONE);
  const { re, im } = baffleTransfer(f, CONE);
  assert.equal(out.phaseKind, "diffraction-only");
  for (let i = 0; i < f.length; i++) assert.ok(wrapDiff(out.phase[i]!, deg(re[i]!, im[i]!)) < 1e-9);
});

test("baffle only = a flat 0 dB curve on the baffle", () => {
  const f = frdGrid();
  assert.ok(Math.abs(f[0]! - 10) < 1e-9 && Math.abs(f[f.length - 1]! / 20000 - 1) < 0.01);
  const only = baffleOnlyCurve(f, CONE);
  const flat = applyBaffle({ f, v: f.map(() => 0) }, CONE);
  assert.deepEqual(only.v, flat.v);
  assert.deepEqual(only.phase, flat.phase);
});

test("writeFrd reads back with parseCurve (5 significant figures), header as comments", () => {
  const f = logF(20, 20000, 1.05);
  const out = applyBaffle({ f, v: f.map((x) => 80 + 10 * Math.log10(x)), phase: f.map(() => -30) }, CONE);
  const text = writeFrd(out, baffleFrdHeader(CONE, "L16RN.frd", out.phaseKind));
  assert.ok(text.startsWith("* Baffle 25 x 40 cm, driver 10 cm from left, 12 cm from top\r\n"));
  assert.ok(text.includes("* Driver curve: L16RN.frd (taken as half space)\r\n"));
  assert.ok(text.includes("* Approximate above"));
  const back = parseCurve(text, "spl", 10, { phase: true });
  assert.equal(back.f.length, f.length);
  for (let i = 0; i < f.length; i++) {
    assert.ok(Math.abs(back.f[i]! / f[i]! - 1) < 1e-4);
    assert.ok(Math.abs(back.v[i]! - out.v[i]!) <= 5e-5 * Math.abs(out.v[i]!) + 1e-12);
    assert.ok(Math.abs(back.phase![i]! - out.phase[i]!) <= 5e-5 * Math.abs(out.phase[i]!) + 1e-12);
  }
});

test("parseCurve keeps phase only when asked and every row has it", () => {
  const three = "* x\n20 80 -10\n30 81 -12\n40 82 -14\n";
  assert.equal(parseCurve(three, "spl", 2).phase, undefined);
  assert.deepEqual(parseCurve(three, "spl", 2, { phase: true }).phase, [-10, -12, -14]);
  assert.equal(parseCurve("20 80 -10\n30 81\n40 82 -14\n", "spl", 2, { phase: true }).phase, undefined);
  assert.equal(parseCurve("20 80\n30 81\n", "spl", 2, { phase: true }).phase, undefined);
});

test("trusted-to frequency: cone ka = 2, at most 5 kHz", () => {
  const sd = (mm: number) => Math.PI * (mm / 20) ** 2;
  assert.ok(Math.abs(baffleTrustedTo({ ...OFF, sd_cm2: sd(132) }) - 343 / (Math.PI * 0.066)) < 1e-9);
  assert.equal(baffleTrustedTo({ ...OFF, sd_cm2: sd(30) }), 5000);
  assert.equal(baffleTrustedTo(OFF), 5000);
});
