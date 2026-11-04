import { simulate, type AlignmentDriver, type DriverInput, type SimulationOptions } from "@sbg/engine";
import { lineInputOf, lineLength, lineVolume } from "./sim.ts";
import { ventedAlignmentFor } from "./presets.ts";
import type { LineDesign, LineSection } from "./state.ts";

const C = 343;
const r1 = (x: number) => Math.round(x * 10) / 10;

/** Tuning of a line design, by simulation (impedance minimum between the first two peaks). */
export function lineTuning(driver: DriverInput, d: LineDesign, sim: SimulationOptions, wall_mm = 18): number | null {
  try {
    const r = simulate(driver, lineInputOf(d, wall_mm), { ...sim, fMin: 8, fMax: 400, points: 260, highPass: null, eq: [] });
    return r.summary.fb ?? null;
  } catch {
    return null;
  }
}

/** The design with every length along the line scaled by k (sections, driver, tap). */
const scaled = (d: LineDesign, k: number): LineDesign => ({
  ...d,
  sections: d.sections.map((x) => ({ ...x, length_cm: x.length_cm * k })),
  driverAt_cm: d.driverAt_cm * k,
  tapAt_cm: d.tapAt_cm * k,
});

/**
 * Change one setting until the line tunes to `target`: the line's length (sections,
 * driver and tap scale with it) for open lines and tapped horns, the port length for a
 * mass-loaded line. Steps out from the current size until bracketed, then bisects.
 */
export function tuneLine(driver: DriverInput, d: LineDesign, target: number, sim: SimulationOptions, wall_mm = 18): LineDesign | string {
  const port = d.end === "port";
  const withK = (k: number): LineDesign => (port ? { ...d, portLength_cm: k } : scaled(d, k));
  const fbAt = (k: number) => lineTuning(driver, withK(k), sim, wall_mm);
  const k0 = port ? Math.max(d.portLength_cm, 1) : 1;
  const f0 = fbAt(k0);
  if (f0 === null) return "The tuning can't be found for this line (no clear impedance dip): check its sizes.";
  const step = 1.25;
  let lo = k0;
  let hi = k0;
  if (f0 > target) {
    for (let i = 0; ; i++) {
      hi *= step;
      const f = fbAt(hi);
      if (f !== null && f <= target) break;
      if (i > 12 || f === null) return port ? `No port length up to ${Math.round(hi)} cm tunes down to ${target} Hz: use a narrower port or a bigger line.` : `${target} Hz needs a much longer line; check the driver and the areas.`;
      lo = hi;
    }
  } else {
    for (let i = 0; ; i++) {
      lo /= step;
      const f = fbAt(lo);
      if (f !== null && f >= target) break;
      if (i > 12 || f === null || (port && lo < 0.3)) return port ? `Even a very short port tunes below ${target} Hz: use a wider port or a smaller line.` : `${target} Hz needs a much shorter line; check the driver and the areas.`;
      hi = lo;
    }
  }
  for (let i = 0; i < 24; i++) {
    const mid = Math.sqrt(lo * hi);
    const f = fbAt(mid);
    if (f === null) break;
    if (f > target) lo = mid;
    else hi = mid;
  }
  const out = withK(Math.sqrt(lo * hi));
  return {
    ...out,
    sections: out.sections.map((x) => ({ ...x, length_cm: r1(x.length_cm) })),
    driverAt_cm: r1(out.driverAt_cm),
    tapAt_cm: r1(out.tapAt_cm),
    portLength_cm: r1(out.portLength_cm),
  };
}

export type PresetId = "tl" | "tqwt" | "otl" | "mltl" | "th" | "flh";

export const PRESETS: { id: PresetId; label: string; title: string }[] = [
  { id: "tl", label: "Classic TL", title: "Tapered line, driver at the closed end, stuffed for two thirds; tuned to Fs" },
  { id: "tqwt", label: "TQWT", title: "Tapered quarter-wave tube (Voigt pipe): narrow closed end opening to a wide mouth, driver a third along, lightly stuffed" },
  { id: "otl", label: "Offset TL", title: "Straight line with the driver a fifth of the way along (suppresses the 5th harmonic), stuffed behind the driver" },
  { id: "mltl", label: "MLTL", title: "Mass-loaded line: straight, driver a quarter along and stuffed behind it, port at the mouth (sized for the power); tuned like a vented box" },
  { id: "th", label: "Tapped horn", title: "Starting point: expanding horn, driver's rear just below the closed end, front tapped level with it in the next run (folded twice); tuned near Fs" },
  { id: "flh", label: "Front horn", title: "Front-loaded exponential horn: throat half the cone area, mouth sized for the cutoff (half space), sealed rear chamber, throat chamber for a top end about 4 × the cutoff" },
];

