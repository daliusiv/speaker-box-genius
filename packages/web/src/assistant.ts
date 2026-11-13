/**
 * Design assistant: from a goal (what it's for, the limits, what matters most) to a ranked
 * list of driver + box designs from the database.
 *
 * Each driver that passes the quick filters (size, kind, brand, a load the amplifier can
 * drive) gets the box sizing the app's presets use (sealed Qtc 0.707, ported QB3/B4 or
 * Keele), capped at the largest box allowed, with the simplest port that fits (by the app's
 * own check) and stays under the chuffing line: a plain tube, a flared tube, or a slot. In a box smaller than its alignment, a ported box is tuned for the lowest
 * F3 without a peak. No filter is assumed (a passive speaker on any amp): limits are graded
 * as the app grades them (limitsOf), so a deep-bass note is shown, not hidden. For
 * "smallest" the box is shrunk until F3 just reaches the target. Each design is simulated at
 * the user's power (with cabin gain for a car), and scored on F3, output at the frequency
 * that matters and box size. Pure functions, so they run in tests and in the dialog's slices.
 */
import {
  evaluatePrCandidates,
  portLengthForFb,
  portTubeDisplacement,
  slotPortDisplacement,
  rankPrResults,
  roomGainDb,
  sealedVolumeForAlignment,
  simulate,
  type Air,
  type PrCandidate,
  type SimulationResult,
} from "@sbg/engine";
import { doubtsXmax, type DbIndex, type LoadedDriver } from "./library.ts";
import { ventedAlignmentFor } from "./presets.ts";
import { presetFor, sizeMltlPort, tuneLine, type PresetId } from "./lineopt.ts";
import { airLimitOf, airOf, endCorrectionOf, lineFoldOf, portLimitOf, volumeFor, alignmentDriver, driverInputOf, enclosureOf, enclosureOptsOf, limitsOf, checkFromHz, lineLength, lineVolume, portRoom_cm, roomGainOf, simOptionsOf, solveDriver, type LimitKind } from "./sim.ts";
import { qaGain } from "./stuffing.ts";
import { portCandidates, portFieldsOf, portSpeedFor, chamberPortFields, needsSpace, type AssistantPort, type PortSpace } from "./ports.ts";
import { bandRipple, sizeBandpass, type BandpassFound, type BandpassOrder } from "./bandpassSize.ts";
export { choosePort, portCandidates, portFieldsOf, type AssistantPort } from "./ports.ts";
import {
  MAX_DESIGNS,
  ROOM_PRESETS,
  newDesign,
  type AppState,
  type BandpassDesign,
  type DesignState,
  type LineDesign,
  type PortFields,
  type PrDesign,
  type PrParams,
  type VentedDesign,
  canCompress,
  deflateToB64Url,
  inflateFromB64Url,
} from "./state.ts";

export type AssistantUse = "car" | "home" | "hifi" | "tower" | "other";
export type AssistantPriority = "balanced" | "deep" | "loud" | "small";
export type AssistantBox = "sealed" | "vented" | "pr" | "line" | "bandpass";

/** Uses where a bandpass box is offered: subwoofers (a bandpass lets nothing out above its band). */
export const BANDPASS_USES: readonly AssistantUse[] = ["car", "home", "other"];

/** Uses where a transmission line is offered (a tall cabinet that can fold one). */
export const LINE_USES: readonly AssistantUse[] = ["hifi", "tower", "other"];
/** The line types the assistant tries: mass-loaded and classic lines (TQWTs and offset lines grow too long to fold into a tower). */
export const LINE_TYPES = ["mltl", "tl"] as const satisfies readonly PresetId[];
/** The passes over a driver: the boxes for every candidate, then lines and bandpass boxes for a shortlist. */
export type AssistantStage = "boxes" | "lines" | "bandpass" | "pr";
/** A database PR as the PR finder takes it, with its parameters for a design. */
export type PrCandidateWithParams = PrCandidate & { params: PrParams; displacement_l?: number };
/** How many of the best drivers from the boxes get passive radiator boxes (the PR finder: ~150 simulations each). */
export const PR_SHORTLIST = 20;
/** How many of the best drivers from the boxes get bandpass boxes (a search of ~200 simulations each). */
export const BANDPASS_SHORTLIST = 30;
/** How many of the best drivers from the boxes get lines too (a line takes ~30 simulations). */
export const LINE_SHORTLIST = 10;
/** Longest line the assistant suggests (cm): about three runs of a metre-tall cabinet. */
export const LINE_MAX_CM = 300;
/** Group delay (in cycles of the frequency, from 0.8 × F3 up) above which a result gets a "slow bass" note: a delay as long as the note's own period. */
export const GD_CYCLES = 1;
/** Cycles of group delay as a card shows them, with enough digits that one over GD_CYCLES doesn't read "1.0". */
export const cyclesText = (c: number) => (c < 1.1 ? c.toFixed(2) : c.toFixed(1));
/** The tallest cabinet (outside, cm) a line may fold into, and the deepest and widest. */
export const LINE_FOLD_MAX = { height_cm: 125, depth_cm: 50, width_cm: 45 };
/** Narrowest a line may get on average, as a share of the cones' area. */
export const LINE_MIN_AREA = 0.8;

export interface AssistantGoal {
  use: AssistantUse;
  /** Largest net box volume allowed (L), for all the drivers together. */
  maxVolume_l: number;
  /** Amplifier power (W) into the load chosen. */
  power_w: number;
  /** Lowest load the amplifier is happy with (Ω). */
  minLoad_ohm: number;
  drivers: 1 | 2;
  sizeMin_in: number;
  sizeMax_in: number;
  boxes: AssistantBox[];
  /** Brands to try (empty: all). */
  brands: string[];
  priority: AssistantPriority;
  /** "Loudest": output at this frequency (Hz). Also shown for every result. */
  loudAt_hz: number;
  /** "Smallest": the F3 the box must reach (Hz). */
  targetF3_hz: number;
  /**
   * "Fit my space": the box's outside size (cm) and wall thickness (mm) instead of a volume.
   * Each result then gets the net volume that space holds with its own driver, ports and PRs
   * (as the volume calculator works it out), and opens with the calculator set to it.
   */
  space?: SpaceGoal;
}

export interface SpaceGoal {
  width_cm: number;
  height_cm: number;
  depth_cm: number;
  wall_mm: number;
}

/** A space's inside dimensions (cm), largest first. */
export const insideOf = (sp: SpaceGoal): number[] =>
  [sp.width_cm, sp.height_cm, sp.depth_cm].map((x) => Math.max(0, x - (2 * sp.wall_mm) / 10)).sort((a, b) => b - a);

/** A round part on a panel: its frame's outside diameter and how deep it reaches in (cm). */
export interface Mount {
  d_cm: number;
  depth_cm: number;
}

/** A driver's frame (from the database's cutout, else its nominal size) and depth (when known). */
export const driverMount = (d: Pick<LoadedDriver, "cutout_mm" | "depth_mm">, row: Pick<IndexRow, "size_in">): Mount => ({
  d_cm: d.cutout_mm ? d.cutout_mm / 10 + 2.5 : (row.size_in ?? 0) * 2.54,
  depth_cm: d.depth_mm ? d.depth_mm / 10 : 0,
});

/**
 * Whether round parts (drivers, passive radiators) all go on the inside faces of a space: each
 * face of the six takes a row of them along its length, no wider than its width, each clear of
 * the opposite wall. Largest first, onto the first face with room (a sketch of a real layout:
 * one row per panel, so a little cautious).
 */
export function mountsFit(parts: Mount[], sp: SpaceGoal): boolean {
  const [a, b, c] = insideOf(sp) as [number, number, number];
  // Each face as (length, width, room behind it), two of each.
  const faces = [
    [a, b, c],
    [a, b, c],
    [a, c, b],
    [a, c, b],
    [b, c, a],
    [b, c, a],
  ].map(([len, wide, behind]) => ({ len: len!, wide: wide!, behind: behind!, used: 0 }));
  for (const p of [...parts].sort((x, y) => y.d_cm - x.d_cm)) {
    const f = faces.find((f) => p.d_cm <= f.wide && p.depth_cm <= f.behind && f.used + p.d_cm <= f.len);
    if (!f) return false;
    f.used += p.d_cm;
  }
  return true;
}

/**
 * Where a bandpass box's divider goes in a space: a panel across it, holding the drivers in a
 * row, the smallest that does (the least wood). Null when no cross panel takes them.
 */
