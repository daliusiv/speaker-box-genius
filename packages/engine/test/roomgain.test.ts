import { test } from "node:test";
import assert from "node:assert/strict";
import { roomGainDb, transitionFrequency } from "../src/roomgain.ts";

const near = (a: number, b: number, tol: number, what: string) => assert.ok(Math.abs(a - b) <= tol, `${what}: ${a} vs ${b}`);

test("transition frequency is c / 2L", () => {
  near(transitionFrequency(2.5), 68.64, 0.01, "2.5 m");
  near(transitionFrequency(5, 340), 34, 1e-9, "5 m");
});

test("no lift well above the transition, about +3 dB at it", () => {
  const g = { f0: 60, slopeDbPerOct: 12, maxDb: 40 };
  near(roomGainDb(600, g), 0, 0.01, "10× f0");
  near(roomGainDb(60, g), 3.01, 0.05, "at f0");
});

test("asymptotic slope below the transition matches the setting", () => {
  for (const slope of [6, 12]) {
    const g = { f0: 80, slopeDbPerOct: slope, maxDb: 200 };
    near(roomGainDb(0.5, g) - roomGainDb(1, g), slope, 0.02, `${slope} dB/oct`);
  }
});

test("lift is capped smoothly at the ceiling and never exceeds it", () => {
  const g = { f0: 60, slopeDbPerOct: 12, maxDb: 18 };
  let prev = -Infinity;
  for (let f = 500; f >= 2; f /= 1.1) {
    const v = roomGainDb(f, g);
    assert.ok(v <= 18 + 1e-9, `≤ cap at ${f}`);
    assert.ok(v >= prev - 1e-9, `monotonic at ${f}`);
    prev = v;
  }
  near(roomGainDb(1, g), 18, 0.01, "deep bass reaches the cap");
});

test("bad input gives no lift", () => {
  assert.equal(roomGainDb(50, { f0: 0, slopeDbPerOct: 12, maxDb: 18 }), 0);
  assert.equal(roomGainDb(50, { f0: 60, slopeDbPerOct: 12, maxDb: 0 }), 0);
});

test("a room-gain profile of your own: its points, straight lines in log f between, the end values beyond", () => {
  const g = { curve: { f: [10, 20, 40, 80], v: [12, 9, 3, 0] } };
  near(roomGainDb(20, g), 9, 1e-12, "a point");
  near(roomGainDb(Math.sqrt(20 * 40), g), 6, 1e-9, "halfway in log f");
  near(roomGainDb(5, g), 12, 1e-12, "below the first point");
  near(roomGainDb(500, g), 0, 1e-12, "above the last point");
  assert.equal(roomGainDb(30, { curve: { f: [], v: [] } }), 0);
});

test("the ceiling never takes level away: 0 dB (not below) far above the transition, for a car or a room", () => {
  for (const g of [{ f0: 68.6, slopeDbPerOct: 12, maxDb: 18 }, { f0: 34.3, slopeDbPerOct: 6, maxDb: 10 }, { f0: 50, slopeDbPerOct: 12, maxDb: 3 }]) {
    for (const f of [200, 500, 1000, 5000]) {
      const v = roomGainDb(f, g);
      const raw = 10 * Math.log10(1 + (g.f0 / f) ** (g.slopeDbPerOct / (10 * Math.log10(2))));
      assert.ok(v >= 0 && v <= raw + 1e-9, `${JSON.stringify(g)} at ${f} Hz: ${v} (uncapped ${raw})`);
    }
    // Still lifts to within a hair of the ceiling deep down.
    assert.ok(Math.abs(roomGainDb(1, g) - g.maxDb) < 0.2, `${roomGainDb(1, g)}`);
  }
});