/** Split [0, L] into stuffed and empty sections along a taper from s1 to s2. */
function twoPart(L: number, s1: number, s2: number, stuffedTo: number, fill: number): { closedArea_cm2: number; sections: LineSection[] } {
  const at = (t: number) => r1(s1 + (s2 - s1) * t);
  const sections: LineSection[] = [];
  if (stuffedTo > 0) sections.push({ length_cm: r1(stuffedTo), endArea_cm2: at(stuffedTo / L), taper: "linear", fill_kgm3: fill });
  if (L - stuffedTo > 0) sections.push({ length_cm: r1(L - stuffedTo), endArea_cm2: r1(s2), taper: "linear", fill_kgm3: 0 });
  return { closedArea_cm2: r1(s1), sections };
}

/**
 * A front-loaded exponential horn for this driver with flare cutoff `fc`: throat ½ Sd
 * (compression 2:1), mouth for a normalised circumference of 1 in half space (area λ²/8π),
 * sealed rear chamber ½ Vas, throat chamber for an upper roll-off near 4 × fc.
 */
export function frontHorn(d: LineDesign, driver: DriverInput, drivers: number, fc: number): LineDesign {
  const sd = driver.sd_cm2 * drivers;
  const s1 = 0.5 * sd;
  const lambda = C / fc;
  const s2 = Math.max(s1 * 2, ((lambda * lambda) / (8 * Math.PI)) * 1e4);
  const m = (4 * Math.PI * fc) / C;
  const L = (Math.log(s2 / s1) / m) * 100;
  const vtc = ((s1 / 1e4) * C) / (2 * Math.PI * 4 * fc) * 1000;
  return {
    ...d,
    end: "horn",
    closedArea_cm2: r1(s1),
    sections: [{ length_cm: r1(L), endArea_cm2: Math.round(s2), taper: "exponential", fill_kgm3: 0 }],
    driverAt_cm: 0,
    rearChamber_l: r1(Math.max(2, (driver.vas_l * drivers) / 2)),
    throatChamber_l: r1(vtc),
    mouth: "front",
    targetFb: r1(fc),
  };
}

/** A preset sized for the driver, before tuning. */
export function presetFor(id: PresetId, d: LineDesign, driver: DriverInput, align: AlignmentDriver | null, drivers: number): LineDesign | string {
  const sd = driver.sd_cm2 * drivers;
  const lq = (C / (4 * driver.fs)) * 100; // quarter wave at Fs, cm
  // Fold width: room for the driver's cutout (about 1.12 × the cone diameter) plus a margin.
  const width_cm = Math.max(d.fold.width_cm, Math.ceil(1.12 * 2 * Math.sqrt(driver.sd_cm2 / Math.PI) + 3));
  const base = { ...d, portFlare_cm: 0, fold: { ...d.fold, width_cm } };
  switch (id) {
    case "tl":
      return { ...base, end: "open", ...twoPart(lq, 1.25 * sd, 0.8 * sd, (lq * 2) / 3, 8), driverAt_cm: 0, targetFb: r1(driver.fs) };
    case "tqwt":
      return { ...base, end: "open", ...twoPart(lq, 0.3 * sd, 3 * sd, lq / 3, 4), driverAt_cm: r1(lq / 3), targetFb: r1(driver.fs * 0.9) };
    case "otl":
      return { ...base, end: "open", ...twoPart(lq, 1.5 * sd, 1.5 * sd, lq / 3, 6), driverAt_cm: r1(lq / 5), targetFb: r1(driver.fs) };
    case "mltl": {
      const a = align ? ventedAlignmentFor(align, drivers) : null;
      if (!a) return "This driver's Qts is above 0.6: a mass-loaded line (like a ported box) doesn't suit it. Try a classic TL or TQWT.";
      // Long and slim: about 0.4 of a quarter wave at the tuning, holding about 1.5 × the
      // matching ported box's volume (the line's own losses need more room).
      const L = 0.4 * (C / (4 * a.fb)) * 100;
      const area = (1.5 * a.vb_l * 1000) / L;
      const portD = 2 * Math.sqrt((0.2 * sd) / Math.PI);
      return { ...base, end: "port", ...twoPart(L, area, area, L / 4, 8), driverAt_cm: r1(L / 4), portDiameter_cm: r1(portD), portLength_cm: 10, targetFb: r1(a.fb) };
    }
    case "th":
    {
      // Rear a little way from the closed end (the driver must fit on the divider below the
      // top), the tap level with it in the next run up when folded twice.
      const dia = 2 * Math.sqrt(driver.sd_cm2 / Math.PI);
      const rear = Math.max(0.08 * lq, 0.8 * dia);
      return { ...base, end: "tapped", ...twoPart(lq, sd, 4 * sd, 0, 0), driverAt_cm: r1(rear), tapAt_cm: r1((2 * lq) / 3 - rear), targetFb: r1(driver.fs) };
    }
    case "flh":
      return frontHorn(base, driver, drivers, Math.max(40, Math.round(driver.fs)));
  }
}



