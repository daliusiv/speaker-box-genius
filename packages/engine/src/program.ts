import type { LimitKind, SimulationResult } from "./simulate.ts";

/** A sine wave's crest factor (peak ÷ RMS), in dB: 20·log10 √2. Max SPL is sine-equivalent. */
export const SINE_CREST_DB = 20 * Math.log10(Math.SQRT2);

export type Ceilings = SimulationResult["ceilings"];

/**
 * The average SPL a signal with crest factor `crest_dB` (peak ÷ RMS) can reach, per frequency:
 * the limits that hold its average power stay where they are; those that hold its peaks come
 * C − 3.01 dB sooner than for a sine. With C = 3.01 dB (a sine) it is maxSpl exactly.
 * `kind` is the limit that wins, `side` whether it holds the peaks or the average.
 */
export function programEnvelope(c: Ceilings, crest_dB: number): { spl: Float64Array; kind: LimitKind[]; side: ("avg" | "peak" | null)[] } {
  const extra = crest_dB - SINE_CREST_DB;
  const n = c.avgSpl.length;
  const spl = new Float64Array(n);
  const kind: LimitKind[] = [];
  const side: ("avg" | "peak" | null)[] = [];
  for (let i = 0; i < n; i++) {
    const avg = c.avgSpl[i]!;
    const peak = c.peakSpl[i]! - extra;
    if (!Number.isFinite(avg) && !Number.isFinite(peak)) {
      spl[i] = NaN;
      kind.push("none");
      side.push(null);
    } else if (peak < avg) {
      spl[i] = peak;
      kind.push(c.peakKind[i]!);
      side.push("peak");
    } else {
      spl[i] = avg;
      kind.push(c.avgKind[i]!);
      side.push("avg");
    }
  }
  return { spl, kind, side };
}

/** The lowest point of y − ref between band[0] and band[1] Hz (inclusive): its value (dB), frequency and index. Null when no point falls in the band or none is finite. */
export function headroom(freq: ArrayLike<number>, y: ArrayLike<number>, ref: number | ArrayLike<number>, band: readonly [number, number]): { db: number; f: number; i: number } | null {
  let best: { db: number; f: number; i: number } | null = null;
  for (let i = 0; i < freq.length; i++) {
    const f = freq[i]!;
    if (f < band[0] || f > band[1]) continue;
    const r = typeof ref === "number" ? ref : ref[i]!;
    const h = y[i]! - r;
    if (!Number.isFinite(h)) continue;
    if (!best || h < best.db) best = { db: h, f, i };
  }
  return best;
}

/**
 * Headroom split by side, as the app shows it: on the peaks (excursion, port, air, amp volts and
 * current, with the crest factor taken off) and on the average (power ratings), each the lowest in
 * the band with where and what; `overall` is the lower of the two (= the program envelope's).
 */
export function headroomBySide(
  freq: ArrayLike<number>,
  c: Ceilings,
  crest_dB: number,
  ref: number | ArrayLike<number>,
  band: readonly [number, number],
): { peak: (ReturnType<typeof headroom> & { kind: LimitKind }) | null; avg: (ReturnType<typeof headroom> & { kind: LimitKind }) | null; overall: (ReturnType<typeof headroom> & { kind: LimitKind; side: "avg" | "peak" }) | null } {
  const extra = crest_dB - SINE_CREST_DB;
  const peakSpl = Float64Array.from(c.peakSpl, (v) => v - extra);
  const p = headroom(freq, peakSpl, ref, band);
  const a = headroom(freq, c.avgSpl, ref, band);
  const peak = p ? { ...p, kind: c.peakKind[p.i]! } : null;
  const avg = a ? { ...a, kind: c.avgKind[a.i]! } : null;
  const overall = peak && (!avg || peak.db < avg.db) ? { ...peak, side: "peak" as const } : avg ? { ...avg, side: "avg" as const } : null;
  return { peak, avg, overall };
}

/**
 * The upper −6 dB point of a response that falls away above its passband (a bandpass box, a horn,
 * a line's mouth): the first frequency above the peak where it is 6 dB below that peak, with
 * log-frequency interpolation. Null when the response never falls that far above its peak (a
 * sealed or ported box within the chart).
 */
export function upperBandEdge(freq: ArrayLike<number>, spl: ArrayLike<number>): number | null {
  let iPeak = -1;
  for (let i = 0; i < freq.length; i++) if (Number.isFinite(spl[i]!) && (iPeak < 0 || spl[i]! > spl[iPeak]!)) iPeak = i;
  if (iPeak < 0) return null;
  const level = spl[iPeak]! - 6;
  for (let i = iPeak + 1; i < freq.length; i++) {
    if (spl[i]! <= level) {
      const f0 = freq[i - 1]!, f1 = freq[i]!, y0 = spl[i - 1]!, y1 = spl[i]!;
      const t = y0 === y1 ? 0 : (y0 - level) / (y0 - y1);
      return f0 * (f1 / f0) ** t;
    }
  }
  return null;
}