export function dividerFor(sp: SpaceGoal, m: Mount, drivers: number): { area_cm2: number; divider_l: number } | null {
  const [a, b, c] = insideOf(sp) as [number, number, number];
  const panels = [
    [b, c],
    [a, c],
    [a, b],
  ].sort((x, y) => x[0]! * x[1]! - y[0]! * y[1]!);
  for (const [len, wide] of panels) {
    if (m.d_cm <= wide! && drivers * m.d_cm <= len!) {
      const area_cm2 = len! * wide!;
      return { area_cm2, divider_l: (area_cm2 * sp.wall_mm) / 10 / 1000 };
    }
  }
  return null;
}

/** The room a port takes inside its chamber (L), as the volume calculator counts it. */
export function portDisplacement_l(p: AssistantPort, wall_mm: number): number {
  return p.kind === "slot"
    ? slotPortDisplacement(p.slotWidth_cm, p.slotHeight_cm, p.length_cm, wall_mm, p.count)
    : portTubeDisplacement(p.diameter_cm, p.length_cm, wall_mm, p.count);
}

/** Whether a driver (or the goal's drivers) goes into a space. */
export function driverFits(d: Pick<LoadedDriver, "cutout_mm" | "depth_mm">, row: Pick<IndexRow, "size_in">, sp: SpaceGoal, drivers = 1): boolean {
  return mountsFit(Array.from({ length: drivers }, () => driverMount(d, row)), sp);
}

/** The app state with the volume calculator set to a space (a plain box, not linked to a design). */
export function withSpace(s: AppState, sp: SpaceGoal): AppState {
  return { ...s, volume: { ...s.volume, link: "none", shape: "box", width_cm: sp.width_cm, height_cm: sp.height_cm, depth_cm: sp.depth_cm, wall_mm: sp.wall_mm } };
}

/** Before any driver: the space's inside volume after walls and bracing (L), as a first limit. */
export function spaceGross_l(base: AppState, sp: SpaceGoal): number {
  const s = withSpace({ ...base, drivers: 1, isobaric: false, volume: { ...base.volume, driverDisp_l: 0, other_l: 0 } }, sp);
  return volumeFor(s, undefined).net_l;
}

export const USES: Record<AssistantUse, { label: string; hint: string; goal: Omit<AssistantGoal, "use" | "priority" | "brands"> }> = {
  car: {
    label: "Car subwoofer",
    hint: "Boot or under-seat box, with the car's cabin gain",
    goal: { maxVolume_l: 45, power_w: 500, minLoad_ohm: 2, drivers: 1, sizeMin_in: 8, sizeMax_in: 15, boxes: ["sealed", "vented"], loudAt_hz: 40, targetF3_hz: 35 },
  },
  home: {
    label: "Home subwoofer",
    hint: "Living-room sub for music and films",
    goal: { maxVolume_l: 80, power_w: 300, minLoad_ohm: 4, drivers: 1, sizeMin_in: 8, sizeMax_in: 18, boxes: ["sealed", "vented", "pr"], loudAt_hz: 30, targetF3_hz: 25 },
  },
  hifi: {
    label: "Hi-fi / bookshelf woofer",
    hint: "The bass driver of a two-way speaker",
    goal: { maxVolume_l: 20, power_w: 50, minLoad_ohm: 4, drivers: 1, sizeMin_in: 4, sizeMax_in: 8, boxes: ["sealed", "vented", "pr"], loudAt_hz: 50, targetF3_hz: 45 },
  },
  tower: {
    label: "Tower / floor-stander",
    hint: "The bass of a tall speaker: ported, sealed or a transmission line",
    goal: { maxVolume_l: 60, power_w: 100, minLoad_ohm: 4, drivers: 1, sizeMin_in: 5, sizeMax_in: 10, boxes: ["sealed", "vented", "pr", "line"], loudAt_hz: 40, targetF3_hz: 35 },
  },
  other: {
    label: "Something else",
    hint: "Start from general settings",
    goal: { maxVolume_l: 50, power_w: 200, minLoad_ohm: 4, drivers: 1, sizeMin_in: 4, sizeMax_in: 18, boxes: ["sealed", "vented"], loudAt_hz: 40, targetF3_hz: 35 },
  },
};

export const PRIORITIES: Record<AssistantPriority, { label: string; hint: string }> = {
  balanced: { label: "Balanced", hint: "A sensible mix of depth, output and size" },
  deep: { label: "Deepest", hint: "The lowest F3" },
  loud: { label: "Loudest", hint: "Most output at the frequency you choose, before the cone, port or power runs out" },
  small: { label: "Smallest box", hint: "The smallest box that still reaches your target F3" },
};

export const goalFor = (use: AssistantUse, priority: AssistantPriority = "balanced"): AssistantGoal => ({ use, priority, brands: [], ...USES[use].goal });

/** A database driver to try: its index row and, once loaded, its full record. */
export type IndexRow = DbIndex["drivers"][number];

export interface AssistantResult {
  /** driverId:box */
  key: string;
  driverId: string;
  name: string;
  brand: string;
  box: AssistantBox;
  /** Net volume of the box (L), all drivers together. */
  vb_l: number;
  fb?: number;
  port?: AssistantPort;
  /** Transmission line: its type, length along the line, and the design itself (to open). */
  line?: {
    type: (typeof LINE_TYPES)[number];
    label: string;
    length_cm: number;
    design: LineDesign;
    /** How it folds into a cabinet: runs and outside size (cm). */
    fold: { runs: number; height_cm: number; width_cm: number; depth_cm: number; bentPort: boolean };
  };
  /** Passive radiator box: the PRs (each with added mass), how much of their travel they use when the driver reaches its Xmax, and the design (to open). */
  pr?: { name: string; count: number; addedMass_g: number; prUse: number; design: PrDesign; displacement_l?: number };
  /** "Fit my space": the net volume the space holds for this result (L), and whether the box fills it. */
  space?: { holds_l: number; fills: boolean; portUsesSpace?: boolean };
  /** Group delay slow enough to call the bass "slow": its peak in the band (from 0.8 × F3 up) and where, when over GD_CYCLES cycles. */
  gd?: { ms: number; hz: number; cycles: number };
  /** Bandpass: the order, both chambers (L), their ports, and the band (−3 dB edges) with its gain over a plain cone. */
  bandpass?: {
    order: "4" | "6p";
    rear_l: number;
    front_l: number;
    frontPort: AssistantPort;
    frontFb: number;
    rearPort?: AssistantPort;
    rearFb?: number;
    f3High: number;
    gain_db: number;
  };
  /** How the drivers (and a DVC driver's coils) are wired, and the load the amplifier sees. */
  wiring: "parallel" | "series";
  dvcWired?: "parallel" | "series";
  load_ohm: number;
  /** F3 as the app shows it (Hz). */
  f3: number;
  /** Output at the goal's frequency (dB SPL), at the power given or the first limit, whichever is lower. */
  loud_db: number;
  /** What sets the output there: "power" (the amplifier), or the first limit. */
  limitedBy: "power" | "thermal" | "xmax" | "port" | "pr-xmax" | "amp" | "air" | "none";
  /** Limits crossed at the goal's power, as the app grades them (cone Xmax, port speed). */
  over: LimitKind[];
  /** Over a limit: the power that keeps every limit (W). */
  safe_w?: number;
  /** Past Xmax only in deep bass (below 0.7 × Fb): from where, and the power that keeps it within (W). */
  deep?: { below_hz: number; safe_w: number };
  /** Past Xmax (cone or PR) only below where limits are checked (checkFromHz), with no subsonic filter: from where, and the power that keeps it within (W). */
  subsonic?: { below_hz: number; safe_w: number };
  /** Highest point of the relative response above F3 (dB): a hump. */
  peak_db: number;
  /** Relative response at CURVE_FREQS, for a small sketch. */
  curve: number[];
  notes: string[];
  badges?: string[];
}

/** Frequencies of the sketch in each result. */
export const CURVE_FREQS = Array.from({ length: 25 }, (_, i) => 10 * 30 ** (i / 24));

const r1 = (v: number) => Math.round(v * 10) / 10;