/** How a line sounds, in two numbers: its low-frequency edge and the ripple above it. */
export interface LineScore {
  f3: number;
  /** Peak-to-peak variation of the response from 1.5 × F3 (at least 40 Hz) to 400 Hz, dB. */
  ripple: number;
}

export function scoreLine(driver: DriverInput, d: LineDesign, sim: SimulationOptions, wall_mm = 18): LineScore | null {
  try {
    const r = simulate(driver, lineInputOf(d, wall_mm), { ...sim, fMin: 10, fMax: 400, points: 200, highPass: null, eq: [] });
    const f3 = r.summary.f3;
    if (f3 === null) return null;
    const ref = r.summary.referenceSpl;
    let lo = Infinity;
    let hi = -Infinity;
    const from = Math.max(1.5 * f3, 40);
    for (let i = 0; i < r.freq.length; i++) {
      if (r.freq[i]! < from) continue;
      lo = Math.min(lo, r.spl[i]! - ref);
      hi = Math.max(hi, r.spl[i]! - ref);
    }
    return Number.isFinite(lo) ? { f3, ripple: hi - lo } : null;
  } catch {
    return null;
  }
}

export type LineGoal = "smooth" | "deep";

export interface LineBest {
  design: LineDesign;
  score: LineScore;
  before: LineScore | null;
  /** What changed, in words. */
  summary: string;
  tried: number;
  /** Clearly better than the line as it is. */
  better: boolean;
}

const POSITIONS = [0, 0.1, 0.15, 0.2, 0.25, 0.33, 0.4];
const DENSITIES = [4, 8, 12];

/**
 * Best driver position and stuffing for the line as drawn: every combination of a driver
 * position (fractions of the length; kept for tapped horns) and stuffing (none, or the first
 * k sections at 4, 8 or 12 kg/m³) is simulated. "smooth": least ripple without raising F3
 * more than 10 %. "deep": lowest F3 without adding more than 1 dB of ripple.
 * The caller retunes the length afterwards.
 */
