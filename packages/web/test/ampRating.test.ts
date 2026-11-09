import { test } from "node:test";
import assert from "node:assert/strict";
import { ampLimitsFromRatings, ampPowerInto } from "../src/ampRating.ts";

test("amp limits from ratings: voltage from the higher impedance, current from the lower", () => {
  // Crown XLS 1002: 350 W into 4 Ω, 550 W into 2 Ω.
  const xls = ampLimitsFromRatings([{ watts: 350, ohms: 4 }, { watts: 550, ohms: 2 }])!;
  assert.deepEqual(xls, { volts: 37.4, amps: 16.6 });
  // They give back both ratings (to rounding), and a little under the 8 Ω one (215 W: the supply sags with load).
  assert.ok(Math.abs(ampPowerInto(xls, 4) - 350) < 1);
  assert.ok(Math.abs(ampPowerInto(xls, 2) - 550) < 2);
  assert.ok(Math.abs(ampPowerInto(xls, 8) - 174.8) < 0.1);
  // Order doesn't matter; one rating gives both.
  assert.deepEqual(ampLimitsFromRatings([{ watts: 550, ohms: 2 }, { watts: 350, ohms: 4 }]), xls);
  assert.deepEqual(ampLimitsFromRatings([{ watts: 400, ohms: 4 }]), { volts: 40, amps: 10 });
  // Bridged, from the bridged ratings: 700 W into 8 Ω, 1100 W into 4 Ω.
  assert.deepEqual(ampLimitsFromRatings([{ watts: 700, ohms: 8 }, { watts: 1100, ohms: 4 }]), { volts: 74.8, amps: 16.6 });
  // Blank or nonsense entries are skipped.
  assert.equal(ampLimitsFromRatings([{ watts: 0, ohms: 4 }, { watts: NaN, ohms: 2 }]), null);
  assert.deepEqual(ampLimitsFromRatings([{ watts: 350, ohms: 4 }, { watts: 0, ohms: 2 }]), { volts: 37.4, amps: 9.4 });
});
