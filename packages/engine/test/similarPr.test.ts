import { test } from "node:test";
import assert from "node:assert/strict";
import { BETTER_FACTOR, PR_WEIGHTS, scorePr, type PrLike } from "../src/similar.ts";

// A 15-inch PR.
const R: PrLike = { count: 1, sd_cm2: 855, xmax_mm: 20, mms_g: 150, vas_l: 300 };
const W = PR_WEIGHTS.sd + PR_WEIGHTS.xmax + PR_WEIGHTS.mms + PR_WEIGHTS.vas;

test("the same PR scores 0 and is close", () => {
  assert.deepEqual(scorePr(R, R), { distance: 0, tier: "close" });
});

test("two of half the size compare as one: area, mass and Vas are the group's", () => {
  const half: PrLike = { count: 2, sd_cm2: R.sd_cm2 / 2, xmax_mm: R.xmax_mm, mms_g: R.mms_g / 2, vas_l: R.vas_l / 2 };
  assert.ok(scorePr(R, half).distance < 1e-12);
});

test("twice the area alone is weighted 3 of 8.5", () => {
  const r = scorePr(R, { ...R, sd_cm2: R.sd_cm2 * 2 });
  assert.ok(Math.abs(r.distance - PR_WEIGHTS.sd / W) < 1e-12);
});

test("more travel and a lighter cone count a quarter; less travel and a heavier one in full", () => {
  const more = scorePr(R, { ...R, xmax_mm: 40 }).distance;
  const less = scorePr(R, { ...R, xmax_mm: 10 }).distance;
  assert.ok(Math.abs(more - (BETTER_FACTOR * PR_WEIGHTS.xmax) / W) < 1e-12);
  assert.ok(Math.abs(less - PR_WEIGHTS.xmax / W) < 1e-12);
  const lighter = scorePr(R, { ...R, mms_g: 75 }).distance;
  const heavier = scorePr(R, { ...R, mms_g: 300 }).distance;
  assert.ok(Math.abs(lighter - (BETTER_FACTOR * PR_WEIGHTS.mms) / W) < 1e-12);
  assert.ok(Math.abs(heavier - PR_WEIGHTS.mms / W) < 1e-12);
});

test("tiers follow the driver limits; a missing value is left out", () => {
  assert.equal(scorePr(R, { ...R, sd_cm2: R.sd_cm2 * 1.2 }).tier, "close");
  assert.equal(scorePr(R, { ...R, sd_cm2: R.sd_cm2 * 2 }).tier, "usable");
  assert.equal(scorePr(R, { count: 1, sd_cm2: 200, xmax_mm: 5, mms_g: 600, vas_l: 30 }).tier, "risky");
  const r = scorePr(R, { ...R, vas_l: 0, sd_cm2: R.sd_cm2 * 2 });
  assert.ok(Math.abs(r.distance - PR_WEIGHTS.sd / (W - PR_WEIGHTS.vas)) < 1e-12);
});
