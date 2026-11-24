import { headroomBySide, programEnvelope, SINE_CREST_DB, upperBandEdge, type LimitKind, type SimulationResult } from "@sbg/engine";

/** The Max SPL chart's signal (Settings → `signal`). Off: a steady sine, as WinISD and Hornresp. */
export type ProgramSignal = {
  /** On: Max SPL is the program's (peak limits lowered by crest − 3.01 dB) and headroom is shown. */
  program: boolean;
  /** Peak ÷ RMS of the signal (dB), 3.01–20. A sine is 3.01. */
  crest_dB: number;
  /** Average SPL to measure headroom against (dB, at the charts' reference); null = against the drive. */
  target_dB: number | null;
};

/** Pink noise (IEC / AES2: what a driver's power rating is measured with), when Program is first turned on. */
export const DEFAULT_SIGNAL: ProgramSignal = { program: false, crest_dB: 6, target_dB: null };

export const CREST_MIN = SINE_CREST_DB;
export const CREST_MAX = 20;
export const TARGET_MIN = 40;
export const TARGET_MAX = 160;

export type SignalPreset = "sine" | "pink" | "music" | "cinema" | "custom";

/** The signal presets: crest factor (dB) and what they stand for. */
export const SIGNAL_PRESETS: { id: Exclude<SignalPreset, "custom">; label: string; crest_dB: number; hint: string }[] = [
  { id: "sine", label: "Sine", crest_dB: SINE_CREST_DB, hint: "A steady tone: the same as Program off." },
  { id: "pink", label: "Pink noise", crest_dB: 6, hint: "The test signal power ratings are measured with (IEC, AES2)." },
  { id: "music", label: "Music", crest_dB: 9, hint: "Most mastered pop, rock and electronic music." },
  { id: "cinema", label: "Cinema", crest_dB: 12, hint: "Film soundtracks and dynamic recordings." },
];

/** The preset a crest factor matches (to 0.05 dB), else Custom. */
export function presetOf(crest_dB: number): SignalPreset {
  return SIGNAL_PRESETS.find((p) => Math.abs(p.crest_dB - crest_dB) < 0.05)?.id ?? "custom";
}

export const clampCrest = (v: number) => Math.min(CREST_MAX, Math.max(CREST_MIN, v));
export const clampTarget = (v: number) => Math.min(TARGET_MAX, Math.max(TARGET_MIN, v));

/** The signal from a link or file: anything missing or out of range falls back to the defaults or the limits. */
export function signalFrom(v: unknown): ProgramSignal {
  const r = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  const crest = typeof r.crest_dB === "number" && Number.isFinite(r.crest_dB) ? clampCrest(r.crest_dB) : DEFAULT_SIGNAL.crest_dB;
  const target = typeof r.target_dB === "number" && Number.isFinite(r.target_dB) ? clampTarget(r.target_dB) : null;
  return { program: r.program === true, crest_dB: crest, target_dB: target };
}

/** The signal's crest factor in effect: a sine's when Program is off. */
export const crestOf = (s: ProgramSignal) => (s.program ? s.crest_dB : SINE_CREST_DB);

/** Short name for the Program button: "Sine" (off), "Pink noise 6 dB", "Custom 7.5 dB". */
export function signalLabel(s: ProgramSignal): string {
  if (!s.program) return "Sine";
  const p = presetOf(s.crest_dB);
  if (p === "sine") return "Sine";
  const name = p === "custom" ? "Custom" : SIGNAL_PRESETS.find((x) => x.id === p)!.label;
  return `${name} ${fmtCrest(s.crest_dB)} dB`;
}

/** A crest factor for showing: whole numbers bare, else one decimal. */
export const fmtCrest = (v: number) => (Math.abs(v - Math.round(v)) < 0.05 ? String(Math.round(v)) : v.toFixed(1));

export type SideHeadroom = { db: number; f: number; kind: LimitKind } | null;

