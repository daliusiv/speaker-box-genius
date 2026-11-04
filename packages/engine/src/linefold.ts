import { cutList, type CutList, type Hole, type Panel } from "./cutlist.ts";
import type { LineSegment } from "./line.ts";

/**
 * Folding a transmission line into a box.
 *
 * The line runs up and down in vertical runs side by side, front to back, separated by
 * divider panels the full width of the box inside. Run 1 sits behind the front baffle with
 * the closed end at the top, so the driver mounts on the front. Each divider leaves a gap
 * at alternate ends (the fold) as wide as the line is deep there, so the area doesn't
 * pinch. The box height is solved so the path along the centre of the line equals the
 * simulated length: each run's straight part plus the sideways step at every fold.
 *
 * Tapered lines: each run gets the line's average depth over that run (the divider is
 * placed for the middle of the run); a real build would slope the dividers.
 * All lengths in mm.
 */

export interface FoldInput {
  segments: LineSegment[];
  /** Inside width of the line (= the box inside width), mm. */
  width: number;
  /** Number of folds (dividers). 0 = a straight line standing up. */
  folds: number;
  /** Outer wall thickness and divider thickness, mm. */
  wall: number;
  divider?: number;
  driverAt_mm: number;
  driverCutout?: number;
  /** Port at the mouth (MLTL): its hole and length. */
  port?: { holeDiameter: number; length: number };
}

export interface Run {
  /** Along the line (mm from the closed end). */
  from: number;
  to: number;
  /** Depth of this run front to back (mm). */
  depth: number;
  /** Going down (from the top) or up. */
  down: boolean;
}

export interface Fold {
  runs: Run[];
  /** Fold gaps (mm), one per divider: where the line turns. */
  gaps: number[];
  inside: { width: number; height: number; depth: number };
  outside: { width: number; height: number; depth: number };
  /** Outer panels, dividers and holes, ready for the cut list and sheet layout. */
  cut: CutList;
  /** Where the mouth (or port) opens: back panel, at the top or bottom. */
  mouth: { panel: "back" | "front"; at: "top" | "bottom"; height: number };
  /** Distance of the driver centre from the top of the front panel (outside), mm. */
  driverFromTop: number | null;
  warnings: string[];
}

const areaAt = (seg: LineSegment, t: number) => {
  const s1 = seg.startArea_cm2;
  const s2 = seg.endArea_cm2;
  if (seg.taper === "conical") return (Math.sqrt(s1) + (Math.sqrt(s2) - Math.sqrt(s1)) * t) ** 2;
  if (seg.taper === "exponential") return s1 * (s2 / s1) ** t;
  return s1 + (s2 - s1) * t;
};

/** Area (mm²) at a distance x (mm) from the closed end. */
export function lineAreaAt(segments: LineSegment[], x: number): number {
  let pos = 0;
  for (const s of segments) {
    const L = s.length_cm * 10;
    if (x <= pos + L || s === segments[segments.length - 1]) return areaAt(s, Math.min(1, Math.max(0, (x - pos) / L))) * 100;
    pos += L;
  }
  return 0;
}

