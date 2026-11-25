/**
 * Run an AppState the way the app does (solveDriver → runDesigns → limitsOf) and report what
 * the app shows: per box its F3, tuning, limits at the drive, max SPL, and sampled curves, plus
 * a share link that opens the same thing in the app.
 */
import type { SimulationResult } from "@sbg/engine";
import { decodeStateAny, encodeStateShort, type AppState } from "../../web/src/state.ts";
import { airLimitOf, checkFromHz, driveAt, KIND_LABEL, LIMIT_NAME, limitsOf, portLimitOf, runDesigns, solveDriver, type Design } from "../../web/src/sim.ts";
import { buildState, RequestError, type BuildOptions } from "./build.ts";
import { outputOf, type CurveName, type SimRequest } from "./request.ts";

export const SITE = "https://speakerboxgenius.com";

export interface DesignResult {
  label: string;
  kind: string;
  /** Net volume as built (L); a bandpass box's rear chamber. */
  vb_l: number;
  /** The volume it acts as with stuffing (L), when that differs. */
  acting_l?: number;
  fb_hz?: number;
  fb_rear_hz?: number;
  fc_hz?: number;
  qtc?: number;
  f3_hz: number | null;
  f6_hz: number | null;
  f10_hz: number | null;
  /** Bandpass: upper −3 dB point. */
  f3_high_hz?: number | null;
  /** With room or cabin gain on: F3 with it. */
  f3_room_hz?: number | null;
  /** Passband SPL at the drive (dB, 1 m): the level F3 is measured from. */
  passband_spl_db: number;
  /** Peak one-way cone excursion above the checked range's floor (mm) and the driver's Xmax. */
  excursion: { peak_mm: number | null; xmax_mm: number | null; over: boolean };
  pr_excursion?: { peak_mm: number; xmax_mm: number | null; over: boolean };
  port_velocity?: { peak_ms: number | null; limit_ms: number; over: boolean };
  /** Limits passed at this drive (the app's ⚠ list), and the highest drive that keeps within all of them. */
  over: string[];
  safe_drive: string;
  /** Excursion past Xmax only in the deep bass (below the tuning / high-pass): where, and the drive that keeps within it there too. */
  deep_bass?: { below_hz: number; peak_mm: number; safe_drive: string };
  /** Max SPL (dB, 1 m, sine) and what limits it, at a few frequencies. */
  max_spl: { hz: number; spl_db: number; limited_by: string }[];
  /** Open baffle: the dipole's path and peaks. */
  open_baffle?: { path_m: number; peak_hz: number; first_null_hz: number; frame_resonance_hz: number | null };
  /** Requested curves, sampled at `freq_hz` (the response's top-level list). */
  curves: Partial<Record<CurveName, (number | null)[]>>;
}

export interface SimResponse {
  driver: { name: string; id?: string; count: number; wiring: string; isobaric: boolean };
  drive: string;
  designs: DesignResult[];
  freq_hz: number[];
  share_link: string;
  notes: string[];
  /** Units of every number: dB SPL at 1 m (half space unless the request turned the baffle on), mm one way peak, m/s peak, Ω. */
  units: string;
}

const round = (v: number, d = 2) => {
  const k = 10 ** d;
  return Math.round(v * k) / k;
};
const r = (v: number | null | undefined, d = 2) => (v === null || v === undefined || !Number.isFinite(v) ? null : round(v, d));

/** Log-spaced frequencies from `from` to `to` at `ppo` points per octave. */
export function sampleFreqs(from: number, to: number, ppo: number): number[] {
  const n = Math.max(2, Math.round(Math.log2(to / from) * ppo) + 1);
  return Array.from({ length: n }, (_, i) => round(from * (to / from) ** (i / (n - 1)), 2));
}

/** `y` at `f` on the result's grid (log-frequency interpolation); null outside it or where y isn't finite. */
export function at(freq: ArrayLike<number>, y: ArrayLike<number> | null | undefined, f: number): number | null {
  if (!y) return null;
  const n = freq.length;
  if (f < freq[0]! * 0.999 || f > freq[n - 1]! * 1.001) return null;
  let i = 1;
  while (i < n - 1 && freq[i]! < f) i++;
  const f0 = freq[i - 1]!;
  const f1 = freq[i]!;
  const t = Math.min(1, Math.max(0, Math.log(f / f0) / Math.log(f1 / f0)));
  const v = y[i - 1]! + t * (y[i]! - y[i - 1]!);
  return Number.isFinite(v) ? v : null;
}

const MAX_SPL_AT = [20, 25, 30, 40, 50, 63, 80, 100, 125, 160, 200];

function curveOf(res: SimulationResult, name: CurveName): ArrayLike<number> | null {
  switch (name) {
    case "spl":
      return res.spl;
    case "excursion":
      return res.excursionMm;
    case "port_velocity":
      return res.portVelocity;
    case "pr_excursion":
      return res.prExcursionMm;
    case "impedance":
      return res.impedanceOhm;
    case "max_spl":
      return res.maxSpl;
    case "max_power":
      return res.maxPowerW;
    case "group_delay":
      return res.groupDelayMs;
    case "phase":
      return res.phaseDeg;
  }
}

