import { test } from "node:test";
import assert from "node:assert/strict";
import { encodeQr } from "../src/qr.ts";

// Decoding was checked separately with OpenCV's QR detectors for 16 link lengths (versions 1–30).

const formatBits = (m: boolean[][]) => {
  let b = 0;
  for (let i = 0; i <= 5; i++) b |= (m[i]![8] ? 1 : 0) << i;
  b |= (m[7]![8] ? 1 : 0) << 6;
  b |= (m[8]![8] ? 1 : 0) << 7;
  b |= (m[8]![7] ? 1 : 0) << 8;
  for (let i = 9; i < 15; i++) b |= (m[8]![14 - i] ? 1 : 0) << i;
  return b;
};

test("version grows with the text, size is 4·version + 17", () => {
  assert.equal(encodeQr("hi").length, 21);
  const link = "https://daliusiv.github.io/speaker-box-genius/#z=" + "a".repeat(300);
  const m = encodeQr(link);
  assert.equal((m.length - 17) % 4, 0);
  assert.ok(m.length > 21);
  assert.throws(() => encodeQr("x".repeat(3000)));
});

test("finder and timing patterns are where they belong", () => {
  const m = encodeQr("https://example.org/");
  const n = m.length;
  for (const [x0, y0] of [[0, 0], [n - 7, 0], [0, n - 7]]) {
    for (let k = 0; k < 7; k++) {
      assert.equal(m[y0!]![x0! + k], true, "finder top edge");
      assert.equal(m[y0! + k]![x0!], true, "finder left edge");
    }
    assert.equal(m[y0! + 3]![x0! + 3], true, "finder centre");
    assert.equal(m[y0! + 1]![x0! + 1], false, "finder ring");
  }
  for (let i = 8; i < n - 8; i++) {
    assert.equal(m[6]![i], i % 2 === 0);
    assert.equal(m[i]![6], i % 2 === 0);
  }
  assert.equal(m[n - 8]![8], true, "dark module");
});

test("format bits carry the error correction level and a valid BCH code", () => {
  for (const [ecl, bits] of [["L", 1], ["M", 0], ["Q", 3], ["H", 2]] as const) {
    const raw = formatBits(encodeQr("Speaker Box Genius", ecl)) ^ 0x5412;
    assert.equal(raw >>> 13, bits, ecl);
    let rem = raw >>> 10;
    for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
    assert.equal(rem & 0x3ff, raw & 0x3ff, `${ecl} BCH`);
  }
});