export function bestLine(driver: DriverInput, d: LineDesign, sim: SimulationOptions, goal: LineGoal, wall_mm = 18): LineBest | null {
  const L = lineLength(d);
  const positions = d.end === "tapped" ? [d.driverAt_cm / L] : POSITIONS;
  const fills: { k: number; dens: number }[] = [{ k: 0, dens: 0 }];
  for (let k = 1; k <= d.sections.length; k++) for (const dens of DENSITIES) fills.push({ k, dens });
  const tried: { design: LineDesign; score: LineScore; pos: number; fill: { k: number; dens: number } }[] = [];
  for (const pos of positions) {
    for (const fill of fills) {
      const design: LineDesign = {
        ...d,
        driverAt_cm: Math.round(pos * L * 10) / 10,
        sections: d.sections.map((x, i) => ({ ...x, fill_kgm3: i < fill.k ? fill.dens : 0 })),
      };
      // A tapped horn's front tap must stay ahead of the rear.
      if (design.end === "tapped" && design.tapAt_cm <= design.driverAt_cm) continue;
      const score = scoreLine(driver, design, sim, wall_mm);
      if (score) tried.push({ design, score, pos, fill });
    }
  }
  if (tried.length === 0) return null;
  // Judged against the line as it is now, so the answer never trades away what it has:
  // "smooth" keeps the bass within 10 % (or the deepest found, if now has none), "deep"
  // allows at most 1 dB more ripple than now (or than the smoothest found).
  const before = scoreLine(driver, d, sim, wall_mm);
  const f3Ref = before?.f3 ?? Math.min(...tried.map((t) => t.score.f3));
  const rippleRef = before?.ripple ?? Math.min(...tried.map((t) => t.score.ripple));
  const pool =
    goal === "smooth"
      ? tried.filter((t) => t.score.f3 <= 1.1 * f3Ref).sort((a, b) => a.score.ripple - b.score.ripple || a.score.f3 - b.score.f3)
      : tried.filter((t) => t.score.ripple <= rippleRef + 1).sort((a, b) => a.score.f3 - b.score.f3 || a.score.ripple - b.score.ripple);
  if (pool.length === 0) return null;
  const best = pool[0]!;
  const where = best.pos === 0 ? "at the closed end" : `${Math.round(best.pos * 100)} % along the line`;
  const stuffing =
    best.fill.k === 0
      ? "no stuffing"
      : `${best.fill.dens} kg/m³ in the first ${best.fill.k === d.sections.length ? "whole line" : best.fill.k === 1 ? "section" : `${best.fill.k} sections`}`;
  return {
    design: best.design,
    score: best.score,
    before,
    better: !before || (goal === "smooth" ? best.score.ripple < before.ripple - 0.5 : best.score.f3 < before.f3 * 0.97),
    summary: d.end === "tapped" ? `Stuffing: ${stuffing}.` : `Driver ${where}; ${stuffing}.`,
    tried: tried.length,
  };
}

/** Peak air speed (m/s) at the mouth or port of a line, at the drive in `sim`. */
export function exitVelocity(driver: DriverInput, d: LineDesign, sim: SimulationOptions, wall_mm = 18): number | null {
  try {
    const r = simulate(driver, lineInputOf(d, wall_mm), { ...sim, fMin: 10, fMax: 400, points: 160, highPass: null, eq: [] });
    if (!r.portVelocity) return null;
    let v = 0;
    for (const x of r.portVelocity) v = Math.max(v, x);
    return v;
  } catch {
    return null;
  }
}

/**
 * A mass-loaded line's port sized for the drive: widened (and flared, r = 0.2 × Ø) until the
 * peak air speed is under `limit`, the port length retuned each time. Never wider than 80 %
 * of the line's mouth (it would stop being a port).
 */
export function sizeMltlPort(driver: DriverInput, d: LineDesign, sim: SimulationOptions, wall_mm = 18, limit = 15): LineDesign | string {
  if (d.end !== "port") return d;
  const mouth = d.sections.at(-1)!.endArea_cm2;
  const maxD = 2 * Math.sqrt((0.8 * mouth) / Math.PI);
  let cur = d;
  for (let i = 0; i < 6; i++) {
    const v = exitVelocity(driver, cur, sim, wall_mm);
    if (v === null || v <= limit) return cur;
    // Air speed scales about inversely with the area: grow the diameter by √(v / limit).
    let dia = Math.min(maxD, cur.portDiameter_cm * Math.sqrt((v / limit) * 1.05));
    if (dia <= cur.portDiameter_cm + 0.05) {
      if (cur.portFlare_cm > 0) return cur; // as wide as it can be
      dia = cur.portDiameter_cm;
    }
    const next = { ...cur, portDiameter_cm: r1(dia), portFlare_cm: r1(0.2 * dia) };
    const tuned = tuneLine(driver, next, d.targetFb, sim, wall_mm);
    if (typeof tuned === "string") return cur;
    cur = { ...tuned, targetFb: d.targetFb };
  }
  return cur;
}

/** A preset for this driver, tuned (and, for an MLTL, its port sized for the drive). */
export function makePreset(id: PresetId, driver: DriverInput, d: LineDesign, sim: SimulationOptions, align: AlignmentDriver | null, drivers: number, wall_mm = 18): LineDesign | string {
  const base = presetFor(id, d, driver, align, drivers);
  if (typeof base === "string") return base;
  if (base.end === "horn") return { ...base, vb_l: r1(lineVolume(base)) }; // sized by its cutoff, not tuned
  const tuned = tuneLine(driver, base, base.targetFb, sim, wall_mm);
  if (typeof tuned === "string") return tuned;
  const out = { ...tuned, targetFb: base.targetFb };
  const sized = sizeMltlPort(driver, out, sim, wall_mm);
  return typeof sized === "string" ? out : { ...sized, vb_l: r1(lineVolume(sized)) };
}

