import { test } from "node:test";
import assert from "node:assert/strict";
import { drawWidth, freqTicks, plotHeight } from "../src/chartSize.ts";

test("charts draw at their real width, never under 640", () => {
  assert.equal(drawWidth(358), 640);
  assert.equal(drawWidth(640), 640);
  assert.equal(drawWidth(827.6), 828);
  assert.equal(drawWidth(1468), 1468);
});

test("plot height follows the window, kept between 1.8:1 and 3:1 and 260 to 480", () => {
  // (drawing width, window height) → height, from the approved mockup's sizes.
  const cases: [number, number, number][] = [
    [828, 900, 378], // 1280 × 900, one per row
    [914, 768, 323], // 1366 × 768 laptop
    [988, 900, 378], // 1440 × 900
    [710, 1080, 394], // 1920 × 1080, two per row: held to 1.8:1
    [1468, 1080, 480], // 1920 × 1080, one per row: 3:1 would be 489, capped
    [950, 1440, 480], // 2560 × 1440, two per row
    [640, 600, 260], // a short window: never under 260
  ];
  for (const [w, vh, h] of cases) assert.equal(plotHeight(w, vh), h, `${w} wide in a ${vh} px window`);
});

test("frequency labels thicken as a decade gets more room", () => {
  assert.deepEqual(freqTicks(10, 500, 60).labels, [10, 100]);
  assert.deepEqual(freqTicks(10, 500, 100).labels, [10, 20, 50, 100, 200, 500]);
  assert.deepEqual(freqTicks(10, 500, 200).labels, [10, 20, 30, 50, 100, 200, 300, 500]);
  const wide = freqTicks(10, 500, 400);
  assert.deepEqual(wide.labels, [10, 15, 20, 30, 40, 50, 70, 100, 150, 200, 300, 400, 500]);
  // Faint lines at the unlabelled whole steps only.
  assert.deepEqual(wide.minor, [60, 80, 90, 600, 700, 800, 900].filter((f) => f <= 500));
  assert.deepEqual(freqTicks(20, 20000, 200).labels.slice(-4), [3000, 5000, 10000, 20000]);
});
