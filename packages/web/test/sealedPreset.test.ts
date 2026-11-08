import { test } from "node:test";
import assert from "node:assert/strict";
import { sealedPreset, SEALED_MAX_VAS } from "../src/presets.ts";

test("sealed preset: Qtc 0.707 for ordinary drivers, twice Vas and a higher Qtc when Qts is close to 0.707", () => {
  // Qts 0.35: Qtc 0.707 needs Vas / ((0.707/0.35)² − 1) ≈ 0.43 × Vas.
  const low = sealedPreset({ qms: 5, qes: 0.376, vas_l: 50 }, 1)!;
  assert.equal(low.name, "Qtc 0.707");
  assert.ok(low.vb_l > 15 && low.vb_l < 30);
  // Qts 0.68 would need about 13 × Vas.
  const hi = sealedPreset({ qms: 6, qes: 0.767, vas_l: 100 }, 1)!;
  assert.equal(hi.vb_l, SEALED_MAX_VAS * 100);
  assert.equal(hi.name, `Qtc ${(0.68 * Math.sqrt(1.5)).toFixed(2)}`);
  assert.equal(sealedPreset({ qms: 6, qes: 0.767, vas_l: 100 }, 2)!.vb_l, 400);
  // Above 0.707 there's no sealed preset.
  assert.equal(sealedPreset({ qms: 5, qes: 0.9, vas_l: 50 }, 1), null);
});