/** The quick filters: size, kind, brand, and enough data to simulate (Xmax included, and plausible). */
export function prefilter(rows: IndexRow[], goal: AssistantGoal): IndexRow[] {
  const brands = new Set(goal.brands);
  const sub = goal.use === "car" || goal.use === "home";
  return rows.filter((d) => {
    if (!(d.size_in! >= goal.sizeMin_in - 0.01 && d.size_in! <= goal.sizeMax_in + 0.01)) return false;
    if (!(d.xmax_mm! > 0) || !(d.fs! > 0) || !(d.sd_cm2! > 0) || !(d.vas_l! > 0) || !(d.qts! > 0)) return false;
    // An Xmax that looks wrong for the cone would rank the driver on made-up headroom.
    if (doubtsXmax(d)) return false;
    if (brands.size > 0 && !brands.has(d.brand)) return false;
    // A sub needs some excursion and a low resonance; midranges and tweeters are no use for bass.
    if (/tweeter|compression|midrange|full/i.test(d.type)) return false;
    if (sub && !(d.fs! <= 60)) return false;
    // In a space, the driver's frame (about its nominal size) must fit its second-largest inside face.
    if (goal.space && !((d.size_in ?? 0) * 2.54 <= insideOf(goal.space)[1]!)) return false;
    return loadOptions(d, goal).length > 0;
  });
}

/** Ways to wire the drivers (and a DVC driver's coils) that the amplifier can take, lowest load first. */
export function loadOptions(d: Pick<IndexRow, "ohms" | "coil_ohms">, goal: Pick<AssistantGoal, "drivers" | "minLoad_ohm">) {
  const per: { ohm: number; dvc?: "parallel" | "series" }[] = d.coil_ohms
    ? [
        { ohm: d.coil_ohms / 2, dvc: "parallel" },
        { ohm: d.coil_ohms * 2, dvc: "series" },
      ]
    : [{ ohm: d.ohms }];
  const out: { load: number; wiring: "parallel" | "series"; dvc?: "parallel" | "series" }[] = [];
  for (const p of per) {
    if (goal.drivers === 1) out.push({ load: p.ohm, wiring: "parallel", dvc: p.dvc });
    else {
      out.push({ load: p.ohm / 2, wiring: "parallel", dvc: p.dvc });
      out.push({ load: p.ohm * 2, wiring: "series", dvc: p.dvc });
    }
  }
  return out.filter((o) => o.load >= goal.minLoad_ohm - 0.01).sort((a, b) => a.load - b.load);
}

/** A database driver put into the app's state, as picking it in the driver list does. */
export function withDriver(s: AppState, d: LoadedDriver): AppState {
  return {
    ...s,
    driverName: d.name,
    driverBrand: d.brand,
    nominal_ohms: d.nominal_ohms ?? s.nominal_ohms,
    ts: d.ts,
    le_mh: d.le_mh ?? 0,
    l2_mh: d.l2_mh ?? 0,
    r2_ohm: d.r2_ohm ?? 0,
    semi: undefined,
    fdd: undefined,
    xmax_mm: d.xmax_mm ?? s.xmax_mm,
    pe_w: d.pe_w ?? s.pe_w,
    volume: {
      ...s.volume,
      ...(d.displacement_l !== undefined ? { driverDisp_l: d.displacement_l } : {}),
      driverCutout_mm: d.cutout_mm ?? 0,
      driverDepth_mm: d.depth_mm ?? 0,
    },
    // DVC drivers start wired the way their published values were measured.
    dvc: d.dvcWiring ? { on: true, entered: d.dvcWiring, wired: d.dvcWiring } : { ...s.dvc, on: false },
  };
}

const LINE_LABEL: Record<(typeof LINE_TYPES)[number], string> = { mltl: "MLTL", tl: "Classic TL" };

/**
 * Folding a line into a cabinet with the app's fold tool (the same layout the Build tab
 * draws and cuts): 0–4 folds, an inside width from the driver's cutout to 40 cm; kept when
 * the fold has no warnings (the driver fits in the first run, nothing too shallow; a port
 * longer than the cabinet is tall is fine, bent) and the
 * cabinet is at most `max` (LINE_FOLD_MAX, or the user's space) and taller than it is deep. Of those, the fewest folds,
 * then the height nearest `target_cm` (about a metre for a tower).
 */
export function foldFor(
  d: LineDesign,
  wall_mm: number,
  cutout_mm: number,
  target_cm: number,
  max: { height_cm: number; width_cm: number; depth_cm: number } = LINE_FOLD_MAX,
): { design: LineDesign; fold: NonNullable<AssistantResult["line"]>["fold"] } | null {
  for (let folds = 0; folds <= 4; folds++) {
    let best: { design: LineDesign; fold: NonNullable<AssistantResult["line"]>["fold"]; miss: number } | null = null;
    for (let w = Math.max(12, Math.ceil(cutout_mm / 10) + 1); w <= 40; w += 2) {
      const design: LineDesign = { ...d, fold: { width_cm: w, folds } };
      let f: ReturnType<typeof lineFoldOf>;
      try {
        f = lineFoldOf(design, wall_mm, cutout_mm);
      } catch {
        continue;
      }
      // Advice about cleaner bends, or a port to bend (an MLTL's long port), is fine; anything
      // else (the driver not in the first run, a run too shallow) means it won't build well.
      if (f.warnings.some((x) => !/cleaner bends|port is longer/.test(x))) continue;
      const o = { height_cm: r1(f.outside.height / 10), width_cm: r1(f.outside.width / 10), depth_cm: r1(f.outside.depth / 10) };
      if (o.height_cm > max.height_cm || o.depth_cm > max.depth_cm || o.width_cm > max.width_cm || o.height_cm < o.depth_cm) continue;
      const miss = Math.abs(o.height_cm - target_cm);
      if (!best || miss < best.miss) best = { design, fold: { runs: folds + 1, ...o, bentPort: f.warnings.some((x) => /port is longer/.test(x)) }, miss };
    }
    if (best) return { design: best.design, fold: best.fold };
  }
  return null;
}

/**
 * The drivers worth trying in a slower box type: half the best drivers from the boxes (as
 * ranked, so the strongest drivers get a go), half the candidates that suit the type best by
 * their parameters (`key`, lowest first), so a driver that's only middling in a plain box but
 * made for this type isn't missed. Only drivers that pass `ok`.
 */
export function shortlist(
  ranked: AssistantResult[],
  cands: IndexRow[],
  n: number,
  ok: (row: IndexRow) => boolean = () => true,
  key: (row: IndexRow) => number = () => 0,
): IndexRow[] {
  const byId = new Map(cands.map((r) => [r.id, r]));
  const out: IndexRow[] = [];
  const add = (row: IndexRow | undefined, limit: number) => {
    if (row && out.length < limit && !out.includes(row) && ok(row)) out.push(row);
  };
  for (const r of ranked) add(byId.get(r.driverId), Math.ceil(n / 2));
  for (const row of [...cands].filter(ok).sort((a, b) => key(a) - key(b))) add(row, n);
  return out;
}

/**
 * Lines: a Qts of about 0.25–0.55 (lower starves a line of bass, higher suits a TQWT), the
 * lowest Fs first (a line is about bass extension).
 */
export function lineShortlist(ranked: AssistantResult[], cands: IndexRow[], n = LINE_SHORTLIST): IndexRow[] {
  return shortlist(ranked, cands, n, (row) => row.qts! >= 0.25 && row.qts! <= 0.55, (row) => row.fs!);
}

/**
 * Passive radiator boxes: drivers that got a ported box (a PR box shares its size and
 * tuning), half the best overall, half those whose ported box goes deepest.
 */
export function prShortlist(ranked: AssistantResult[], cands: IndexRow[], n = PR_SHORTLIST): IndexRow[] {
  const vented = new Map<string, number>();
  for (const r of ranked) if (r.box === "vented" && !vented.has(r.driverId)) vented.set(r.driverId, r.f3);
  return shortlist(ranked, cands, n, (row) => vented.has(row.id) && row.xmax_mm !== undefined, (row) => vented.get(row.id) ?? Infinity);
}

/**
 * Bandpass boxes: a Qts of about 0.2–0.55, closest to 0.38 first (a flat 4th-order band with
 * some gain), then the lowest Fs.
 */
export function bandpassShortlist(ranked: AssistantResult[], cands: IndexRow[], n = BANDPASS_SHORTLIST): IndexRow[] {
  return shortlist(ranked, cands, n, (row) => row.qts! >= 0.2 && row.qts! <= 0.55, (row) => Math.abs(row.qts! - 0.38) / 0.05 + row.fs! / 20);
}

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

/**
 * The cabin a car design is tried in: the one the user set up on the Signal tab (their car's
 * length, or a curve measured in it) if there is one, else a typical 2.5 m car cabin.
 */