/** One line type, sized from its preset and tuned, as simulated at the chosen drive. */
export interface LineCompare {
  id: PresetId;
  label: string;
  /** The tuned design, or why it can't be made. */
  design: LineDesign | null;
  error?: string;
  fb: number | null;
  f3: number | null;
  ripple: number | null;
  length_cm: number;
  volume_l: number;
  /** Peak cone excursion from 0.7 × F3 up (below that a line unloads like a ported box; use a high-pass). */
  excursion_mm: number | null;
  /** Peak air speed at the mouth or port (m/s). */
  exitVelocity: number | null;
  /** Short verdicts: "Deepest", "Smallest", "Over Xmax"… filled in by rankLines. */
  tags: string[];
}

/**
 * Make one type for this driver: its preset, tuned to the preset's target, then simulated.
 * Slow (a tuning search, ~30 simulations): the UI runs the types one at a time.
 */
export function compareOne(id: PresetId, driver: DriverInput, d: LineDesign, sim: SimulationOptions, align: AlignmentDriver | null, drivers: number, wall_mm = 18): LineCompare {
  const label = PRESETS.find((x) => x.id === id)!.label;
  const empty = { id, label, design: null, fb: null, f3: null, ripple: null, length_cm: 0, volume_l: 0, excursion_mm: null, exitVelocity: null, tags: [] };
  const made = makePreset(id, driver, d, sim, align, drivers, wall_mm);
  if (typeof made === "string") return { ...empty, error: made };
  const design = { ...made, vb_l: r1(lineVolume(made)) };
  try {
    const r = simulate(driver, lineInputOf(design, wall_mm), { ...sim, fMin: 10, fMax: 400, points: 200, highPass: null, eq: [] });
    const score = scoreLine(driver, design, sim, wall_mm);
    const f3 = score?.f3 ?? r.summary.f3 ?? null;
    let x = 0;
    for (let i = 0; i < r.freq.length; i++) if (f3 === null || r.freq[i]! >= 0.7 * f3) x = Math.max(x, r.excursionMm[i]!);
    let v = 0;
    if (r.portVelocity) for (const s of r.portVelocity) v = Math.max(v, s);
    return {
      ...empty,
      design,
      fb: r.summary.fb ?? null,
      f3,
      ripple: score?.ripple ?? null,
      length_cm: lineLength(design),
      volume_l: lineVolume(design),
      excursion_mm: x,
      exitVelocity: r.portVelocity ? v : null,
    };
  } catch (e) {
    return { ...empty, error: e instanceof Error ? e.message : "Couldn't simulate this line." };
  }
}

/** Tag the rows: deepest, smallest, smoothest, and any over the driver's Xmax or 17 m/s. */
export function rankLines(rows: LineCompare[], xmax_mm: number | undefined, velocityLimit = 17): LineCompare[] {
  const ok = rows.filter((r) => r.design && r.f3 !== null);
  const pick = (key: (r: LineCompare) => number) => ok.reduce<LineCompare | null>((a, r) => (a === null || key(r) < key(a) ? r : a), null);
  const deepest = pick((r) => r.f3!);
  const smallest = pick((r) => r.volume_l);
  const smoothest = pick((r) => r.ripple ?? Infinity);
  return rows.map((r) => {
    const tags: string[] = [];
    if (r === deepest) tags.push("Deepest");
    if (r === smallest) tags.push("Smallest");
    if (r === smoothest) tags.push("Smoothest");
    if (xmax_mm !== undefined && r.excursion_mm !== null && r.excursion_mm > xmax_mm) tags.push("Over Xmax");
    if (r.exitVelocity !== null && r.exitVelocity > velocityLimit) tags.push("Noisy mouth");
    return { ...r, tags };
  });
}

export function compareLines(driver: DriverInput, d: LineDesign, sim: SimulationOptions, align: AlignmentDriver | null, drivers: number, wall_mm = 18): LineCompare[] {
  return rankLines(
    PRESETS.map((x) => compareOne(x.id, driver, d, sim, align, drivers, wall_mm)),
    driver.xmax_mm,
  );
}
