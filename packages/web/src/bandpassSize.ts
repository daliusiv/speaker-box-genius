/**
 * Sizing a bandpass box for a driver: a small search within a volume budget, used by the
 * app's "Size this bandpass box" (and "Size all boxes") and by the design assistant.
 *
 * - 4th order (sealed rear, ported front): the rear chamber as a sealed box of Qtc 0.5–1
 *   (resonance fc), the front chamber 0.3–1.6 × the rear, tuned 0.6–1.35 × fc.
 * - 6th order, parallel (both chambers ported to the outside): 70 % or all of the budget,
 *   split 35/50/65 % between the chambers, the rear tuned 0.65–1 × Fs, the front 1.2–2.5 × Fs.
 *
 * Kept: a band (−3 dB from its own peak) up to at least 80 Hz (to cross to the main
 * speakers) and at least 1.8 × its low edge, with under 3 dB of ripple. Of those, the lowest
 * low edge (or the most output at a frequency, for "loud"); among the best few, the first
 * that stays within its limits with a plain, flared or slotted port in each chamber (all the
 * sound leaves through the ports, so their air speed is usually the limit), else the one
 * that stays within them to the most power.
 */
import { sealedVolumeForAlignment, type Air, type AlignmentDriver, type SimulationResult } from "@sbg/engine";
import { portCandidates, portSpeedFor, chamberPortFields, type AssistantPort } from "./ports.ts";
import type { Limits } from "./sim.ts";
import type { BandpassDesign } from "./state.ts";

export type BandpassOrder = "4" | "6p";

export interface BandpassSearch {
  orders: BandpassOrder[];
  /** Port end correction (× equivalent diameter) the ports are cut for; default 0.732. */
  endCorrection?: number;
  /** Both chambers together (L). */
  maxVolume_l: number;
  drivers: number;
  /** "low": the lowest band edge; "loud": the most output at loudAt_hz. */
  priority: "low" | "loud";
  loudAt_hz?: number;
  /** The band's low edge may not be above this (Hz). */
  maxF3_hz?: number;
  /** The chuffing line, in the same convention as the simulation's port speeds. */
  portLimit: number;
  /** Room or cabin gain in the simulation (dB at f), left out of the ripple. */
  roomDb?: (f: number) => number;
}

export interface BandpassFound {
  order: BandpassOrder;
  /** `base` with the chambers, ports and tunings found. */
  design: BandpassDesign;
  result: SimulationResult;
  f3: number;
  f3High: number;
  /** The band's peak over a plain cone (dB). */
  gain_db: number;
  ripple_db: number;
  frontPort: AssistantPort;
  rearPort?: AssistantPort;
  /** Within every limit (cone, PR, each port's air speed). */
  within: boolean;
  /** Drive scale (amplitude, ≤ 1) that keeps every limit. */
  safe: number;
  /** Output at loudAt_hz (dB), limited by the maximum SPL. */
  loud: number;
}

const r1 = (v: number) => Math.round(v * 10) / 10;

/** The value of `y` at frequency `f` (linear in log f). */
function at(freq: Float64Array, y: Float64Array, f: number): number {
  if (f <= freq[0]!) return y[0]!;
  for (let i = 1; i < freq.length; i++) {
    if (freq[i]! >= f) {
      const t = Math.log(f / freq[i - 1]!) / Math.log(freq[i]! / freq[i - 1]!);
      return y[i - 1]! + t * (y[i]! - y[i - 1]!);
    }
  }
  return y[y.length - 1]!;
}

const peakAbove = (a: Float64Array | null | undefined, freq: Float64Array, fMin: number) => {
  if (!a) return 0;
  let m = 0;
  for (let i = 0; i < a.length; i++) if (freq[i]! >= fMin && a[i]! > m) m = a[i]!;
  return m;
};

/** Peak-to-peak ripple (dB) across a band, between its −3 dB edges, a little inside them. */
export function bandRipple(r: SimulationResult, roomDb?: (f: number) => number): number {
  const lo = (r.summary.f3 ?? 10) * 1.15;
  const hi = (r.summary.f3High ?? 300) / 1.15;
  let mn = Infinity;
  let mx = -Infinity;
  for (let i = 0; i < r.freq.length; i++) {
    if (r.freq[i]! < lo || r.freq[i]! > hi) continue;
    const v = r.spl[i]! - (roomDb ? roomDb(r.freq[i]!) : 0);
    mn = Math.min(mn, v);
    mx = Math.max(mx, v);
  }
  return Number.isFinite(mx) ? mx - mn : 0;
}

/**
 * The best bandpass box of each order asked for, within the budget; an order is missing when
 * nothing in its search makes a usable band. `run` simulates a design; `grade` returns its
 * limits (as the app shows them).
 */
