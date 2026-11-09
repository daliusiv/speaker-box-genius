/**
 * An amplifier's output limits from its datasheet ratings. A power rating into a resistor is
 * a voltage (√(P·R)) and a current (√(P/R)) at once; an amplifier tops out at a voltage set by
 * its supply and a current set by its output stage and protection. Into higher impedances it
 * runs out of voltage first, into the lowest it's rated for, of current. So the voltage limit
 * comes from the higher-impedance rating and the current limit from the lower one: a Crown
 * XLS 1002 (350 W into 4 Ω, 550 W into 2 Ω) is 37.4 V and 16.6 A, which give back both
 * ratings. With one rating, both come from it.
 *
 * The supply sags with load, so the voltage into higher impedances is often a little more
 * than this (the XLS 1002's 215 W into 8 Ω is 41.5 V): a limit taken from a 4 Ω rating is
 * the conservative one for a subwoofer.
 */
export interface AmpRating {
  watts: number;
  ohms: number;
}

export function ampLimitsFromRatings(ratings: AmpRating[]): { volts: number; amps: number } | null {
  const ok = ratings.filter((r) => Number.isFinite(r.watts) && Number.isFinite(r.ohms) && r.watts > 0 && r.ohms > 0);
  if (ok.length === 0) return null;
  const high = ok.reduce((a, b) => (b.ohms > a.ohms ? b : a));
  const low = ok.reduce((a, b) => (b.ohms < a.ohms ? b : a));
  const round = (x: number) => Math.round(x * 10) / 10;
  return { volts: round(Math.sqrt(high.watts * high.ohms)), amps: round(Math.sqrt(low.watts / low.ohms)) };
}

/** The power the limits allow into a resistor: the lower of V²/R and I²·R. */
export function ampPowerInto(limits: { volts: number; amps: number }, ohms: number): number {
  return Math.min(limits.volts ** 2 / ohms, limits.amps ** 2 * ohms);
}
