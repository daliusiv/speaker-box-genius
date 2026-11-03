/**
 * Room / cabin gain: the low-frequency lift a closed space adds to a speaker's
 * free-space response.
 *
 * Above the transition frequency the space behaves acoustically "large". Below it,
 * once the longest dimension is shorter than half a wavelength, the space acts like
 * a pressure vessel and the bass rises. A sealed car cabin approaches 12 dB/octave;
 * leaky rooms rise more gently. Real spaces leak and absorb, so the lift is capped.
 *
 * This is a simple, widely used approximation, not a room simulation: no modes,
 * no seating position, no boundary interference.
 */

export interface RoomGain {
  /** Transition frequency (Hz) where the lift starts (≈ +3 dB there with the default shape). */
  f0: number;
  /** Asymptotic slope below f0, in dB per octave (6 or 12 are typical). */
  slopeDbPerOct: number;
  /** Ceiling on the lift (dB). */
  maxDb: number;
}

/** Transition frequency of a space whose longest inside dimension is `length_m`: f = c / (2L). */
export function transitionFrequency(length_m: number, c = 343.2): number {
  return c / (2 * length_m);
}

/**
 * Lift (dB) at frequency f: a smooth curve rising at `slopeDbPerOct` below f0, softly
 * limited to `maxDb`. 0 dB well above f0.
 */
export function roomGainDb(f: number, g: RoomGain): number {
  if (!(f > 0) || !(g.f0 > 0) || !(g.slopeDbPerOct > 0)) return 0;
  // 10·log10(1 + (f0/f)^n) has an asymptote of n·3.01 dB/octave below f0.
  const n = g.slopeDbPerOct / (10 * Math.log10(2));
  const lift = 10 * Math.log10(1 + Math.pow(g.f0 / f, n));
  if (!(g.maxDb > 0)) return 0;
  // Soft minimum of lift and the ceiling (≈ −3 dB where they cross).
  return -10 * Math.log10(Math.pow(10, -lift / 10) + Math.pow(10, -g.maxDb / 10));
}