export function carCabinOf(g: AppState["roomGain"]): AppState["roomGain"] {
  if (g.mode === "car" && g.length_cm > 0) return g;
  if (g.mode === "curve" && g.curve && g.curve.f.length >= 2) return g;
  return { ...g, mode: "car", ...ROOM_PRESETS.car };
}

/** The state a driver is tried in: the user's settings, the goal's power, drivers, wiring and room. */
export function trialState(base: AppState, d: LoadedDriver, goal: AssistantGoal, wiring: ReturnType<typeof loadOptions>[number]): AppState {
  const s = withDriver(base, d);
  return {
    ...s,
    drive: "watts",
    power: goal.power_w,
    drivers: goal.drivers,
    wiring: wiring.wiring,
    isobaric: false,
    dvc: wiring.dvc ? { on: true, entered: d.dvcWiring ?? "parallel", wired: wiring.dvc } : { ...s.dvc, on: false },
    roomGain: goal.use === "car" ? carCabinOf(s.roomGain) : { ...s.roomGain, mode: "off" },
    baffle: { ...s.baffle, on: false },
    highPass: { ...s.highPass, on: false },
    passive: { ...s.passive, on: false },
    eq: [],
    compare: null,
    designs: [],
  };
}

/**
 * Every box type of the goal for one driver, simulated and scored; [] when it can't be tried.
 * "boxes": sealed and ported (fast, for every candidate). "lines" and "bandpass": the
 * transmission lines and bandpass boxes (slower searches, for a shortlist of the best drivers
 * from the boxes).
 */