function designResult(s: AppState, d: Design, freqs: number[], curves: CurveName[]): DesignResult {
  const res = d.result;
  const sum = res.summary;
  const lim = limitsOf(res, s.xmax_mm, s.highPass.on, portLimitOf(s), airLimitOf(s));
  const from = checkFromHz(s.highPass.on, sum.f3);
  const maxSpl = MAX_SPL_AT.filter((f) => f >= from * 0.999 && f <= res.freq[res.freq.length - 1]!).map((f) => {
    let i = 0;
    while (i < res.freq.length - 1 && res.freq[i]! < f) i++;
    return { hz: f, spl_db: round(at(res.freq, res.maxSpl, f) ?? NaN, 1), limited_by: res.limitedBy[i] ?? "none" };
  });
  const out: DesignResult = {
    label: d.label,
    kind: KIND_LABEL[d.design.kind],
    vb_l: round(d.vb_l, 2),
    ...(d.acting_l !== undefined ? { acting_l: round(d.acting_l, 2) } : {}),
    ...(sum.fb !== undefined ? { fb_hz: round(sum.fb, 2) } : {}),
    ...(sum.fbRear !== undefined ? { fb_rear_hz: round(sum.fbRear, 2) } : {}),
    ...(sum.fc !== undefined ? { fc_hz: round(sum.fc, 2) } : {}),
    ...(sum.qtc !== undefined ? { qtc: round(sum.qtc, 3) } : {}),
    f3_hz: r(sum.f3),
    f6_hz: r(sum.f6),
    f10_hz: r(sum.f10),
    ...(sum.f3High !== undefined ? { f3_high_hz: r(sum.f3High) } : {}),
    ...(d.f3Room !== undefined ? { f3_room_hz: r(d.f3Room) } : {}),
    passband_spl_db: round(sum.f3RefSpl, 2),
    excursion: { peak_mm: r(lim.x), xmax_mm: s.xmax_mm > 0 ? s.xmax_mm : null, over: lim.over.includes("xmax") },
    ...(lim.xpr ? { pr_excursion: { peak_mm: round(lim.xpr.mm), xmax_mm: lim.xpr.xmax, over: lim.xpr.over } } : {}),
    ...(res.portVelocity ? { port_velocity: { peak_ms: r(lim.vp), limit_ms: portLimitOf(s), over: lim.over.includes("port") } } : {}),
    over: lim.over.map((k) => LIMIT_NAME[k]),
    safe_drive: driveAt(s, lim.safeScale),
    ...(lim.deep ? { deep_bass: { below_hz: round(lim.deep.below_hz, 1), peak_mm: round(lim.deep.x_mm), safe_drive: driveAt(s, lim.deep.scale) } } : {}),
    max_spl: maxSpl,
    ...(sum.ob ? { open_baffle: { path_m: round(sum.ob.d_m, 3), peak_hz: round(sum.ob.fPeak, 1), first_null_hz: round(sum.ob.fNull, 1), frame_resonance_hz: r(sum.ob.fQuarter, 1) } } : {}),
    curves: {},
  };
  for (const c of curves) {
    const y = curveOf(res, c);
    if (!y) continue;
    out.curves[c] = freqs.map((f) => r(at(res.freq, y, f), c === "max_power" ? 1 : 2));
  }
  return out;
}

/** Where a link was made, as the app's `?ref=` (counted as where the visit came from, then dropped from the address). */
export type LinkRef = "mcp";

export async function shareLink(s: AppState, site = SITE, ref?: LinkRef): Promise<string> {
  return `${site}/${ref ? `?ref=${ref}` : ""}#${await encodeStateShort(s)}`;
}

/** Simulate an AppState as the app does. */
export async function simulateState(s: AppState, output: SimRequest["output"] = {}, notes: string[] = [], site = SITE, ref?: LinkRef): Promise<SimResponse> {
  const solved = solveDriver(s);
  if (solved.missing.length) throw new RequestError(`The driver's parameters aren't complete: missing ${solved.missing.join(", ")}`);
  const o = outputOf({ output });
  const freqs = sampleFreqs(o.from_hz, o.to_hz, o.points_per_octave);
  const designs = runDesigns(s, solved).filter((d) => !d.compare);
  return {
    driver: { name: s.driverName, ...(s.driverOrigin ? { id: s.driverOrigin } : {}), count: s.drivers, wiring: s.wiring, isobaric: s.isobaric },
    drive: driveAt(s, 1),
    designs: designs.map((d) => designResult(s, d, freqs, o.curves)),
    freq_hz: freqs,
    share_link: await shareLink(s, site, ref),
    notes,
    units: "SPL dB at 1 m at the drive given; excursion mm one way, peak; air speed m/s peak; volumes L; frequencies Hz",
  };
}

/** Build a request into the app's state and simulate it. */
export async function simulateRequest(req: SimRequest, opts: BuildOptions & { site?: string; ref?: LinkRef } = {}): Promise<SimResponse> {
  const { state, notes } = await buildState(req, opts);
  return simulateState(state, req.output, notes, opts.site, opts.ref);
}

/** The app's state from a share link (or just its #… part); null when it isn't one. */
export async function stateFromLink(link: string): Promise<AppState | null> {
  const hash = link.includes("#") ? link.slice(link.indexOf("#") + 1) : link;
  if (!/(^|&)(s|z)=/.test(hash)) return null;
  return decodeStateAny(hash);
}
