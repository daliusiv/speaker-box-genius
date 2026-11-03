import { test } from "node:test";
import assert from "node:assert/strict";
import { bestPrTuning, evaluateTuning, BUMP_LIMIT } from "../src/prtuning.ts";
import { qb3Alignment } from "../src/alignments.ts";

// A 10" subwoofer-like driver and a 10"-class PR with plenty of travel (as in the finder tests).
const DRV = { fs: 30, qms: 5.2, qes: 0.4, vas_l: 50, re: 3.4, sd_cm2: 330, xmax_mm: 12, pe_w: 250 };
const MATCH = { mms_g: 90, sd_cm2: 350, xmax_mm: 15, vas_l: 80, qms: 6 };
const SMALL = { mms_g: 15, sd_cm2: 130, xmax_mm: 6, vas_l: 10, qms: 6 };

test("flat: no bump, PR within travel, and lower F3 than a clearly over- or under-tuned box", () => {
  const r = bestPrTuning(DRV, { goal: "flat", vb_l: 50, pr: MATCH, count: 2 });
  const b = r.best!;
  assert.ok(b, r.reason ?? "");
  assert.ok(b.bump_db <= BUMP_LIMIT.flat + 1e-9);
  assert.ok(b.prUse <= 1);
  assert.ok(b.massRatio <= 3);
  // Any feasible flat tuning nearby is no deeper.
  for (const k of [0.6, 0.8, 1.25, 1.6]) {
    const p = evaluateTuning(DRV, { pr: MATCH, count: 2 }, 50, b.addedMass_g * k);
    if (p.feasible && p.bump_db <= BUMP_LIMIT.flat && p.f3 !== null) assert.ok(p.f3 >= b.f3! - 0.15, `×${k}: ${p.f3} < ${b.f3}`);
  }
});

test("deep goes at least as low as flat, with at most 1 dB of bump", () => {
  const flat = bestPrTuning(DRV, { goal: "flat", vb_l: 50, pr: MATCH, count: 2 }).best!;
  const deep = bestPrTuning(DRV, { goal: "deep", vb_l: 50, pr: MATCH, count: 2 }).best!;
  assert.ok(deep.f3! <= flat.f3! + 1e-6);
  assert.ok(deep.bump_db <= 1 + 1e-9);
});

test("flat lands near the classic flat vented alignment's tuning for the same box", () => {
  // A PR with no added mass limit issues behaves much like a port; QB3-ish box for this driver.
  // A very soft PR (huge Vas) acts like a port, so its flattest tuning should be close to QB3's Fb.
  const a = qb3Alignment({ fs: 30, qms: 5.2, qes: 0.4, vas_l: 50 })!;
  assert.ok(a);
  const r = bestPrTuning(DRV, { goal: "flat", vb_l: a.vb_l, pr: { ...MATCH, vas_l: 100000, xmax_mm: 40 }, count: 2, maxMassRatio: 20 }).best!;
  assert.ok(r, "no answer");
  assert.ok(Math.abs(r.fb / a.fb - 1) < 0.15, `Fb ${r.fb} vs QB3 ${a.fb}`);
});

test("a PR that runs out of travel: no answer, the reason says so, and more PRs or a bigger box are offered", () => {
  const r = bestPrTuning(DRV, { goal: "deep", vb_l: 50, pr: SMALL, count: 1 });
  assert.equal(r.best, null);
  assert.match(r.reason!, /out of travel/);
  assert.ok(r.fixes.length > 0);
  const more = r.fixes.find((f) => f.patch.count);
  if (more) assert.ok(bestPrTuning(DRV, { goal: "deep", vb_l: 50, pr: SMALL, count: more.patch.count! }).best);
});

test("smallest box reaches the target F3, and a slightly smaller box doesn't", () => {
  const r = bestPrTuning(DRV, { goal: "smallest", vb_l: 50, pr: MATCH, count: 2, targetF3: 32 });
  const b = r.best!;
  assert.ok(b, r.reason ?? "");
  assert.ok(b.f3! <= 32 + 1e-6);
  const smaller = bestPrTuning(DRV, { goal: "deep", vb_l: b.vb_l * 0.85, pr: MATCH, count: 2 }).best;
  assert.ok(smaller === null || smaller.f3! > 32, `85 % box reaches ${smaller?.f3}`);
});

test("an impossible target says how far the biggest box gets", () => {
  const r = bestPrTuning(DRV, { goal: "smallest", vb_l: 50, pr: MATCH, count: 2, targetF3: 8 });
  assert.equal(r.best, null);
  assert.match(r.reason!, /deepest this driver gets|can't reach/);
});
