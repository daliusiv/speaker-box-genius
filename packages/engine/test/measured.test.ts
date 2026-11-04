import { test } from "node:test";
import assert from "node:assert/strict";
import { levelMatch, parseCurve, resampleCurve, thinCurve } from "../src/measured.ts";

const frd = ["* REW measurement", "* Freq(Hz) SPL(dB) Phase(degrees)", ...Array.from({ length: 400 }, (_, i) => {
  const f = 10 * 2 ** (i / 40);
  return `${f.toFixed(3)} ${(-6 + 3 * Math.sin(i / 20)).toFixed(3)} ${(-90 + i).toFixed(1)}`;
})].join("\r\n");

test("frd: header lines skipped, negative dB kept, sorted", () => {
  const c = parseCurve(frd, "spl");
  assert.equal(c.f.length, 400);
  assert.ok(c.v.some((v) => v < 0));
  assert.ok(c.f.every((f, i) => i === 0 || f > c.f[i - 1]!));
});

test("European CSV and impedance needs positive ohms", () => {
  const csv = Array.from({ length: 20 }, (_, i) => `${10 + i},5;${(6 + i / 10).toFixed(2).replace(".", ",")};0`).join("\n");
  const z = parseCurve(csv, "impedance");
  assert.equal(z.f[0], 10.5);
  assert.equal(z.v[0], 6);
  assert.throws(() => parseCurve("1 2\n3 4", "spl"), /at least 10 lines/);
});

test("thinning to 1/24 octave: averages, smaller, the shape kept", () => {
  const c = parseCurve(frd, "spl");
  const t = thinCurve(c, 24);
  assert.ok(t.f.length < c.f.length && t.f.length > 200, `${t.f.length}`);
  const back = resampleCurve(t, c.f);
  let worst = 0;
  for (let i = 5; i < c.f.length - 5; i++) worst = Math.max(worst, Math.abs(back[i]! - c.v[i]!));
  assert.ok(worst < 0.1, `worst ${worst}`);
});

test("resample: NaN outside the measured range; level match", () => {
  const c = { f: [20, 40, 80, 160], v: [70, 80, 85, 85] };
  const r = resampleCurve(c, [10, 20, 28.28, 160, 200]);
  assert.ok(Number.isNaN(r[0]!) && Number.isNaN(r[4]!));
  assert.equal(r[1], 70);
  assert.ok(Math.abs(r[2]! - 75) < 0.01);
  const freq = [40, 60, 80, 120, 160];
  const sim = [90, 92.9, 95, 95, 95];
  const off = levelMatch(c, freq, sim, 40, 160);
  assert.ok(off !== null && Math.abs(off - 10) < 0.2, `${off}`);
});