export function evaluateDriver(
  base: AppState,
  row: IndexRow,
  d: LoadedDriver,
  goalIn: AssistantGoal,
  stage: AssistantStage = "boxes",
  prs?: PrCandidateWithParams[],
): AssistantResult[] {
  const wiring = loadOptions({ ohms: d.nominal_ohms ?? row.ohms, coil_ohms: row.coil_ohms }, goalIn)[0];
  if (!wiring || !(d.xmax_mm! > 0)) return [];
  const s0 = trialState(base, d, goalIn, wiring);
  // "Fit my space": the calculator set to the space, with this driver's displacement; the most
  // a box can hold there before ports (a sealed box), as this driver's volume limit.
  const sp = goalIn.space;
  const s = sp ? withSpace(s0, sp) : s0;
  /** What the space holds for a design (L): its driver, ports and PRs (`prDisp_l` each) taken off. */
  const netIn = (design: DesignState, prDisp_l = s.volume.prDisp_l) => volumeFor({ ...s, volume: { ...s.volume, prDisp_l } }, design).net_l;
  let prDispUsed = s.volume.prDisp_l;
  /** In a space: what a bandpass box's two chambers can hold, after its divider and ports. */
  let bpHolds = 0;
  const goal: AssistantGoal = sp ? { ...goalIn, maxVolume_l: Math.max(0, netIn(newDesign("sealed", []))) } : goalIn;
  if (sp && !(goal.maxVolume_l > 0.5)) return [];
  if (sp && !driverFits(d, row, sp, goalIn.drivers)) return [];
  const solved = solveDriver(s);
  if (solved.missing.length > 0) return [];
  const align = alignmentDriver(solved, s);
  if (!align) return [];
  const al = align; // non-null, for the nested searches
  // The chuffing line from Settings, in peak (the simulation's convention here).
  const vLimit = portLimitOf(s) * (s.settings.velocity === "rms" ? Math.SQRT2 : 1);
  const aLimit = airLimitOf(s);
  const drv = driverInputOf(s, solved);
  const air = airOf(s);
  const room = roomGainOf(s);
  const opts = { ...simOptionsOf(s, true), fMin: 10, fMax: 300, points: 90, highPass: null, passive: null, eq: [] };
  const losses = s.settings.losses;

  const run = (design: DesignState, vb: number) => {
    // As the app sizes it: with Settings → Absorption "bigger box", Qa scales the volume (VituixCAD's way).
    const act = s.settings.qaVolume && (design.kind === "sealed" || design.kind === "vented" || design.kind === "pr") ? qaGain(losses.qa) : 1;
    const r = simulate(drv, enclosureOf(design, vb * act, losses, s.volume.wall_mm, undefined, enclosureOptsOf(s)), opts);
    if (room) {
      const lift = r.freq.map((f) => roomGainDb(f, room));
      r.spl = r.spl.map((v, i) => v + lift[i]!);
      r.maxSpl = r.maxSpl.map((v, i) => v + lift[i]!);
    }
    return r;
  };
  /** Relative response peak above F3, from the response without room gain. */
  const peakOf = (r: SimulationResult) => {
    const f3 = r.summary.f3 ?? 10;
    let m = -Infinity;
    for (let i = 0; i < r.freq.length; i++) {
      if (r.freq[i]! < f3) continue;
      const v = r.spl[i]! - (room ? roomGainDb(r.freq[i]!, room) : 0) - r.summary.referenceSpl;
      if (v > m) m = v;
    }
    return m;
  };
  const f3Of = (r: SimulationResult) => r.summary.f3 ?? 10;

  const sealed = newDesign("sealed", []);
  const vented = newDesign("vented", []) as VentedDesign;
  const withPort = (vb: number, fb: number, port: AssistantPort): VentedDesign => ({ ...vented, vb_l: vb, targetFb: r1(fb), ...portFieldsOf(port) });
  /** For finding the tuning: the simplest port that fits (the port barely changes the response). */
  /** In a space, a box that (nearly) fills it is built to it: its ports may use its real inside. */
  const portSpace = (vb: number): PortSpace | null => {
    if (!sp || vb < 0.85 * goal.maxVolume_l) return null;
    const [a, b] = insideOf(sp);
    return { long_cm: a!, wide_cm: b! };
  };
  const ventedAt = (vb: number, fb: number) => {
    const port = portCandidates(vb, fb, air, portSpace(vb), endCorrectionOf(s))[0];
    return port ? { design: withPort(vb, fb, port), port } : null;
  };
  /**
   * The final port: the simplest that stays under the chuffing line at the goal's power, else
   * the quietest. A flared port is judged at its mouths (as the app does), but a narrow throat
   * still roars and compresses: its throat may not run too fast either (portSpeedFor).
   */
  const bestPort = (vb: number, fb: number, useSpace = true) => {
    let best: { design: VentedDesign; port: AssistantPort; v: number } | null = null;
    for (const port of portCandidates(vb, fb, air, useSpace ? portSpace(vb) : null, endCorrectionOf(s))) {
      const design = withPort(vb, fb, port);
      const l = limitsOf(run(design, vb), d.xmax_mm!, false, vLimit, aLimit);
      const v = portSpeedFor(port, l.vp ?? Infinity);
      if (v <= vLimit) return { design, port };
      if (!best || v < best.v) best = { design, port, v };
    }
    return best;
  };
  /** In a box smaller than the alignment's: the tuning with the lowest F3 that keeps the response flat (no hump over 1.5 dB). */
  const bestFb = (vb: number) => {
    let best: { fb: number; f3: number } | null = null;
    for (let k = 0; k <= 10; k++) {
      const fb = r1(align.fs * (0.55 + k * 0.12));
      const v = ventedAt(vb, fb);
      if (!v) continue;
      const r = run(v.design, vb);
      if (peakOf(r) > 1.5) continue;
      const f3 = f3Of(r);
      if (!best || f3 < best.f3) best = { fb, f3 };
    }
    return best?.fb ?? null;
  };

  const out: AssistantResult[] = [];
  const finish = (
    box: AssistantBox,
    design: DesignState,
    vb: number,
    notes: string[],
    fb?: number,
    port?: AssistantResult["port"],
    line?: AssistantResult["line"],
    bandpass?: AssistantResult["bandpass"],
    pr?: AssistantResult["pr"],
  ) => {
    const r = run(design, vb);
    // No roll-off found in range (a tiny box for a high-Fs pro driver, say): nothing to rank on.
    const f3 = r.summary.f3;
    if (f3 === null) return;
    const lim = limitsOf(r, d.xmax_mm!, false, vLimit, aLimit);
    // Group delay in the band it plays (from F3 up), in cycles of the frequency: a delay that's
    // long against the note's own period is what makes bass sound slow or boomy.
    let gd: AssistantResult["gd"];
    let worst = GD_CYCLES;
    for (let i = 0; i < r.freq.length; i++) {
      const f = r.freq[i]!;
      if (f < 0.8 * f3 || f > 200) continue;
      const cycles = (r.groupDelayMs[i]! / 1000) * f;
      // Rounded up for the card, so a result just over one cycle never reads as exactly one.
      if (cycles > worst) {
        worst = cycles;
        gd = { ms: Math.round(r.groupDelayMs[i]!), hz: Math.round(f), cycles: Math.ceil(cycles * 100) / 100 };
      }
    }
    const watts = (scale: number) => Number((goal.power_w * scale * scale).toPrecision(2));
    // Below where limits are checked nothing is graded, but the cone (or a PR) can still pass
    // Xmax there: say so, so "within its limits" isn't read as safe with any signal.
    const floor = checkFromHz(false, f3);
    let below = 0;
    for (let k = 0; k < r.freq.length && r.freq[k]! < floor; k++) {
      below = Math.max(below, r.excursionMm[k]! / d.xmax_mm!);
      for (const g of r.prGroups ?? []) if (g.xmax_mm) below = Math.max(below, g.excursionMm[k]! / g.xmax_mm);
    }
    const spl = at(r.freq, r.spl, goal.loudAt_hz);
    const max = at(r.freq, r.maxSpl, goal.loudAt_hz);
    const i = r.freq.findIndex((f) => f >= goal.loudAt_hz);
    const limit = r.limitedBy[Math.max(0, i)] ?? "none";
    const relRef = r.summary.referenceSpl;
    out.push({
      key: `${row.id}:${box}${bandpass ? bandpass.order : ""}`,
      driverId: row.id,
      name: d.name,
      brand: d.brand,
      box,
      // A bandpass box's size is both chambers.
      vb_l: r1(bandpass ? bandpass.rear_l + bandpass.front_l : vb),
      ...(fb ? { fb: r1(fb) } : {}),
      ...(port ? { port } : {}),
      ...(line ? { line } : {}),
      ...(bandpass ? { bandpass } : {}),
      ...(pr ? { pr } : {}),
      ...(sp && box !== "line"
        ? (() => {
            const holds = r1(box === "bandpass" ? bpHolds : netIn(design, prDispUsed));
            // A bandpass search steps its chamber sizes: within half a litre fills it.
            const fills = r1(bandpass ? bandpass.rear_l + bandpass.front_l : vb) >= holds - (bandpass ? 0.5 : 0.15);
            return { space: { holds_l: holds, fills, ...(fills && port && needsSpace(port, vb) ? { portUsesSpace: true } : {}) } };
          })()
        : {}),
      ...(gd ? { gd } : {}),
      wiring: wiring.wiring,
      ...(wiring.dvc ? { dvcWired: wiring.dvc } : {}),
      load_ohm: wiring.load,
      f3,
      loud_db: r1(Math.min(spl, max)),
      limitedBy: max < spl ? limit : "power",
      over: lim.over,
      ...(lim.over.length ? { safe_w: watts(lim.safeScale) } : {}),
      ...(lim.deep ? { deep: { below_hz: Math.round(lim.deep.below_hz), safe_w: watts(lim.deep.scale) } } : {}),
      ...(below > 1 ? { subsonic: { below_hz: Math.round(floor), safe_w: watts(1 / below) } } : {}),
      // A bandpass box's gain isn't a hump: its ripple across the band is.
      peak_db: r1(bandpass ? bandRipple(r, room ? (f: number) => roomGainDb(f, room) : undefined) : peakOf(r)),
      curve: CURVE_FREQS.map((f) => r1(at(r.freq, r.spl, f) - (room ? roomGainDb(f, room) : 0) - relRef)),
      notes,
    });
  };

  /**
   * Bandpass boxes, 4th and 6th order (parallel), sized within the largest box allowed by the
   * app's own bandpass sizing (sizeBandpass), with the band reaching down near the target F3.
   */
  function evaluateBandpass() {
    const search = (order: BandpassOrder, maxVolume_l: number) =>
      sizeBandpass(
        newDesign("bandpass", []) as BandpassDesign,
        al,
        air,
        {
          orders: [order],
          maxVolume_l,
          endCorrection: endCorrectionOf(s),
          drivers: goal.drivers,
          priority: goal.priority === "loud" ? "loud" : "low",
          loudAt_hz: goal.loudAt_hz,
          maxF3_hz: 1.6 * goal.targetF3_hz,
          portLimit: vLimit,
          ...(room ? { roomDb: (f: number) => roomGainDb(f, room) } : {}),
        },
        (design) => run(design, design.vb_l),
        (r) => limitsOf(r, d.xmax_mm!, false, vLimit, aLimit),
      )[order];
    // In a space: the driver sits in a divider across it (its panel takes room, as do the
    // ports in their chambers); what's left is shared by the two chambers.
    const mount = driverMount(d, row);
    const div = sp ? dividerFor(sp, mount, goal.drivers) : null;
    if (sp && !div) return;
    const budget = sp ? goal.maxVolume_l - div!.divider_l : goal.maxVolume_l;
    const portsOf = (t: BandpassFound) =>
      portDisplacement_l(t.frontPort, s.volume.portWall_mm) + (t.rearPort ? portDisplacement_l(t.rearPort, s.volume.portWall_mm) : 0);
    for (const order of ["4", "6p"] as BandpassOrder[]) {
      let t = search(order, budget);
      // The ports come out of the same space: sized again with less room until they fit.
      for (let k = 0; sp && t && k < 4; k++) {
        const over = t.design.vb_l + t.design.frontVb_l + portsOf(t) - budget;
        if (over <= 0.05) break;
        t = search(order, t.design.vb_l + t.design.frontVb_l - over - 0.1);
      }
      if (!t) continue;
      const b = t.design;
      if (sp) {
        if (b.vb_l + b.frontVb_l + portsOf(t) > budget + 0.05) continue;
        // The driver's magnet is in the rear chamber: it needs the depth behind the divider.
        if ((b.vb_l * 1000) / div!.area_cm2 < mount.depth_cm) continue;
        bpHolds = budget - portsOf(t);
      }
      finish("bandpass", b, b.vb_l, [], b.front.targetFb, undefined, undefined, {
        order: t.order,
        rear_l: b.vb_l,
        front_l: b.frontVb_l,
        frontPort: t.frontPort,
        frontFb: b.front.targetFb,
        ...(t.rearPort ? { rearPort: t.rearPort, rearFb: b.rear.targetFb } : {}),
        f3High: r1(t.f3High),
        gain_db: t.gain_db,
      });
    }
  }

  /**
   * The ported box's size and tuning (also a PR box's): QB3/B4 or Keele, capped at the largest
   * box allowed; in a smaller box the flattest low tuning; for "smallest", the smallest box
   * that still reaches the target F3. Null when the driver doesn't suit one.
   */
  function ventedBox(): { vb: number; fb: number; notes: string[] } | null {
    const a = ventedAlignmentFor(al, goal.drivers);
    if (!a || !(a.vb_l > 0.3)) return null;
    let vb = Math.min(a.vb_l, goal.maxVolume_l);
    let fb: number | null = a.vb_l <= goal.maxVolume_l ? a.fb : bestFb(vb);
    const notes = a.vb_l > goal.maxVolume_l ? [`${a.name} wants ${r1(a.vb_l)} L; sized to your ${r1(goal.maxVolume_l)} L`] : [];
    if (goal.priority === "small" && fb !== null) {
      const v0 = ventedAt(vb, fb);
      const f3At = (v: number) => {
        const f = bestFb(v);
        const w = f !== null ? ventedAt(v, f) : null;
        return w && f !== null ? { f3: f3Of(run(w.design, v)), fb: f } : null;
      };
      const full = v0 ? f3Of(run(v0.design, vb)) : Infinity;
      if (full > goal.targetF3_hz) return null;
      let lo = Math.max(0.3, vb / 20);
      let hi = vb;
      let hiFb: number = fb;
      for (let k = 0; k < 8 && hi - lo > 0.05; k++) {
        const mid = Math.sqrt(lo * hi);
        const t = f3At(mid);
        if (t && t.f3 <= goal.targetF3_hz) {
          hi = mid;
          hiFb = t.fb;
        } else lo = mid;
      }
      vb = hi;
      fb = hiFb;
    }
    return fb === null ? null : { vb, fb, notes };
  }

  /**
   * Passive radiator boxes: the ported box's size and tuning, with the database's passive
   * radiators tried by the app's PR finder (groups of 1, 2 or 4, tuned with added mass; a PR
   * that runs out of travel before the driver, needs over 3 × its own mass added, or won't fit
   * a face of the box is out). The best that passes, as the finder ranks them.
   */
  function evaluatePr(prs: PrCandidateWithParams[]) {
    if (!al || d.xmax_mm === undefined) return;
    // In a space, a PR's frame has to fit a face of it (estimated from its cone when the database has no cutout).
    if (sp) {
      const face = insideOf(sp)[1]!;
      prs = prs.filter((c) => (c.od_cm ?? 1.3 * 2 * Math.sqrt(c.pr.sd_cm2 / Math.PI)) <= face);
      if (!prs.length) return;
    }
    const box = ventedBox();
    if (!box) return;
    // In a space, the drivers and every PR have to go on its faces together.
    const drivers = Array.from({ length: goal.drivers }, () => driverMount(d, row));
    const fitsWith = (id: string, count: number) => {
      if (!sp) return true;
      const c = prs.find((x) => x.id === id)!;
      const pr = { d_cm: c.od_cm ?? 1.3 * 2 * Math.sqrt(c.pr.sd_cm2 / Math.PI), depth_cm: 0 };
      return mountsFit([...drivers, ...Array.from({ length: count }, () => pr)], sp);
    };
    const find = (vb: number) =>
      rankPrResults([...evaluatePrCandidates(drv, prs, { vb_l: vb, targetFb: box.fb, sim: opts, losses, counts: [1, 2, 4], fMin: checkFromHz(false) })].flat()).find(
        (x) => x.ok && fitsWith(x.id, x.count),
      );
    let found = find(box.vb);
    if (!found) return;
    // In a space, the PRs take room too: if the box filled it, try again a little smaller.
    // Shrinking can change which PR (or how many) wins, and so what they displace: repeat until
    // the pick fits (it used to stop after one try, and a bulkier pick overfilled the space).
    if (sp) {
      for (let k = 0; ; k++) {
        const c0 = prs.find((x) => x.id === found!.id)!;
        prDispUsed = c0.displacement_l ?? s.volume.prDisp_l;
        const cap = netIn({ ...(newDesign("pr", []) as PrDesign), count: found.count }, prDispUsed);
        if (box.vb <= cap + 0.05) break;
        if (k === 4) return;
        box.vb = cap;
        found = find(cap);
        if (!found) return;
      }
    }
    const c = prs.find((x) => x.id === found!.id)!;
    // No space given: nothing says what shape the box is, so it isn't ruled out, but say when
    // the driver and PRs won't all go on a cube-shaped box of this volume (a 15″ PR on a tower).
    const notes = [...box.notes];
    if (!sp) {
      const side = Math.cbrt(box.vb * 1000);
      const od = c.od_cm ?? 1.3 * 2 * Math.sqrt(c.pr.sd_cm2 / Math.PI);
      const parts = [...drivers, ...Array.from({ length: found.count }, () => ({ d_cm: od, depth_cm: 0 }))];
      if (!mountsFit(parts, { width_cm: side, height_cm: side, depth_cm: side, wall_mm: 0 })) {
        notes.push(
          `The driver and ${found.count > 1 ? `${found.count} PRs` : "PR"} (${Math.round(od)} cm across${found.count > 1 ? " each" : ""}) won't all fit the panels of a cube-shaped ${r1(box.vb)} L box: plan the box around them, or use My space to check it`,
        );
      }
    }
    const base = newDesign("pr", []) as PrDesign;
    const design: PrDesign = {
      ...base,
      vb_l: r1(box.vb),
      prName: found.name,
      params: c.params,
      count: found.count,
      addedMass_g: Math.round(found.addedMass_g),
      targetFb: r1(box.fb),
      extra: [],
    };
    finish("pr", design, box.vb, notes, box.fb, undefined, undefined, undefined, {
      name: found.name,
      count: found.count,
      addedMass_g: Math.round(found.addedMass_g),
      prUse: Math.round(found.prUse * 100) / 100,
      design,
      ...(c.displacement_l !== undefined ? { displacement_l: c.displacement_l } : {}),
    });
  }

  if (stage === "pr") {
    if (goal.boxes.includes("pr") && prs?.length) evaluatePr(prs);
    return out;
  }
  if (stage === "lines") {
    if (goal.boxes.includes("line") && LINE_USES.includes(goal.use)) evaluateLines();
    return out;
  }
  if (stage === "bandpass") {
    if (goal.boxes.includes("bandpass") && BANDPASS_USES.includes(goal.use)) evaluateBandpass();
    return out;
  }

  // Sealed: Qtc 0.707, or the largest box allowed (a higher Qtc); "smallest" shrinks it to the target F3.
  if (goal.boxes.includes("sealed")) {
    const ideal = sealedVolumeForAlignment(align, 0.707, goal.drivers);
    if (ideal !== null && ideal > 0.3) {
      let vb = Math.min(ideal, goal.maxVolume_l);
      const notes = ideal > goal.maxVolume_l ? [`Qtc 0.707 wants ${r1(ideal)} L; sized to your ${r1(goal.maxVolume_l)} L`] : [];
      let ok = true;
      if (goal.priority === "small") {
        const f3At = (v: number) => f3Of(run({ ...sealed, vb_l: v }, v));
        if (f3At(vb) > goal.targetF3_hz) ok = false;
        else {
          let lo = Math.max(0.3, vb / 20);
          let hi = vb;
          if (f3At(lo) <= goal.targetF3_hz) hi = lo;
          for (let k = 0; k < 9 && hi - lo > 0.05; k++) {
            const mid = Math.sqrt(lo * hi);
            if (f3At(mid) <= goal.targetF3_hz) hi = mid;
            else lo = mid;
          }
          vb = hi;
        }
      }
      const n0 = out.length;
      if (ok) finish("sealed", { ...sealed, vb_l: vb }, vb, notes);
      // In a space, the Qtc 0.707 box may leave room: a second sealed box that fills it, kept
      // when it reaches lower (a lower Q; a driver with a low Qts gains little, or even loses).
      const cap = goal.maxVolume_l;
      if (sp && out.length > n0 && goal.priority !== "small" && vb < cap - 1 && vb < 0.9 * cap) {
        const n = out.length;
        const qts = (al.qms * al.qes) / (al.qms + al.qes);
        const qtc = qts * Math.sqrt(1 + (goal.drivers * al.vas_l) / cap);
        finish("sealed", { ...sealed, vb_l: cap }, cap, [`Qtc 0.707 needs only ${r1(vb)} L; this one fills your space (Qtc ${qtc.toFixed(2)}) and goes deeper`]);
        if (out.length > n) {
          if (out[n]!.f3 < 0.97 * out[n0]!.f3) out[n]!.key += ":full";
          else out.pop();
        }
      }
    }
  }

  /**
   * Transmission lines: each type from the app's line presets (sized for the driver), narrowed
   * (cross-sections scaled) to hold no more than the largest box allowed, then tuned once and
   * an MLTL's port sized for the goal's power. Lines too long to fold into a tower, or that
   * won't tune near the preset's target, are left out.
   */
  function evaluateLines() {
    const wall = s.volume.wall_mm;
    const blank = newDesign("line", []) as LineDesign;
    const narrowTo = (d: LineDesign, f: number): LineDesign => ({
      ...d,
      closedArea_cm2: r1(d.closedArea_cm2 * f),
      sections: d.sections.map((x) => ({ ...x, endArea_cm2: r1(x.endArea_cm2 * f) })),
      portDiameter_cm: r1(d.portDiameter_cm * Math.sqrt(f)),
    });
    for (const type of LINE_TYPES) {
      const preset = presetFor(type, blank, drv, align, goal.drivers);
      // Tuning keeps roughly the preset's length: one far too long to fold isn't worth tuning.
      if (typeof preset === "string" || lineLength(preset) > 1.15 * LINE_MAX_CM) continue;
      const wants = lineVolume(preset);
      const narrowed = wants > goal.maxVolume_l ? narrowTo(preset, (0.95 * goal.maxVolume_l) / wants) : preset;
      const tuned = tuneLine(drv, narrowed, preset.targetFb, opts, wall);
      if (typeof tuned === "string") continue;
      let cur: LineDesign = { ...tuned, targetFb: preset.targetFb };
      // Tuning changes the length (and so the volume): narrow once more if it grew past the
      // limit. An MLTL retunes quickly (its port); an open line's tuning barely moves with its
      // width, and the check on Fb below catches it if it does.
      if (lineVolume(cur) > goal.maxVolume_l * 1.02) {
        cur = narrowTo(cur, (0.97 * goal.maxVolume_l) / lineVolume(cur));
        if (cur.end === "port") {
          const again = tuneLine(drv, cur, preset.targetFb, opts, wall);
          if (typeof again === "string") continue;
          cur = { ...again, targetFb: preset.targetFb };
        }
      }
      const sized = sizeMltlPort(drv, cur, opts, wall, (vLimit * 15) / 17);
      if (typeof sized !== "string") cur = sized;
      const vb = lineVolume(cur);
      if (!(vb > 0) || vb > goal.maxVolume_l * 1.02 || lineLength(cur) > LINE_MAX_CM) continue;
      // Narrowed too far: a line much thinner than the cones chokes them (and sounds boxy),
      // which the simulation underplays. Judged on its average cross-section, since a tapered
      // line is meant to be narrower at one end.
      const areas = [cur.closedArea_cm2, ...cur.sections.map((x) => x.endArea_cm2)];
      const mean = areas.reduce((a, b) => a + b, 0) / areas.length;
      if (mean < LINE_MIN_AREA * drv.sd_cm2 * goal.drivers) continue;
      // It has to fold into a cabinet you'd build: else it's left out.
      const folded = foldFor(
        { ...cur, vb_l: r1(vb) },
        s.volume.wall_mm,
        (row.size_in ?? 8) * 25.4 * 0.92,
        goal.use === "tower" ? 100 : 70,
        sp ? { height_cm: sp.height_cm, width_cm: sp.width_cm, depth_cm: sp.depth_cm } : LINE_FOLD_MAX,
      );
      if (!folded) continue;
      const design = folded.design;
      const fb = run(design, vb).summary.fb;
      if (fb === undefined || Math.abs(fb / preset.targetFb - 1) > 0.25) continue;
      const label = LINE_LABEL[type];
      const notes = wants > goal.maxVolume_l * 1.02 ? [`The ${label} preset wants ${r1(wants)} L; narrowed to fit your ${r1(goal.maxVolume_l)} L`] : [];
      finish("line", design, vb, notes, fb, undefined, { type, label, length_cm: r1(lineLength(design)), design, fold: folded.fold });
    }
  }

  // Ported: QB3/B4 or Keele; in a smaller box, the flattest low tuning; ports that fit.
  if (goal.boxes.includes("vented")) {
    const box0 = ventedBox();
    /** The box and its port; in a space, shrunk by the port's share if it filled it. */
    const fit = (vb0: number, fb: number, useSpace: boolean) => {
      let vb = vb0;
      let v = bestPort(vb, fb, useSpace);
      if (!sp || !v) return v ? { vb, ...v } : null;
      // Meant to fill it: follow what's left after the port (a smaller box may take a smaller
      // port, leaving room again), keeping the last box that fits.
      const filling = vb0 >= netIn(v.design) - 0.15;
      let fits: { vb: number; design: VentedDesign; port: AssistantPort } | null = null;
      for (let k = 0; v && k < 6; k++) {
        const cap = netIn(v.design);
        if (vb <= cap + 0.05) {
          fits = { vb, ...v };
          if (!filling || vb >= cap - 0.15) break;
        }
        vb = cap;
        v = bestPort(vb, fb, useSpace);
      }
      return fits;
    };
    /**
     * A port that only fits the space's real inside needs the box built to it (it opens linked
     * to the calculator): a box a little short of filling it grows to fill it, else it gets a
     * port that fits any box of its volume.
     */
    const settle = (got: ReturnType<typeof fit>, fb: number) => {
      if (!sp || !got || !needsSpace(got.port, got.vb) || got.vb >= netIn(got.design) - 0.15) return got;
      const grown = fit(netIn(got.design), fb, true);
      return grown && grown.vb >= netIn(grown.design) - 0.15 ? grown : fit(got.vb, fb, false);
    };
    const got = box0 ? settle(fit(box0.vb, box0.fb, true), box0.fb) : null;
    const n0 = out.length;
    if (box0 && got) finish("vented", { ...got.design, vb_l: r1(got.vb) }, got.vb, box0.notes, box0.fb, got.port);
    // In a space, the alignment's box may leave room: a second ported box that fills it, tuned
    // for the lowest flat F3 there, kept when it reaches noticeably lower.
    const cap = goal.maxVolume_l;
    if (sp && box0 && out.length > n0 && goal.priority !== "small" && got!.vb < 0.9 * cap - 1) {
      const fb = bestFb(cap);
      const full = fb !== null ? settle(fit(cap, fb, true), fb) : null;
      if (full && fb !== null && full.vb > got!.vb + 1 && full.vb >= netIn(full.design) - 0.15) {
        const n = out.length;
        finish("vented", { ...full.design, vb_l: r1(full.vb) }, full.vb, [`The flat alignment needs only ${r1(got!.vb)} L; this one fills your space, tuned for it, and goes deeper`], fb, full.port);
        if (out.length > n) {
          if (out[n]!.f3 < 0.97 * out[n0]!.f3) out[n]!.key += ":full";
          else out.pop();
        }
      }
    }
  }

  return out;
}

