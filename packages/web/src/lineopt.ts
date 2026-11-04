import { simulate, type DriverInput, type SimulationOptions } from "@sbg/engine";
import { lineInputOf, lineLength } from "./sim.ts";
import type { LineDesign } from "./state.ts";

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
