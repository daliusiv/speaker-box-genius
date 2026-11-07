import { test } from "node:test";
import assert from "node:assert/strict";
import { roomCurveFrom } from "../src/roomCurve.ts";
import { DEFAULT_STATE, decodeState, encodeState, type AppState } from "../src/state.ts";
import { roomGainOf } from "../src/sim.ts";

test("a hand-made room-gain profile in Hornresp's format reads as it is", () => {
  const c = roomCurveFrom("10, 12\n20, 9\n40, 3\n80, 0\n", "My car.txt");
  assert.deepEqual(c, { name: "My car", f: [10, 20, 40, 80], v: [12, 9, 3, 0] });
});

test("an .frd with a header, comma decimals and a phase column", () => {
  const c = roomCurveFrom("* REW export\nFreq dB Phase\n15\t8,5\t-20\n30\t4,25\t-10\n60\t0\t0\n", "room.frd");
  assert.deepEqual(c.f, [15, 30, 60]);
  assert.deepEqual(c.v, [8.5, 4.25, 0]);
});

test("a long measurement is thinned to 1/12 octave, and bad files say why", () => {
  const lines = Array.from({ length: 2000 }, (_, i) => `${(10 * 2 ** (i / 200)).toFixed(3)} ${(-i / 200).toFixed(3)}`).join("\n");
  const c = roomCurveFrom(lines, "sweep.txt");
  assert.ok(c.f.length < 150 && c.f.length > 100, `${c.f.length} points`);
  assert.throws(() => roomCurveFrom("20 3\n", "one.txt"), /at least 2/);
  assert.throws(() => roomCurveFrom("20 3\n40 90\n", "huge.txt"), /60 dB/);
});

test("a room curve travels in a link, and a broken one turns room gain off", () => {
  const s: AppState = { ...DEFAULT_STATE, roomGain: { ...DEFAULT_STATE.roomGain, mode: "curve", curve: { name: "Car", f: [10, 20, 40], v: [12, 6, 0] } } };
  const back = decodeState(encodeState(s))!;
  assert.deepEqual(back.roomGain, s.roomGain);
  assert.deepEqual(roomGainOf(back), { curve: { f: [10, 20, 40], v: [12, 6, 0] } });
  const raw = JSON.parse(JSON.stringify(s));
  raw.roomGain.curve.f = [40, 20, 10];
  const bad = decodeState(encodeState(raw))!;
  assert.equal(bad.roomGain.mode, "off");
  assert.equal("curve" in bad.roomGain, false);
});
