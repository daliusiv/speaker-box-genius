import { test } from "node:test";
import assert from "node:assert/strict";
import { alignmentSection, readAlignmentChecks } from "./validation.ts";

test("validation page: the ported presets against WinISD's wizard, within its display rounding", () => {
  const r = alignmentSection(readAlignmentChecks());
  assert.equal(r.values, 92);
  assert.ok(r.vbWorst < 0.3, `volume ${r.vbWorst} %`);
  assert.ok(r.fbWorst < 0.15, `tuning ${r.fbWorst} %`);
  assert.match(r.html, /UMII15-22.*not offered/);
});

test("the validation page's sealed presets, Qtc and PR tuning match WinISD within its display rounding", async () => {
  const { paritySection } = await import("./validation.ts");
  const p = paritySection();
  assert.equal(p.values, 16);
  assert.ok(p.worst < 0.12, `worst ${p.worst} %`);
});
