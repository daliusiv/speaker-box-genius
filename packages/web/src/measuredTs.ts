import type { TsValues } from "@sbg/engine";

/**
 * The driver's T/S values after **Use these values** in Measure from an impedance sweep.
 *
 * The sweep gives Fs, Qms, Qes and Re (and Mms, with an added-mass sweep). Without an added-mass
 * sweep one more value must come from the driver as it was, to fix the moving mass or the
 * compliance. Moving mass is the one to keep: it is glued-together parts and barely changes from
 * sample to sample, with break-in or with temperature, while Vas is the suspension's compliance,
 * which is exactly what makes a measured Fs differ from the datasheet's. Keeping the datasheet's
 * Vas with a measured Fs would give a moving mass that's off by the square of the Fs ratio (24 %
 * lighter for a sample with Fs 15 % high) and a Vas that's still the old suspension's.
 *
 * So the previous Mms (typed, or worked out from the previous values) is kept when the cone area is
 * known (Vas then follows from Fs, Mms and Sd); otherwise the previous Vas is kept, as before.
 *
 * @param prev the driver's values as entered before the measurement
 * @param prevMms its moving mass as solved (entered or derived), g
 * @param measured what the measurement gives (Mms when it had an added-mass sweep)
 */
export function measuredTs(prev: TsValues, prevMms: number | undefined, measured: TsValues): TsValues {
  const keep: TsValues = {};
  if (measured.mms_g === undefined) {
    if (prevMms !== undefined && Number.isFinite(prevMms) && prevMms > 0 && measured.sd_cm2 !== undefined) keep.mms_g = Number(prevMms.toFixed(2));
    else if (prev.vas_l !== undefined) keep.vas_l = prev.vas_l;
  }
  return { ...keep, ...measured };
}
