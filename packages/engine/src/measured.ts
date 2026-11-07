/**
 * Measured curves to overlay on the simulation: a frequency response (.frd: Hz, dB, phase)
 * or an impedance sweep (.zma: Hz, ohms, phase), from REW, ARTA, DATS, VituixCAD, etc.
 *
 * Curves are thinned to fixed log-spaced bins (averaging the points in each), which keeps
 * them small enough to travel in a share link and lightly smooths a raw measurement.
 */

export type CurveKind = "spl" | "impedance";

export interface Curve {
  /** Hz, increasing. */
  f: number[];
  /** dB (spl) or ohms (impedance). */
  v: number[];
}

/**
 * Parse two or more numeric columns (frequency first). Accepts spaces, tabs, commas or
 * semicolons as separators and comma decimals ("20,0;-3,5"). Lines that don't start with
 * a number (headers, "*" comments) are skipped. Impedance values must be positive; SPL
 * values may be anything (relative measurements are often negative).
 */
export function parseCurve(text: string, kind: CurveKind, minRows = 10): Curve {
  const rows: [number, number][] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!/^[-+]?\.?\d/.test(line)) continue;
    let tokens: string[];
    if (/[;\t]/.test(line)) tokens = line.split(/[;\t]+/);
    else if (/\s/.test(line)) tokens = line.split(/\s+/);
    else tokens = line.split(",");
    const nums = tokens.map((t) => Number(t.trim().replace(",", "."))).filter((x) => Number.isFinite(x));
    if (nums.length < 2 || !(nums[0]! > 0)) continue;
    if (kind === "impedance" && !(nums[1]! > 0)) continue;
    rows.push([nums[0]!, nums[1]!]);
  }
  if (rows.length < minRows) throw new Error(`Couldn't find a ${kind === "spl" ? "frequency response" : "impedance sweep"}: need at least ${minRows} lines of frequency and ${kind === "spl" ? "dB" : "ohms"}`);
  rows.sort((a, b) => a[0] - b[0]);
  return { f: rows.map((r) => r[0]), v: rows.map((r) => r[1]) };
}

/**
 * Average into log-spaced bins (`perOctave` per octave) between fMin and fMax. Empty bins
 * are skipped. Values rounded to 0.01 dB / 0.01 Ω, frequencies to 4 significant figures.
 */
export function thinCurve(c: Curve, perOctave = 24, fMin = 5, fMax = 20000): Curve {
  const f: number[] = [];
  const v: number[] = [];
  const lo = Math.max(fMin, c.f[0]!);
  const hi = Math.min(fMax, c.f[c.f.length - 1]!);
  if (!(hi > lo)) return { f: [], v: [] };
  const n = Math.ceil(Math.log2(hi / lo) * perOctave);
  let j = 0;
  for (let b = 0; b < n; b++) {
    const a = lo * 2 ** (b / perOctave);
    const z = lo * 2 ** ((b + 1) / perOctave);
    let sf = 0;
    let sv = 0;
    let k = 0;
    while (j < c.f.length && c.f[j]! < a) j++;
    while (j < c.f.length && (c.f[j]! < z || (b === n - 1 && c.f[j]! <= z))) {
      sf += Math.log(c.f[j]!);
      sv += c.v[j]!;
      k++;
      j++;
    }
    if (k === 0) continue;
    f.push(Number(Math.exp(sf / k).toPrecision(4)));
    v.push(Math.round((sv / k) * 100) / 100);
  }
  return { f, v };
}

/** The curve on another frequency grid (linear in log f); NaN outside the measured range. */
export function resampleCurve(c: Curve, freqs: ArrayLike<number>): Float64Array {
  const out = new Float64Array(freqs.length);
  let j = 0;
  for (let i = 0; i < freqs.length; i++) {
    const x = freqs[i]!;
    if (c.f.length < 2 || x < c.f[0]! || x > c.f[c.f.length - 1]!) {
      out[i] = NaN;
      continue;
    }
    while (j < c.f.length - 2 && c.f[j + 1]! < x) j++;
    if (c.f[j]! > x) j = 0;
    while (j < c.f.length - 2 && c.f[j + 1]! < x) j++;
    const t = Math.log(x / c.f[j]!) / Math.log(c.f[j + 1]! / c.f[j]!);
    out[i] = c.v[j]! + (c.v[j + 1]! - c.v[j]!) * t;
  }
  return out;
}

/**
 * dB to add to a measured response so it matches a simulated one on average over [lo, hi]
 * (where both exist). Null if they don't overlap there.
 */
export function levelMatch(c: Curve, freq: ArrayLike<number>, spl: ArrayLike<number>, lo: number, hi: number): number | null {
  const m = resampleCurve(c, freq);
  let s = 0;
  let k = 0;
  for (let i = 0; i < freq.length; i++) {
    const f = freq[i]!;
    if (f < lo || f > hi || !Number.isFinite(m[i]!) || !Number.isFinite(spl[i]!)) continue;
    s += spl[i]! - m[i]!;
    k++;
  }
  return k >= 3 ? Math.round((s / k) * 10) / 10 : null;
}
