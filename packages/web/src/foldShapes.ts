import type { Fold } from "@sbg/engine";

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
  kind: "outer" | "inner" | "divider" | "driver" | "mouth" | "chamber";
}

/**
 * Side view of a folded line as rectangles (mm; x = front to back, y = top down): the box,
 * its inside, the dividers, the driver (on the front, on a divider for a tapped horn, or on
 * the motor board of a front horn's driver section) and the mouth or port opening (on the
 * back; on the front for a front horn). Shared by the on-screen drawing, the build
 * sheet and the forum image.
 */
export function foldShapes(f: Fold, wall_mm: number): Rect[] {
  const { outside, inside, runs, gaps } = f;
  const t = wall_mm;
  const h = f.horn;
  // A front horn: the horn part starts below the driver section, and its runs are mirrored
  // (run 1 at the back).
  const y0 = t + (h?.top ?? 0);
  const mx = (r: Rect): Rect => (h ? { ...r, x: outside.depth - r.x - r.w } : r);
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
      out.push(mx({ x, y: r.down ? y0 : y0 + g, w: wall_mm, h: inside.height - g, kind: "divider" }));
      x += wall_mm;
    }
  });
  const last = runs.at(-1)!;
  if (h) {
    const inner = outside.depth - 2 * t;
    // Rear chamber, motor board with the driver, throat chamber, throat board with the slot at the back.
    out.push({ x: t, y: t, w: inner, h: h.rear, kind: "chamber" });
    const mb = t + h.rear;
    out.push({ x: t, y: mb, w: inner, h: t, kind: "divider" });
    const cw = Math.min(h.cutout > 0 ? h.cutout : inner * 0.6, inner);
    out.push({ x: outside.depth / 2 - cw / 2, y: mb - 15, w: cw, h: t + 30, kind: "driver" });
    const tb = mb + t + h.throat;
    out.push({ x: t, y: tb, w: Math.max(0, inner - h.slot), h: t, kind: "divider" });
    const my = f.mouth.at === "top" ? y0 : outside.height - t - last.depth;
    out.push({ x: -20, y: my, w: t + 25, h: last.depth, kind: "mouth" });
    return out;
  }
  if (f.driverOnDivider) {
    const i = f.driverOnDivider.index;
    const dx = t + runs.slice(0, i + 1).reduce((a, r) => a + r.depth, 0) + i * wall_mm;
    out.push({ x: dx - 20, y: f.driverOnDivider.fromTop - 60, w: wall_mm + 40, h: 120, kind: "driver" });
  } else if (f.driverFromTop !== null) {
    out.push({ x: -20, y: f.driverFromTop - 60, w: 40, h: 120, kind: "driver" });
  }
  const my = f.mouth.at === "top" ? t : outside.height - t - last.depth;
  out.push({ x: outside.depth - t - 5, y: my, w: t + 25, h: last.depth, kind: "mouth" });
  return out;
}
