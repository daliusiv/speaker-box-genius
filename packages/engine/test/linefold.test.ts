import { test } from "node:test";
import assert from "node:assert/strict";
import { foldLine, lineAreaAt } from "../src/linefold.ts";

const STRAIGHT = [{ length_cm: 240, startArea_cm2: 200, endArea_cm2: 200 }];

test("a straight line: the folded path is as long as the line, and the box adds up", () => {
  for (const folds of [0, 1, 2, 3]) {
    const f = foldLine({ segments: STRAIGHT, width: 200, folds, wall: 18, driverAt_mm: 300 });
    const n = folds + 1;
    assert.equal(f.runs.length, n);
    // Each run is 100 mm deep (200 cm² over 200 mm).
    for (const r of f.runs) assert.ok(Math.abs(r.depth - 100) < 1e-6);
    // Path = Σ straight parts + Σ steps.
    const straight = n * f.inside.height - f.gaps.reduce((a, g) => a + g, 0);
    const steps = (n - 1) * (100 + 18);
    assert.ok(Math.abs(straight + steps - 2400) < 0.5, `${folds} folds: ${straight + steps}`);
    assert.ok(Math.abs(f.inside.depth - (n * 100 + (n - 1) * 18)) < 1e-6);
    assert.equal(f.outside.width, 236);
    assert.equal(f.cut.panels.filter((p) => p.name.startsWith("Divider")).length, folds);
    // Runs cover the whole line in order.
    assert.equal(f.runs[0]!.from, 0);
    assert.ok(Math.abs(f.runs.at(-1)!.to - 2400) < 0.5);
  }
});

test("a tapered line: deeper runs near the wide end; fold gaps match the local depth", () => {
  const seg = [{ length_cm: 240, startArea_cm2: 300, endArea_cm2: 100, taper: "linear" as const }];
  const f = foldLine({ segments: seg, width: 200, folds: 2, wall: 18, driverAt_mm: 200 });
  assert.ok(f.runs[0]!.depth > f.runs[1]!.depth && f.runs[1]!.depth > f.runs[2]!.depth);
  f.gaps.forEach((g, k) => assert.ok(Math.abs(g - lineAreaAt(seg, f.runs[k]!.to) / 200) < 1e-6));
});

test("driver position, mouth side and warnings", () => {
  const f = foldLine({ segments: STRAIGHT, width: 200, folds: 1, wall: 18, driverAt_mm: 200, driverCutout: 145 });
  assert.equal(f.driverFromTop, 218);
  assert.equal(f.mouth.at, "top"); // two runs: down then up
  assert.ok(f.cut.holes.some((h) => h.name === "Mouth opening"));
  assert.deepEqual(f.warnings, []);
  const far = foldLine({ segments: STRAIGHT, width: 200, folds: 3, wall: 18, driverAt_mm: 1500, driverCutout: 145 });
  assert.ok(far.warnings.some((w) => /first run/.test(w)));
  const wide = foldLine({ segments: STRAIGHT, width: 120, folds: 1, wall: 18, driverAt_mm: 200, driverCutout: 145 });
  assert.ok(wide.warnings.some((w) => /wider than the line/.test(w)));
});

test("tapped horn: the driver sits on the divider between the rear's run and the tap's run, lined up", () => {
  const segs = [{ length_cm: 300, startArea_cm2: 400, endArea_cm2: 1200 }];
  const base = { segments: segs, width: 400, folds: 2, wall: 18, driverAt_mm: 300, driverCutout: 230 };
  const first = foldLine({ ...base, tap_mm: 1500 });
  assert.ok(first.tapLinedUp_mm !== undefined);
  const lined = foldLine({ ...base, tap_mm: first.tapLinedUp_mm! });
  assert.equal(lined.driverOnDivider?.index, 0);
  const hole = lined.cut.holes.find((h) => h.name === "Driver cutout")!;
  assert.match(hole.where, /^Divider 1/);
  assert.ok(!lined.warnings.some((w) => /different heights/.test(w)), lined.warnings.join(" | "));
  // Same height either side of the divider.
  assert.ok(Math.abs(lined.driverOnDivider!.fromTop - (18 + 300)) < 6, `${lined.driverOnDivider!.fromTop}`);
  // A tap two runs away can't work.
  const far = foldLine({ ...base, tap_mm: 2800 });
  assert.ok(far.warnings.some((w) => /neighbouring runs/.test(w)));
});