export function foldLine(i: FoldInput): Fold {
  const L = i.segments.reduce((a, s) => a + s.length_cm * 10, 0);
  const n = Math.max(1, Math.round(i.folds) + 1);
  const t = i.divider ?? i.wall;
  const W = i.width;
  const warnings: string[] = [];
  const depthAt = (x: number) => lineAreaAt(i.segments, x) / W;

  // Solve the inside height H: the path along the line is each run's straight part
  // (H less half of each fold gap at its ends) plus a sideways step at every fold (from the
  // middle of one run to the middle of the next), and it must equal L. Fold positions
  // along the line follow from that geometry; depths and gaps follow from the positions.
  let bounds = Array.from({ length: n + 1 }, (_, k) => (k / n) * L);
  let H = L / n;
  let runs: Run[] = [];
  let gaps: number[] = [];
  for (let iter = 0; iter < 60; iter++) {
    runs = bounds.slice(0, -1).map((from, k) => {
      const to = bounds[k + 1]!;
      let sum = 0;
      for (let j = 0; j < 16; j++) sum += depthAt(from + ((j + 0.5) / 16) * (to - from));
      return { from, to, depth: sum / 16, down: k % 2 === 0 };
    });
    gaps = bounds.slice(1, -1).map((x) => depthAt(x));
    const steps = runs.slice(0, -1).map((r, k) => r.depth / 2 + t + runs[k + 1]!.depth / 2);
    const nextH = (L + gaps.reduce((x, g) => x + g, 0) - steps.reduce((x, g) => x + g, 0)) / n;
    const next = [0];
    for (let k = 0; k < n; k++) {
      const straight = nextH - (k > 0 ? gaps[k - 1]! / 2 : 0) - (k < n - 1 ? gaps[k]! / 2 : 0);
      const turns = (k > 0 ? steps[k - 1]! / 2 : 0) + (k < n - 1 ? steps[k]! / 2 : 0);
      next.push(next[k]! + straight + turns);
    }
    const moved = Math.max(Math.abs(nextH - H), ...next.map((x, k) => Math.abs(x - bounds[k]!)));
    H = nextH;
    bounds = next;
    if (moved < 0.01) break;
  }
  if (!(H > 0)) warnings.push("Too many folds for this line: the runs would have no height. Use fewer folds.");
  const tallest = Math.max(...gaps, 0);
  if (H < 2 * tallest + 50) warnings.push("The runs are short compared with the line's depth: fewer folds would give cleaner bends.");

  const depthIn = runs.reduce((a, r) => a + r.depth, 0) + (n - 1) * t;
  const inside = { width: W, height: H, depth: depthIn };
  const outside = { width: W + 2 * i.wall, height: H + 2 * i.wall, depth: depthIn + 2 * i.wall };

  // Outer box from the standard cut list, then the dividers and the line's own holes.
  const box = cutList({ width: outside.width, height: outside.height, depth: outside.depth, wall: i.wall });
  const dividers: Panel[] = gaps.map((g, k) => {
    const h = H - g;
    return { name: `Divider ${k + 1} (${runs[k]!.down ? "from the top" : "from the bottom"})`, qty: 1, a: Math.max(h, W), b: Math.min(h, W) };
  });
  if (dividers.some((d) => !(d.a > 0 && d.b > 0))) warnings.push("A divider would have no height: use fewer folds.");

  const last = runs[runs.length - 1]!;
  const mouthAt = last.down ? "bottom" : "top";
  // With one run the line stands straight behind the front panel and opens through the back.
  const mouth = { panel: "back" as const, at: mouthAt as "top" | "bottom", height: last.depth };
  const holes: Hole[] = [];
  let driverFromTop: number | null = null;
  if (i.driverAt_mm <= runs[0]!.to) {
    // Run 1 goes down from the closed end at the top.
    driverFromTop = i.wall + i.driverAt_mm;
    if (i.driverCutout && i.driverCutout > 0) {
      holes.push({ name: "Driver cutout", qty: 1, diameter: i.driverCutout, where: `Front, centre ${Math.round(driverFromTop)} mm from the top` });
      if (i.driverCutout > W) warnings.push(`The driver cutout (${Math.round(i.driverCutout)} mm) is wider than the line (${Math.round(W)} mm): widen the line.`);
      if (driverFromTop - i.driverCutout / 2 < i.wall) warnings.push("The driver is too close to the closed end to fit: move it a little along the line.");
    }
    if (runs[0]!.depth < 40) warnings.push("Run 1 is very shallow behind the driver: the magnet may not fit.");
  } else {
    warnings.push("The driver isn't in the first run (behind the front panel): move it nearer the closed end, or fold differently.");
  }
  if (i.port) {
    holes.push({ name: "Port hole", qty: 1, diameter: i.port.holeDiameter, where: `Back, at the ${mouthAt}` });
    if (i.port.length > H) warnings.push("The port is longer than the box is tall: bend it or use a wider, shorter port.");
  } else {
    holes.push({ name: "Mouth opening", qty: 1, width: W, height: last.depth, where: `Back, at the ${mouthAt}` });
  }
  const cut: CutList = {
    ...box,
    panels: [...box.panels, ...dividers],
    holes,
    // Dividers already brace the long panels.
    braces: [],
    area_m2: box.panels.reduce((a, p) => a + p.qty * p.a * p.b, 0) / 1e6 + dividers.reduce((a, d) => a + d.a * d.b, 0) / 1e6,
    warnings: [...warnings],
  };
  return { runs, gaps, inside, outside, cut, mouth, driverFromTop, warnings };
}
