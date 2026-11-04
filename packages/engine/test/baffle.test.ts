import { test } from "node:test";
import assert from "node:assert/strict";
import { baffleStepDb, baffleStepFrequency } from "../src/baffle.ts";

const SQ = { width: 0.3, height: 0.3, x: 0.15, y: 0.15 };

test("−6 dB well below the step, about 0 dB well above (on average)", () => {
  const [lo] = baffleStepDb([10], SQ);
  assert.ok(Math.abs(lo! + 6.02) < 0.1, `${lo}`);
  const f: number[] = [];
  for (let x = 3000; x < 20000; x *= 1.01) f.push(x);
  const hi = baffleStepDb(f, { ...SQ, sd_cm2: 130 });
  const mean = hi.reduce((a, b) => a + b, 0) / hi.length;
  assert.ok(Math.abs(mean) < 0.5, `mean ${mean}`);
});

test("matches the closed form for a centred source where all edges are equally far", () => {
  // On a square, edges range from 0.15 to 0.21 m; check the first peak lands where the
  // nearest edges' path is half a wavelength (±25 %) and reaches about +3 dB.
  const f: number[] = [];
  for (let x = 400; x < 2000; x *= 1.005) f.push(x);
  const db = baffleStepDb(f, SQ);
  let iMax = 0;
  for (let i = 1; i < db.length; i++) if (db[i]! > db[iMax]!) iMax = i;
  const fPeak = f[iMax]!;
  const expected = 343 / (2 * 0.15 + 2 * (Math.sqrt(0.15 ** 2 + 1) - 1)); // path ≈ d + (√(d²+r²) − r)
  assert.ok(Math.abs(fPeak / expected - 1) < 0.25, `peak at ${fPeak} vs ${expected}`);
  assert.ok(db[iMax]! > 2 && db[iMax]! < 3.6, `peak ${db[iMax]}`);
});

test("wider baffles step lower; an off-centre driver ripples less than a centred one", () => {
  assert.ok(baffleStepFrequency({ width: 0.5, height: 0.5, x: 0.25, y: 0.25 }) < baffleStepFrequency(SQ));
  const f: number[] = [];
  for (let x = 500; x < 4000; x *= 1.01) f.push(x);
  const spread = (db: Float64Array) => Math.max(...db) - Math.min(...db);
  const centred = spread(baffleStepDb(f, { width: 0.25, height: 0.4, x: 0.125, y: 0.2, sd_cm2: 130 }));
  const offset = spread(baffleStepDb(f, { width: 0.25, height: 0.4, x: 0.09, y: 0.14, sd_cm2: 130 }));
  assert.ok(offset < centred, `${offset} vs ${centred}`);
});

test("rejects an empty baffle", () => {
  assert.throws(() => baffleStepDb([100], { width: 0, height: 0.3, x: 0, y: 0 }));
});