/** Best first, by the goal's priority; designs over a limit at full power (graded as the app does) after all those within. */
export function rankResults(results: AssistantResult[], goal: AssistantGoal): AssistantResult[] {
  // Within every limit first; deep-bass-only results among them (a small nudge when balanced).
  const ok = (r: AssistantResult) => (r.over.length === 0 ? 0 : 1);
  const f3 = (r: AssistantResult) => r.f3;
  let list = [...results];
  if (goal.priority === "deep") list.sort((a, b) => ok(a) - ok(b) || f3(a) - f3(b) || b.loud_db - a.loud_db);
  else if (goal.priority === "loud") list.sort((a, b) => ok(a) - ok(b) || b.loud_db - a.loud_db || f3(a) - f3(b));
  else if (goal.priority === "small") list.sort((a, b) => ok(a) - ok(b) || a.vb_l - b.vb_l || f3(a) - f3(b));
  else {
    // Balanced: the sum of each result's place on F3, output and size (and a penalty for a hump).
    const place = (key: (r: AssistantResult) => number) => {
      const sorted = [...list].sort((a, b) => key(a) - key(b));
      return new Map(sorted.map((r, i) => [r.key, i / Math.max(1, sorted.length - 1)]));
    };
    const pf = place(f3);
    const pl = place((r) => -r.loud_db);
    const pv = place((r) => r.vb_l);
    const score = (r: AssistantResult) => pf.get(r.key)! + pl.get(r.key)! + 0.6 * pv.get(r.key)! + Math.max(0, r.peak_db - 1.5) * 0.3 + (r.deep ? 0.3 : 0);
    list.sort((a, b) => ok(a) - ok(b) || score(a) - score(b));
  }
  // Badges: the best of the list on each measure.
  const top = list.slice(0, 50);
  const best = (key: (r: AssistantResult) => number) => top.reduce<AssistantResult | null>((m, r) => (r.over.length === 0 && (!m || key(r) < key(m)) ? r : m), null);
  const tag = (r: AssistantResult | null, label: string) => {
    if (r) r.badges = [...(r.badges ?? []), label];
  };
  list = list.map((r) => ({ ...r, badges: undefined }));
  tag(best(f3), "Deepest");
  tag(best((r) => -r.loud_db), "Loudest");
  tag(best((r) => r.vb_l), "Smallest");
  return list;
}