/** One design's program envelope and headroom, for the charts, legend, summary and build sheet. */
export type DesignProgram = {
  /** The program's max SPL (average), per frequency. */
  spl: Float64Array;
  /** The limit that holds it, and on which side. */
  kind: LimitKind[];
  side: ("avg" | "peak" | null)[];
  /** The band headroom is measured over: the design's F3 up to its upper −6 dB point, else the chart top. */
  band: [number, number];
  peak: SideHeadroom;
  avg: SideHeadroom;
  /** The lower of the two, with its side (the chart's worst-point marker). */
  overall: (NonNullable<SideHeadroom> & { side: "avg" | "peak"; y: number }) | null;
};

const cache = new WeakMap<object, Map<string, DesignProgram>>();

/**
 * A design's program envelope and headroom against `target_dB` (or its own drive SPL when null).
 * Needs no new simulation: it comes from the two ceilings the simulation stored, so changing the
 * crest factor or target is cheap (cached per result).
 */
export function programOf(
  r: Pick<SimulationResult, "freq" | "spl" | "ceilings" | "summary" | "programSpl">,
  f3: number | null | undefined,
  crest_dB: number,
  target_dB: number | null,
): DesignProgram {
  const key = `${crest_dB}|${target_dB ?? ""}|${f3 ?? ""}`;
  let byKey = cache.get(r.ceilings);
  const hit = byKey?.get(key);
  if (hit) return hit;
  const env = programEnvelope(r.ceilings, crest_dB);
  // Coil temperature limit: the coil's heat depends on the signal, so the engine worked the curve out (programSpl).
  if (r.programSpl) env.spl = r.programSpl;
  const freq = r.freq;
  const top = upperBandEdge(freq, r.spl) ?? freq[freq.length - 1]!;
  const band: [number, number] = [f3 ?? freq[0]!, top];
  const ref = target_dB ?? r.spl;
  const h = headroomBySide(freq, r.ceilings, crest_dB, ref, band);
  const side = (x: typeof h.peak): SideHeadroom => (x ? { db: x.db, f: x.f, kind: x.kind } : null);
  const out: DesignProgram = {
    ...env,
    band,
    peak: side(h.peak),
    avg: side(h.avg),
    overall: h.overall ? { db: h.overall.db, f: h.overall.f, kind: h.overall.kind, side: h.overall.side, y: env.spl[h.overall.i]! } : null,
  };
  if (!byKey) cache.set(r.ceilings, (byKey = new Map()));
  byKey.set(key, out);
  return out;
}

/** How a headroom number reads: normal at 3 dB or more, amber 0–3 dB, red below 0. */
export const headroomTone = (db: number): "ok" | "warn" | "over" => (db < 0 ? "over" : db < 3 ? "warn" : "ok");

/** A headroom for showing: "+3.2 dB", "−3.0 dB" (a real minus). */
export function fmtHeadroom(db: number): string {
  const r = Math.round(db * 10) / 10;
  return `${r < 0 ? "−" : "+"}${Math.abs(r).toFixed(1)} dB`;
}

/**
 * The state to simulate: `prev` when only the program signal changed since (it needs no new
 * simulation: the envelope comes from the stored ceilings), else `next`.
 */
export function simStateOf<S extends { settings: { signal: ProgramSignal } }>(prev: S | null, next: S): S {
  if (!prev || prev === next) return next;
  if (prev.settings.signal === next.settings.signal) return next;
  // With the coil temperature limit the program's crest heats the coil: that needs a new run.
  if ((next.settings as { thermalLimit?: string }).thermalLimit === "coil") return next;
  for (const k of Object.keys(next) as (keyof S)[]) if (k !== "settings" && prev[k] !== next[k]) return next;
  if (Object.keys(prev).length !== Object.keys(next).length) return next;
  const a = prev.settings as Record<string, unknown>;
  const b = next.settings as Record<string, unknown>;
  for (const k of Object.keys(b)) if (k !== "signal" && a[k] !== b[k]) return next;
  return Object.keys(a).length === Object.keys(b).length ? prev : next;
}
