import { cx, div, mul, type Complex } from "./complex.ts";

export type HighPassType = "butterworth" | "linkwitz-riley";

export interface HighPass {
  type: HighPassType;
  /** Butterworth: 1–4. Linkwitz-Riley: 2 or 4. */
  order: number;
  /** Corner frequency (Hz). Butterworth: −3 dB point. Linkwitz-Riley: −6 dB point. */
  freq: number;
}

/**
 * Normalised low-pass prototypes as products of real-coefficient sections,
 * each section given as ascending coefficients [a0, a1, a2] of a0 + a1·p + a2·p².
 */
const BUTTERWORTH: Record<number, number[][]> = {
  1: [[1, 1]],
  2: [[1, Math.SQRT2, 1]],
  3: [
    [1, 1],
    [1, 1, 1],
  ],
  4: [
    [1, 2 * Math.cos((3 * Math.PI) / 8), 1],
    [1, 2 * Math.cos(Math.PI / 8), 1],
  ],
};

function sections(hp: HighPass): number[][] {
  if (hp.type === "butterworth") {
    const s = BUTTERWORTH[hp.order];
    if (!s) throw new RangeError("Butterworth order must be 1–4");
    return s;
  }
  // Linkwitz-Riley = two cascaded Butterworth filters of half the order.
  const half = BUTTERWORTH[hp.order / 2];
  if (!half || hp.order % 2 !== 0) throw new RangeError("Linkwitz-Riley order must be 2 or 4");
  return [...half, ...half];
}

/** Complex response H(jω) of the high-pass filter at frequency f. */
export function highPassResponse(hp: HighPass, f: number): Complex {
  // High-pass from low-pass prototype: substitute p = ωc / s, with s = jω → p = −j·fc/f
  const p = cx(0, -hp.freq / f);
  let h = cx(1);
  for (const c of sections(hp)) {
    let den = cx(0);
    let pk = cx(1);
    for (const a of c) {
      den = { re: den.re + a * pk.re, im: den.im + a * pk.im };
      pk = mul(pk, p);
    }
    h = mul(h, div(cx(1), den));
  }
  return h;
}