export function sizeBandpass(
  base: BandpassDesign,
  align: AlignmentDriver,
  air: Air,
  search: BandpassSearch,
  run: (d: BandpassDesign) => SimulationResult,
  grade: (r: SimulationResult) => Limits,
): Partial<Record<BandpassOrder, BandpassFound>> {
  const qts = (align.qms * align.qes) / (align.qms + align.qes);
  const max = search.maxVolume_l;
  type Args = [BandpassOrder, number, number, number, number | undefined];
  const KINDS = ["straight", "flared", "slot"] as const;
  /** The port of `kind` for a chamber (else the first that fits). */
  const portFor = (vol: number, fb: number, kind: (typeof KINDS)[number]) => {
    const c = portCandidates(vol, fb, air, null, search.endCorrection);
    return c.find((p) => p.kind === kind) ?? c[0] ?? null;
  };
  const score = (t: BandpassFound) => (search.priority === "loud" ? -t.loud : t.f3);

  const tryOne = (args: Args, kind: (typeof KINDS)[number] = "straight"): BandpassFound | null => {
    const [order, rear, front, frontFb, rearFb] = args;
    const fp = portFor(front, frontFb, kind);
    const rp = order === "6p" && rearFb ? portFor(rear, rearFb, kind) : null;
    if (!fp || (order === "6p" && !rp)) return null;
    const design: BandpassDesign = {
      ...base,
      order,
      vb_l: r1(rear),
      frontVb_l: r1(front),
      frontOpening: "port",
      rearOpening: "port",
      front: chamberPortFields(fp, frontFb, base.front),
      rear: rp && rearFb ? chamberPortFields(rp, rearFb, base.rear) : base.rear,
    };
    const r = run(design);
    const { f3, f3High, bandPeakSpl } = r.summary;
    if (f3 === null || f3High === null || f3High === undefined || bandPeakSpl === undefined) return null;
    if (f3High < 80 || f3High < 1.8 * f3 || (search.maxF3_hz !== undefined && f3 > search.maxF3_hz)) return null;
    const ripple = bandRipple(r, search.roomDb);
    if (ripple > 3) return null;
    const lim = grade(r);
    // Each port's air speed as it counts (a flared port's throat may not run too fast either).
    const vFront = portSpeedFor(fp, peakAbove(r.portVelocity, r.freq, 15));
    const vRear = rp ? portSpeedFor(rp, peakAbove(r.rearPortVelocity, r.freq, 15)) : 0;
    const portRatio = Math.max(vFront, vRear) / search.portLimit;
    const others = lim.over.filter((k) => k !== "port");
    const within = others.length === 0 && portRatio <= 1;
    return {
      order,
      design,
      result: r,
      f3,
      f3High,
      gain_db: r1(bandPeakSpl - r.summary.referenceSpl),
      ripple_db: r1(ripple),
      frontPort: fp,
      ...(rp ? { rearPort: rp } : {}),
      within,
      safe: Math.min(lim.safeScale, 1 / Math.max(portRatio, 1e-9), 1),
      loud: search.loudAt_hz ? Math.min(at(r.freq, r.spl, search.loudAt_hz), at(r.freq, r.maxSpl, search.loudAt_hz)) : 0,
      args,
    } as BandpassFound & { args: Args };
  };

  const best = (all: (BandpassFound | null)[]) => {
    const top = all.filter((t): t is BandpassFound => t !== null).sort((a, b) => score(a) - score(b)).slice(0, 8);
    let safest: BandpassFound | null = null;
    for (const t of top) {
      const args = (t as BandpassFound & { args: Args }).args;
      for (const v of [t, ...(t.within ? [] : KINDS.slice(1).map((k) => tryOne(args, k)))]) {
        if (!v) continue;
        if (v.within) return v;
        if (!safest || v.safe > safest.safe) safest = v;
      }
    }
    return safest;
  };

  const out: Partial<Record<BandpassOrder, BandpassFound>> = {};
  if (search.orders.includes("4")) {
    const tries: (BandpassFound | null)[] = [];
    for (const qtc of [0.5, 0.6, 0.7, 0.85, 1]) {
      if (qtc < qts * 1.1) continue;
      const rear = sealedVolumeForAlignment(align, qtc, search.drivers);
      if (rear === null || !(rear > 0.3) || rear > 0.75 * max) continue;
      const fc = (align.fs * qtc) / qts;
      for (const k of [0.3, 0.5, 0.75, 1.1, 1.6]) {
        const front = Math.min(k * rear, max - rear);
        if (front < 0.3) continue;
        for (const m of [0.6, 0.75, 0.9, 1.1, 1.35]) tries.push(tryOne(["4", rear, front, m * fc, undefined]));
      }
    }
    const b = best(tries);
    if (b) out["4"] = b;
  }
  if (search.orders.includes("6p")) {
    const tries: (BandpassFound | null)[] = [];
    for (const total of [0.7 * max, max]) {
      for (const share of [0.35, 0.5, 0.65]) {
        const rear = share * total;
        for (const rf of [0.65, 0.8, 1]) for (const ff of [1.2, 1.5, 1.9, 2.5]) tries.push(tryOne(["6p", rear, total - rear, ff * align.fs, rf * align.fs]));
      }
    }
    const b = best(tries);
    if (b) out["6p"] = b;
  }
  return out;
}
