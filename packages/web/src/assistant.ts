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
  portLengthForFb,
  roomGainDb,
  sealedVolumeForAlignment,
  simulate,
  type Air,
  type SimulationResult,
} from "@sbg/engine";
import type { DbIndex, LoadedDriver } from "./library.ts";
import { ventedAlignmentFor } from "./presets.ts";
import { PORT_LIMIT, airOf, alignmentDriver, driverInputOf, enclosureOf, limitsOf, portRoom_cm, roomGainOf, simOptionsOf, solveDriver, type LimitKind } from "./sim.ts";
import { MAX_DESIGNS, ROOM_PRESETS, newDesign, type AppState, type DesignState, type VentedDesign } from "./state.ts";

export type AssistantUse = "car" | "home" | "hifi" | "other";
export type AssistantPriority = "balanced" | "deep" | "loud" | "small";
export type AssistantBox = "sealed" | "vented";

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
    goal: { maxVolume_l: 80, power_w: 300, minLoad_ohm: 4, drivers: 1, sizeMin_in: 8, sizeMax_in: 18, boxes: ["sealed", "vented"], loudAt_hz: 30, targetF3_hz: 25 },
  },
  hifi: {
    label: "Hi-fi / bookshelf woofer",
    hint: "The bass driver of a two-way speaker",
    goal: { maxVolume_l: 20, power_w: 50, minLoad_ohm: 4, drivers: 1, sizeMin_in: 4, sizeMax_in: 8, boxes: ["sealed", "vented"], loudAt_hz: 50, targetF3_hz: 45 },
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

/** A port the assistant suggests, as a vented design's fields: a straight or flared tube, or a slot. */
export type AssistantPort =
  | { kind: "straight" | "flared"; diameter_cm: number; flare_cm: number; length_cm: number; count: number }
  | { kind: "slot"; slotWidth_cm: number; slotHeight_cm: number; length_cm: number; count: number };

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
  /** How the drivers (and a DVC driver's coils) are wired, and the load the amplifier sees. */
  wiring: "parallel" | "series";
  dvcWired?: "parallel" | "series";
  load_ohm: number;
  /** F3 as the app shows it (Hz). */
  f3: number;
  /** Output at the goal's frequency (dB SPL), at the power given or the first limit, whichever is lower. */
  loud_db: number;
  /** What sets the output there: "power" (the amplifier), or the first limit. */
  limitedBy: "power" | "thermal" | "xmax" | "port" | "pr-xmax" | "none";
  /** Limits crossed at the goal's power, as the app grades them (cone Xmax, port speed). */
  over: LimitKind[];
  /** Over a limit: the power that keeps every limit (W). */
  safe_w?: number;
  /** Past Xmax only in deep bass (below 0.7 × Fb): from where, and the power that keeps it within (W). */
  deep?: { below_hz: number; safe_w: number };
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

/** The quick filters: size, kind, brand, and enough data to simulate (Xmax included). */
export function prefilter(rows: IndexRow[], goal: AssistantGoal): IndexRow[] {
  const brands = new Set(goal.brands);
  const sub = goal.use === "car" || goal.use === "home";
  return rows.filter((d) => {
    if (!(d.size_in! >= goal.sizeMin_in - 0.01 && d.size_in! <= goal.sizeMax_in + 0.01)) return false;
    if (!(d.xmax_mm! > 0) || !(d.fs! > 0) || !(d.sd_cm2! > 0) || !(d.vas_l! > 0) || !(d.qts! > 0)) return false;
    if (brands.size > 0 && !brands.has(d.brand)) return false;
    // A sub needs some excursion and a low resonance; midranges and tweeters are no use for bass.
    if (/tweeter|compression|midrange|full/i.test(d.type)) return false;
    if (sub && !(d.fs! <= 60)) return false;
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
    xmax_mm: d.xmax_mm ?? s.xmax_mm,
    pe_w: d.pe_w ?? s.pe_w,
    volume: {
      ...s.volume,
      ...(d.displacement_l !== undefined ? { driverDisp_l: d.displacement_l } : {}),
      driverCutout_mm: d.cutout_mm ?? 0,
    },
    // DVC drivers start wired the way their published values were measured.
    dvc: d.dvcWiring ? { on: true, entered: d.dvcWiring, wired: d.dvcWiring } : { ...s.dvc, on: false },
  };
}

/** Round port sizes tried, largest first (cm, inside diameter). */
const PORT_SIZES = [20, 15, 12.5, 10, 7.5, 6, 5, 4, 3];

/**
 * The widest round port (fewest chuffing problems) that still fits straight, by the same rule
 * as the app's "Port too long to fit" check (portRoom_cm: a cube of this volume, less a port
 * diameter). Two ports when one won't fit.
 */
export function choosePort(vb_l: number, fb: number, air: Air): { diameter_cm: number; length_cm: number; count: number } | null {
  for (const count of [1, 2]) {
    for (const d of PORT_SIZES) {
      const len = portLengthForFb(vb_l, { shape: "round", diameter_cm: d, length_cm: 10 }, fb, count, undefined, air);
      if (len > 1 && len <= portRoom_cm(vb_l, d)) return { diameter_cm: d, length_cm: r1(len), count };
    }
  }
  return null;
}

const SLOT_HEIGHTS = [8, 6, 5, 4, 3, 2.5, 2, 1.5];
/** How much faster than the chuffing line a flared port's throat may run (its mouths set the noise). */
const FLARED_THROAT = 2;
const r05 = (v: number) => Math.round(v * 2) / 2;

/**
 * The ports worth trying, simplest to build first, each the largest of its kind that fits
 * straight (portRoom_cm): a plain tube; a tube with round-overs at both ends (a flared port,
 * radius ¼ of the throat as the app suggests, judged at its wider mouths); a slot as wide as
 * the box (a cube's side) along a wall, which only needs its height clear of the opposite wall.
 */
export function portCandidates(vb_l: number, fb: number, air: Air): AssistantPort[] {
  const out: AssistantPort[] = [];
  const straight = choosePort(vb_l, fb, air);
  if (straight) out.push({ kind: "straight", flare_cm: 0, ...straight });
  for (const d of PORT_SIZES) {
    const flare = Math.max(1, r05(d / 4));
    const len = portLengthForFb(vb_l, { shape: "round", diameter_cm: d, length_cm: 10, flare_cm: flare }, fb, 1, undefined, air);
    if (len >= 2 * flare + 1 && len <= portRoom_cm(vb_l, d)) {
      out.push({ kind: "flared", diameter_cm: d, flare_cm: flare, length_cm: r1(len), count: 1 });
      break;
    }
  }
  const width = Math.floor(Math.cbrt(vb_l * 1000) * 2) / 2;
  for (const h of SLOT_HEIGHTS) {
    if (h * 3 > width) continue;
    const len = portLengthForFb(vb_l, { shape: "slot", width_cm: width, height_cm: h, length_cm: 10 }, fb, 1, undefined, air);
    if (len > 1 && len <= portRoom_cm(vb_l, h)) {
      out.push({ kind: "slot", slotWidth_cm: width, slotHeight_cm: h, length_cm: r1(len), count: 1 });
      break;
    }
  }
  return out;
}

/** A port's fields for a vented design. */
export function portFieldsOf(p: AssistantPort): Partial<VentedDesign> {
  const { kind, ...rest } = p;
  return kind === "slot" ? { shape: "slot", flare_cm: 0, ...rest } : { shape: "round", ...rest };
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
    roomGain: goal.use === "car" ? { ...s.roomGain, mode: "car", ...ROOM_PRESETS.car } : { ...s.roomGain, mode: "off" },
    baffle: { ...s.baffle, on: false },
    highPass: { ...s.highPass, on: false },
    eq: [],
    compare: null,
    designs: [],
  };
}

/** Every box type of the goal for one driver, simulated and scored; [] when it can't be tried. */
export function evaluateDriver(base: AppState, row: IndexRow, d: LoadedDriver, goal: AssistantGoal): AssistantResult[] {
  const wiring = loadOptions({ ohms: d.nominal_ohms ?? row.ohms, coil_ohms: row.coil_ohms }, goal)[0];
  if (!wiring || !(d.xmax_mm! > 0)) return [];
  const s = trialState(base, d, goal, wiring);
  const solved = solveDriver(s);
  if (solved.missing.length > 0) return [];
  const align = alignmentDriver(solved, s);
  if (!align) return [];
  const drv = driverInputOf(s, solved);
  const air = airOf(s);
  const room = roomGainOf(s);
  const opts = { ...simOptionsOf(s), fMin: 10, fMax: 300, points: 90, highPass: null, eq: [] };
  const losses = s.settings.losses;

  const run = (design: DesignState, vb: number) => {
    const r = simulate(drv, enclosureOf(design, vb, losses, s.volume.wall_mm), opts);
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
  const ventedAt = (vb: number, fb: number) => {
    const port = portCandidates(vb, fb, air)[0];
    return port ? { design: withPort(vb, fb, port), port } : null;
  };
  /**
   * The final port: the simplest that stays under the chuffing line at the goal's power, else
   * the quietest. A flared port is judged at its mouths (as the app does), but a narrow throat
   * still roars and compresses: its throat may not pass FLARED_THROAT × the line either.
   */
  const bestPort = (vb: number, fb: number) => {
    let best: { design: VentedDesign; port: AssistantPort; v: number } | null = null;
    for (const port of portCandidates(vb, fb, air)) {
      const design = withPort(vb, fb, port);
      const l = limitsOf(run(design, vb), d.xmax_mm!, false);
      const vp = l.vp ?? Infinity;
      const throat = port.kind === "flared" ? (vp * ((port.diameter_cm + 2 * port.flare_cm) / port.diameter_cm) ** 2) / FLARED_THROAT : 0;
      const v = Math.max(vp, throat);
      if (v <= PORT_LIMIT) return { design, port };
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
  const finish = (box: AssistantBox, design: DesignState, vb: number, notes: string[], fb?: number, port?: AssistantResult["port"]) => {
    const r = run(design, vb);
    // No roll-off found in range (a tiny box for a high-Fs pro driver, say): nothing to rank on.
    const f3 = r.summary.f3;
    if (f3 === null) return;
    const lim = limitsOf(r, d.xmax_mm!, false);
    const watts = (scale: number) => Number((goal.power_w * scale * scale).toPrecision(2));
    const spl = at(r.freq, r.spl, goal.loudAt_hz);
    const max = at(r.freq, r.maxSpl, goal.loudAt_hz);
    const i = r.freq.findIndex((f) => f >= goal.loudAt_hz);
    const limit = r.limitedBy[Math.max(0, i)] ?? "none";
    const relRef = r.summary.referenceSpl;
    out.push({
      key: `${row.id}:${box}`,
      driverId: row.id,
      name: d.name,
      brand: d.brand,
      box,
      vb_l: r1(vb),
      ...(fb ? { fb: r1(fb) } : {}),
      ...(port ? { port } : {}),
      wiring: wiring.wiring,
      ...(wiring.dvc ? { dvcWired: wiring.dvc } : {}),
      load_ohm: wiring.load,
      f3,
      loud_db: r1(Math.min(spl, max)),
      limitedBy: max < spl ? limit : "power",
      over: lim.over,
      ...(lim.over.length ? { safe_w: watts(lim.safeScale) } : {}),
      ...(lim.deep ? { deep: { below_hz: Math.round(lim.deep.below_hz), safe_w: watts(lim.deep.scale) } } : {}),
      peak_db: r1(peakOf(r)),
      curve: CURVE_FREQS.map((f) => r1(at(r.freq, r.spl, f) - (room ? roomGainDb(f, room) : 0) - relRef)),
      notes,
    });
  };

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
      if (ok) finish("sealed", { ...sealed, vb_l: vb }, vb, notes);
    }
  }

  // Ported: QB3/B4 or Keele; in a smaller box, the flattest low tuning; ports that fit.
  if (goal.boxes.includes("vented")) {
    const a = ventedAlignmentFor(align, goal.drivers);
    if (a && a.vb_l > 0.3) {
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
        if (full > goal.targetF3_hz) fb = null;
        else {
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
      }
      const v = fb !== null ? bestPort(vb, fb) : null;
      if (v && fb !== null) finish("vented", v.design, vb, notes, fb, v.port);
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
    const kind = r.box === "sealed" ? "Sealed" : "Ported";
    designs.push(
      r.box === "vented" && r.port
        ? { ...(base as VentedDesign), name: `${kind} ${model}`, vb_l: r.vb_l, ...portFieldsOf(r.port), targetFb: r.fb ?? 30, preset: "Assistant" }
        : { ...base, name: `${kind} ${model}`, vb_l: r.vb_l, preset: "Assistant" },
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
    xmax_mm: t.xmax_mm,
    pe_w: t.pe_w,
    volume: { ...t.volume, link: "none" },
    dvc: t.dvc,
    drive: t.drive,
    power: t.power,
    drivers: t.drivers,
    wiring: t.wiring,
    isobaric: false,
    compare: null,
    // Scored on any amp, with no filter.
    highPass: { ...s.highPass, on: false },
    roomGain: goal.use === "car" ? t.roomGain : s.roomGain.mode === "car" ? { ...s.roomGain, mode: "off" } : s.roomGain,
    designs,
  };
}
