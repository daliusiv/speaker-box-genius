import type { Fold } from "@sbg/engine";

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
  kind: "outer" | "inner" | "divider" | "driver" | "mouth";
}

/**
 * Side view of a folded line as rectangles (mm; x = front to back, y = top down): the box,
 * its inside, the dividers, the driver (on the front, or on a divider for a tapped horn)
 * and the mouth or port opening on the back. Shared by the on-screen drawing, the build
 * sheet and the forum image.
 */
export function foldShapes(f: Fold, wall_mm: number): Rect[] {
  const { outside, runs, gaps } = f;
  const t = wall_mm;
  const out: Rect[] = [
    { x: 0, y: 0, w: outside.depth, h: outside.height, kind: "outer" },
    { x: t, y: t, w: outside.depth - 2 * t, h: outside.height - 2 * t, kind: "inner" },
  ];
  let x = t;
  runs.forEach((r, i) => {
    x += r.depth;
    if (i < runs.length - 1) {
      const g = gaps[i]!;
      // A run going down turns at the bottom, so its divider hangs from the top.
      out.push({ x, y: r.down ? t : t + g, w: wall_mm, h: outside.height - 2 * t - g, kind: "divider" });
      x += wall_mm;
    }
  });
  if (f.driverOnDivider) {
    const i = f.driverOnDivider.index;
    const dx = t + runs.slice(0, i + 1).reduce((a, r) => a + r.depth, 0) + i * wall_mm;
    out.push({ x: dx - 20, y: f.driverOnDivider.fromTop - 60, w: wall_mm + 40, h: 120, kind: "driver" });
  } else if (f.driverFromTop !== null) {
    out.push({ x: -20, y: f.driverFromTop - 60, w: 40, h: 120, kind: "driver" });
  }
  const last = runs.at(-1)!;
  const my = f.mouth.at === "top" ? t : outside.height - t - last.depth;
  out.push({ x: outside.depth - t - 5, y: my, w: t + 25, h: last.depth, kind: "mouth" });
  return out;
}