/**
 * Starting a project from results (one, or the same driver's sealed and ported boxes): its
 * driver becomes the main one, wired as scored, at the goal's power and room, and its boxes
 * replace the designs (the assistant starts projects; it doesn't add to one).
 */
export function openResults(s: AppState, d: LoadedDriver, rs: AssistantResult[], goal: AssistantGoal): AppState {
  const r0 = rs[0]!;
  const t = trialState(s, d, goal, { load: r0.load_ohm, wiring: r0.wiring, dvc: r0.dvcWired });
  const model = d.name.startsWith(d.brand) ? d.name.slice(d.brand.length).trim() : d.name;
  const designs: DesignState[] = [];
  for (const r of rs.slice(0, MAX_DESIGNS)) {
    const base = newDesign(r.box, designs);
    const kind = r.box === "sealed" ? "Sealed" : r.box === "line" ? (r.line?.label ?? "Line") : "Ported";
    if (r.box === "pr" && r.pr) {
      designs.push({ ...r.pr.design, id: base.id, on: true, name: `PR ${model}`, preset: "Assistant" });
      continue;
    }
    if (r.box === "bandpass" && r.bandpass) {
      const b = r.bandpass;
      const bp = base as BandpassDesign;
      designs.push({
        ...bp,
        name: `Bandpass ${b.order === "4" ? "4th" : "6th"} ${model}`,
        order: b.order,
        vb_l: b.rear_l,
        frontVb_l: b.front_l,
        frontOpening: "port",
        rearOpening: "port",
        front: chamberPortFields(b.frontPort, b.frontFb, bp.front),
        rear: b.rearPort && b.rearFb ? chamberPortFields(b.rearPort, b.rearFb, bp.rear) : bp.rear,
        preset: "Assistant",
      });
      continue;
    }
    if (r.box === "line" && r.line) {
      designs.push({ ...r.line.design, id: base.id, on: true, name: `${kind} ${model}`, preset: "Assistant" } as LineDesign);
      continue;
    }
    // The second box of a kind that fills the space: told apart by its name.
    const name = `${kind} ${model}${r.key.endsWith(":full") ? " (fills space)" : ""}`;
    designs.push(
      r.box === "vented" && r.port
        ? { ...(base as VentedDesign), name, vb_l: r.vb_l, ...portFieldsOf(r.port), targetFb: r.fb ?? 30, preset: "Assistant" }
        : { ...base, name, vb_l: r.vb_l, preset: "Assistant" },
    );
  }
  return {
    ...s,
    driverName: t.driverName,
    driverBrand: t.driverBrand,
    nominal_ohms: t.nominal_ohms,
    ts: t.ts,
    le_mh: t.le_mh,
    l2_mh: t.l2_mh,
    r2_ohm: t.r2_ohm,
    semi: t.semi,
    fdd: t.fdd,
    xmax_mm: t.xmax_mm,
    pe_w: t.pe_w,
    // "Fit my space": the calculator set to the space; the first box that fills it takes its
    // volume from there (so the app shows the same net volume, after the driver and ports).
    volume: (() => {
      if (!goal.space) return { ...t.volume, link: "none" };
      const v = withSpace(t, goal.space).volume;
      const shown = rs.slice(0, MAX_DESIGNS);
      // A port that only fits the space's real inside needs the link (the app checks it against
      // the calculator's longest inside dimension then); else the first box that fills it.
      const byPort = shown.findIndex((r) => r.space?.portUsesSpace);
      const i = byPort >= 0 ? byPort : shown.findIndex((r) => r.space?.fills && (r.box === "sealed" || r.box === "vented" || r.box === "pr"));
      if (i < 0) return v;
      const r = rs[i]!;
      return { ...v, link: designs[i]!.id, ...(r.pr?.displacement_l !== undefined ? { prDisp_l: r.pr.displacement_l } : {}) };
    })(),
    dvc: t.dvc,
    drive: t.drive,
    power: t.power,
    drivers: t.drivers,
    wiring: t.wiring,
    isobaric: false,
    compare: null,
    // Scored on any amp, with no filter.
    highPass: { ...s.highPass, on: false },
    passive: { ...s.passive, on: false },
    roomGain: goal.use === "car" ? t.roomGain : s.roomGain.mode === "car" ? { ...s.roomGain, mode: "off" } : s.roomGain,
    designs,
  };
}

