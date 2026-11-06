// Impulse and step response: the frequency response turned into time.
//
// The response is worked out at evenly spaced frequencies up to fMax (Hornresp's 20 kHz)
// and nothing above, then inverse-Fourier-transformed. Like Hornresp's impulse response,
// the result is scaled to a peak of ±1; the step response is the running sum of the
// impulse, scaled the same way.

import type { DriverInput, EnclosureInput } from "./model.ts";
import { simulate, type SimulationOptions } from "./simulate.ts";

export interface TransientOptions {
  /** Samples per second. Default 48000 (Hornresp's). */
  sampleRate?: number;
  /** Samples: a power of two. Default 16384 (0.34 s at 48 kHz). */
  length?: number;
  /** Highest frequency included (Hz); the response is cut off above it. Default 20000. */
  fMax?: number;
  /** Time shown before the impulse arrives (ms). Default 5. */
  pre_ms?: number;
}

export interface TransientResult {
  /** Time of each sample (ms), 0 = the drive. */
  t_ms: Float64Array;
  /** Impulse response, scaled to a peak of ±1. */
  impulse: Float64Array;
  /** Step response (running sum of the impulse), scaled to a peak of ±1. */
  step: Float64Array;
}

/** In-place radix-2 FFT (sign −1 forward, +1 inverse, unscaled). */
export function fft(re: Float64Array, im: Float64Array, sign: 1 | -1): void {
  const n = re.length;
  if (n & (n - 1)) throw new Error("fft length must be a power of two");
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j]!, re[i]!];
      [im[i], im[j]] = [im[j]!, im[i]!];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const a = (sign * 2 * Math.PI) / len;
    const wr = Math.cos(a);
    const wi = Math.sin(a);
    for (let i = 0; i < n; i += len) {
      let cr = 1;
      let ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const p = i + k;
        const q = p + len / 2;
        const xr = re[q]! * cr - im[q]! * ci;
        const xi = re[q]! * ci + im[q]! * cr;
        re[q] = re[p]! - xr;
        im[q] = im[p]! - xi;
        re[p] = re[p]! + xr;
        im[p] = im[p]! + xi;
        const t = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = t;
      }
    }
  }
}

const scaled = (x: Float64Array) => {
  let peak = 0;
  for (const v of x) if (Math.abs(v) > peak) peak = Math.abs(v);
  return peak > 0 ? x.map((v) => v / peak) : x;
};

/** Impulse and step response of a design, from its simulated pressure response (SPL and phase). */
export function transientResponse(driver: DriverInput, box: EnclosureInput, opts: SimulationOptions = {}, t: TransientOptions = {}): TransientResult {
  const fs = t.sampleRate ?? 48000;
  const n = t.length ?? 16384;
  const fTop = Math.min(t.fMax ?? 20000, fs / 2);
  const pre = Math.round(((t.pre_ms ?? 5) / 1000) * fs);
  const bins = Math.floor((fTop * n) / fs);
  const frequencies = Float64Array.from({ length: bins }, (_, i) => ((i + 1) * fs) / n);
  const r = simulate(driver, box, { ...opts, frequencies });
  // Spectrum: nothing at 0 Hz (a speaker can't hold a pressure), the response up to fTop, its
  // mirror image above fs/2 so the result is real, and nothing in between.
  const re = new Float64Array(n);
  const im = new Float64Array(n);
  for (let k = 1; k <= bins; k++) {
    const mag = 10 ** (r.spl[k - 1]! / 20);
    const ph = (r.phaseDeg[k - 1]! * Math.PI) / 180;
    re[k] = mag * Math.cos(ph);
    im[k] = mag * Math.sin(ph);
    if (k < n / 2) {
      re[n - k] = re[k]!;
      im[n - k] = -im[k]!;
    }
  }
  fft(re, im, 1);
  // Circular: negative times sit at the end. Put t = 0 at sample `pre`.
  const x = new Float64Array(n);
  for (let i = 0; i < n; i++) x[i] = re[(i - pre + n) % n]! / n;
  const step = new Float64Array(n);
  let sum = 0;
  for (let i = 0; i < n; i++) step[i] = sum += x[i]!;
  return {
    t_ms: Float64Array.from({ length: n }, (_, i) => ((i - pre) / fs) * 1000),
    impulse: scaled(x),
    step: scaled(step),
  };
}
