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

// ---------------------------------------------------------------------------
// EQ stages
// ---------------------------------------------------------------------------

export type EqStage =
  /**
   * Linkwitz Transform: cancels a sealed box's (f0, Q0) and replaces it with a
   * new 2nd-order high-pass (fp, Qp). Boosts the bass by (f0/fp)² at DC.
   */
  | { type: "linkwitz"; f0: number; q0: number; fp: number; qp: number }
  /** Parametric peaking EQ (cut or boost at freq, bandwidth set by q). */
  | { type: "peak"; freq: number; gain_db: number; q: number }
  /** Low shelf: gain_db below freq, flat above (q 0.707 = gentle). */
  | { type: "lowshelf"; freq: number; gain_db: number; q: number };

/** Ratio of two quadratics in s = jω: (s² + b1·s + b0) / (s² + a1·s + a0), times k. */
function biquad(w: number, b1: number, b0: number, a1: number, a0: number, k = 1, a2 = 1): Complex {
  const num = cx(b0 - w * w, b1 * w);
  const den = cx(a0 - a2 * w * w, a1 * w);
  return mul(cx(k), div(num, den));
}

export function eqStageResponse(st: EqStage, f: number): Complex {
  const w = 2 * Math.PI * f;
  switch (st.type) {
    case "linkwitz": {
      const w0 = 2 * Math.PI * st.f0;
      const wp = 2 * Math.PI * st.fp;
      return biquad(w, w0 / st.q0, w0 * w0, wp / st.qp, wp * wp);
    }
    case "peak": {
      const w0 = 2 * Math.PI * st.freq;
      const A = 10 ** (st.gain_db / 40);
      return biquad(w, (A / st.q) * w0, w0 * w0, (1 / (A * st.q)) * w0, w0 * w0);
    }
    case "lowshelf": {
      // RBJ analog prototype: A·(s² + (√A/Q)ω0·s + A·ω0²) / (A·s² + (√A/Q)ω0·s + ω0²)
      const w0 = 2 * Math.PI * st.freq;
      const A = 10 ** (st.gain_db / 40);
      const b = (Math.sqrt(A) / st.q) * w0;
      const num = cx(A * w0 * w0 - w * w, b * w);
      const den = cx(w0 * w0 - A * w * w, b * w);
      return mul(cx(A), div(num, den));
    }
  }
}

/** Combined response of several EQ stages. */
export function eqResponse(stages: EqStage[], f: number): Complex {
  let h = cx(1);
  for (const s of stages) h = mul(h, eqStageResponse(s, f));
  return h;
}