/**
 * A shared list of results: the goal, the chuffing line it was graded against, and the box
 * type shown. The list itself isn't in the link: the assistant works it out again from the
 * same goal (with the database as it is when the link is opened).
 */
export interface SharedResults {
  goal: AssistantGoal;
  portLimit_ms?: number;
  only?: AssistantBox | "all";
  /** The database build it was shared from (DbIndex.generated): the list can differ after an update. */
  db?: string;
}

const B64 = (b: Uint8Array) => btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const UNB64 = (t: string) => Uint8Array.from(atob(t.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));

/** The part of a link after "#assistant=". */
const sharedJson = (x: SharedResults) =>
  JSON.stringify({
    v: 1,
    g: x.goal,
    ...(x.portLimit_ms ? { pl: x.portLimit_ms } : {}),
    ...(x.only && x.only !== "all" ? { o: x.only } : {}),
    ...(x.db ? { d: x.db } : {}),
  });

/** The part of a link after "#assistant=" (plain base64url JSON, which always starts "eyJ"). */
export function encodeShared(x: SharedResults): string {
  return B64(new TextEncoder().encode(sharedJson(x)));
}

/** The short form: "z" + the JSON deflated (about half as long); the plain form where the browser can't compress. */
export async function encodeSharedShort(x: SharedResults): Promise<string> {
  return canCompress() ? "z" + (await deflateToB64Url(sharedJson(x))) : encodeShared(x);
}

/** Either form; null if it isn't one. */
export async function decodeSharedAny(text: string): Promise<SharedResults | null> {
  if (!text.startsWith("z")) return decodeShared(text);
  if (!canCompress()) return null;
  try {
    return sharedOf(JSON.parse(await inflateFromB64Url(text.slice(1))));
  } catch {
    return null;
  }
}

const BOXES: AssistantBox[] = ["sealed", "vented", "pr", "line", "bandpass"];
const PRIORITY_IDS: AssistantPriority[] = ["balanced", "deep", "loud", "small"];
const num = (v: unknown, lo: number, hi: number) => (typeof v === "number" && Number.isFinite(v) && v >= lo && v <= hi ? v : undefined);

/** A shared link's results, checked field by field (anything odd falls back to the use's defaults); null if it isn't one. */
export function decodeShared(text: string): SharedResults | null {
  try {
    return sharedOf(JSON.parse(new TextDecoder().decode(UNB64(text))));
  } catch {
    return null;
  }
}

function sharedOf(raw: Record<string, unknown>): SharedResults | null {
  const g = raw?.g as Record<string, unknown> | undefined;
  if (!g || typeof g.use !== "string" || !(g.use in USES)) return null;
  const priority = PRIORITY_IDS.includes(g.priority as AssistantPriority) ? (g.priority as AssistantPriority) : "balanced";
  const base = goalFor(g.use as AssistantUse, priority);
  const sp = g.space as Record<string, unknown> | undefined;
  const space =
    sp && num(sp.width_cm, 5, 500) && num(sp.height_cm, 5, 500) && num(sp.depth_cm, 5, 500)
      ? { width_cm: sp.width_cm as number, height_cm: sp.height_cm as number, depth_cm: sp.depth_cm as number, wall_mm: num(sp.wall_mm, 1, 60) ?? 18 }
      : undefined;
  const boxes = Array.isArray(g.boxes) ? (g.boxes as unknown[]).filter((b): b is AssistantBox => BOXES.includes(b as AssistantBox)) : base.boxes;
  const goal: AssistantGoal = {
    ...base,
    maxVolume_l: num(g.maxVolume_l, 0.5, 5000) ?? base.maxVolume_l,
    power_w: num(g.power_w, 1, 50000) ?? base.power_w,
    minLoad_ohm: num(g.minLoad_ohm, 0.5, 32) ?? base.minLoad_ohm,
    drivers: g.drivers === 2 ? 2 : 1,
    sizeMin_in: num(g.sizeMin_in, 1, 30) ?? base.sizeMin_in,
    sizeMax_in: num(g.sizeMax_in, 1, 30) ?? base.sizeMax_in,
    boxes: boxes.length ? boxes : base.boxes,
    brands: Array.isArray(g.brands) ? (g.brands as unknown[]).filter((b): b is string => typeof b === "string").slice(0, 100) : [],
    loudAt_hz: num(g.loudAt_hz, 10, 500) ?? base.loudAt_hz,
    targetF3_hz: num(g.targetF3_hz, 10, 500) ?? base.targetF3_hz,
    ...(space ? { space } : {}),
  };
  const pl = num(raw.pl, 5, 60);
  const o = raw.o === "all" || BOXES.includes(raw.o as AssistantBox) ? (raw.o as AssistantBox | "all") : undefined;
  const db = typeof raw.d === "string" && raw.d.length <= 40 ? raw.d : undefined;
  return { goal, ...(pl ? { portLimit_ms: pl } : {}), ...(o ? { only: o } : {}), ...(db ? { db } : {}) };
}

/** ", past the 75 % where a PR's suspension stiffens", when the PRs' share of travel is over the caution set in Settings. */
export function prCautionNote(prUse: number, caution_pct: number): string {
  return caution_pct > 0 && prUse * 100 > caution_pct ? `, past the ${caution_pct} % where a PR's suspension stiffens (rule of thumb)` : "";
}
