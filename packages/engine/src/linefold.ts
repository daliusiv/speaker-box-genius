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
  /**
   * Tapped horn: where the driver's front opens into the line (mm from the closed end).
   * The driver then mounts on the divider between the run with its rear and the next run.
   */
  tap_mm?: number;
  /**
   * Front-loaded horn (litres): the line is the horn, its closed end the throat. The horn
   * folds below a driver section the full depth of the box: the sealed rear chamber on top,
   * the motor board with the driver firing down, the throat chamber, and the throat board
   * with the throat slot over run 1. Run 1 is at the back, so the mouth opens on the front.
   */
  horn?: { rear_l: number; throat_l: number };
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
  /** Tapped horn: the divider the driver mounts on (0-based) and its centre from the top (outside, mm). */
  driverOnDivider?: { index: number; fromTop: number };
  /** Tapped horn: the tap position (mm along the line) that lines up with the rear across the divider. */
  tapLinedUp_mm?: number;
  /**
   * Front-loaded horn: heights (mm, inside) of the rear chamber and the throat chamber in the
   * driver section on top, the section's total height (both chambers and the two boards),
   * the throat slot's depth (front to back, at the back) and the driver cutout. The runs are
   * mirrored: run 1 at the back.
   */
  horn?: { rear: number; throat: number; top: number; slot: number; cutout: number };
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
  // Front-loaded horn: the driver section sits on top of the folded horn.
  let horn: Fold["horn"];
  if (i.horn) {
    const footprint = W * depthIn; // mm²
    const rear = (Math.max(0, i.horn.rear_l) * 1e6) / footprint;
    const throat = Math.max(25, (Math.max(0, i.horn.throat_l) * 1e6) / footprint);
    horn = { rear, throat, top: rear + t + throat + t, slot: depthAt(0), cutout: i.driverCutout ?? 0 };
  }
  const outside = { width: W + 2 * i.wall, height: H + 2 * i.wall + (horn?.top ?? 0), depth: depthIn + 2 * i.wall };

  // Outer box from the standard cut list, then the dividers and the line's own holes.
  const box = cutList({ width: outside.width, height: outside.height, depth: outside.depth, wall: i.wall });
  const dividers: Panel[] = gaps.map((g, k) => {
    const h = H - g;
    return { name: `Divider ${k + 1} (${runs[k]!.down ? "from the top" : "from the bottom"})`, qty: 1, a: Math.max(h, W), b: Math.min(h, W) };
  });
  if (horn) {
    dividers.push(
      { name: "Motor board (driver, horizontal)", qty: 1, a: Math.max(W, depthIn), b: Math.min(W, depthIn) },
      { name: "Throat board (horizontal)", qty: 1, a: Math.max(W, depthIn), b: Math.min(W, depthIn) },
    );
  }
  if (dividers.some((d) => !(d.a > 0 && d.b > 0))) warnings.push("A divider would have no height: use fewer folds.");

  const last = runs[runs.length - 1]!;
  const mouthAt = last.down ? "bottom" : "top";
  // With one run the line stands straight behind the front panel and opens through the back;
  // a front horn's runs are mirrored, so its mouth opens on the front.
  const mouthPanel: "back" | "front" = horn ? "front" : "back";
  const mouth = { panel: mouthPanel, at: mouthAt as "top" | "bottom", height: last.depth };
  const Panel_ = mouthPanel === "front" ? "Front" : "Back";
  const holes: Hole[] = [];
  let driverFromTop: number | null = null;
  let driverOnDivider: Fold["driverOnDivider"];
  let tapLinedUp_mm: number | undefined;
  // Height (inside, from the top) of a point along the line within run k.
  const yIn = (k: number, x: number) => {
    const r = runs[k]!;
    const t = Math.min(1, Math.max(0, (x - r.from) / (r.to - r.from)));
    return r.down ? t * H : (1 - t) * H;
  };
  const runOf = (x: number) => Math.max(0, runs.findIndex((r) => x >= r.from - 1e-6 && x <= r.to + 1e-6));
  if (horn) {
    const cut = horn.cutout;
    if (cut > 0) {
      holes.push({ name: "Driver cutout", qty: 1, diameter: cut, where: "Motor board, centred (the driver fires down into the throat chamber)" });
      if (cut > Math.min(W, depthIn)) warnings.push(`The driver cutout (${Math.round(cut)} mm) doesn't fit on the motor board (${Math.round(W)} × ${Math.round(depthIn)} mm): widen the box or fold more.`);
    }
    holes.push({ name: "Throat slot", qty: 1, width: W, height: horn.slot, where: "Throat board, along the back edge (over run 1)" });
    if (horn.slot < 30) warnings.push(`The throat slot is only ${Math.round(horn.slot)} mm across (the throat's area over the full ${Math.round(W)} mm width): fine acoustically, but a narrower box gives a more practical slot.`);
    // Spread over the whole top of the box, a chamber may be too shallow to build as set.
    const litresFor = (mm: number) => Math.ceil((W * depthIn * mm) / 1e6);
    if (horn.rear < 100)
      warnings.push(
        `Spread over the top of the box the rear chamber is only ${Math.round(horn.rear)} mm tall: the magnet needs about 100 mm, i.e. a rear chamber of about ${litresFor(100)} L or more (a bigger rear chamber lowers the bass roll-off), or a narrower box.`,
      );
    if ((Math.max(0, i.horn!.throat_l) * 1e6) / (W * depthIn) < 25)
      warnings.push(
        `The throat chamber as set would be under 25 mm tall over the whole box; it's drawn at 25 mm (about ${litresFor(25)} L) so the cone can move. Set the throat chamber to that to simulate what you'd build: the top end rolls off lower.`,
      );
  } else if (i.tap_mm !== undefined) {
    // Tapped horn: the driver straddles a divider, rear in one run and front in the next.
    const kr = runOf(i.driverAt_mm);
    const kf = runOf(i.tap_mm);
    if (n < 2) {
      warnings.push("A tapped horn needs at least one fold: the driver mounts on a divider between the rear and the front of the line.");
    } else if (kf !== kr + 1) {
      warnings.push(`The driver's rear (run ${kr + 1}) and the front tap (run ${kf + 1}) must be in neighbouring runs, so the driver can sit on the divider between them: change the number of folds or the tap.`);
    } else {
      const yr = yIn(kr, i.driverAt_mm);
      const yf = yIn(kf, i.tap_mm);
      const rf = runs[kf]!;
      // Keep it inside the run (a point at the very end would sit in the turn).
      const span = rf.to - rf.from;
      tapLinedUp_mm = rf.from + Math.min(0.97, Math.max(0.03, rf.down ? yr / H : 1 - yr / H)) * span;
      const fromTop = i.wall + (yr + yf) / 2;
      driverOnDivider = { index: kr, fromTop };
      const cut = i.driverCutout && i.driverCutout > 0 ? i.driverCutout : 0;
      if (cut > 0) {
        holes.push({ name: "Driver cutout", qty: 1, diameter: cut, where: `Divider ${kr + 1}, centre ${Math.round(fromTop)} mm from the top of the box` });
        if (cut > W) warnings.push(`The driver cutout (${Math.round(cut)} mm) is wider than the line (${Math.round(W)} mm): widen the line.`);
        const tol = Math.max(cut / 4, 20);
        if (Math.abs(yr - yf) > tol)
          warnings.push(
            `The rear (${Math.round(i.wall + yr)} mm from the top) and the front tap (${Math.round(i.wall + yf)} mm) are at different heights across divider ${kr + 1}: a tap at about ${Math.round(tapLinedUp_mm / 10)} cm lines them up.`,
          );
        const top = i.wall + Math.min(yr, yf) - cut / 2;
        const gapK = gaps[kr]!;
        // The divider hangs from the top when run kr goes down, so it stops a gap short of the bottom.
        const divTop = runs[kr]!.down ? i.wall : i.wall + gapK;
        const divBottom = runs[kr]!.down ? i.wall + H - gapK : i.wall + H;
        if (top < divTop || i.wall + Math.max(yr, yf) + cut / 2 > divBottom) warnings.push(`The driver doesn't fit on divider ${kr + 1} at that height: move the rear and the tap along the line.`);
      }
      if (Math.min(runs[kr]!.depth, rf.depth) < 60) warnings.push("The runs either side of the driver are very shallow: the magnet may not fit.");
    }
  } else if (i.driverAt_mm <= runs[0]!.to) {
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
    holes.push({ name: "Mouth opening", qty: 1, width: W, height: last.depth, where: `${Panel_}, at the ${mouthAt}${horn && mouthAt === "top" ? " of the horn (just under the throat board)" : ""}` });
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
  return { runs, gaps, inside, outside, cut, mouth, driverFromTop, warnings, ...(horn ? { horn } : {}), ...(driverOnDivider ? { driverOnDivider } : {}), ...(tapLinedUp_mm !== undefined ? { tapLinedUp_mm } : {}) };
}
