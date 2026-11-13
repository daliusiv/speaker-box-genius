import { abs, add, cx, mul, scale, type Complex } from "./complex.ts";

/** How two outputs some distance apart add up: in front of the box, or from their total power. */
export type PathMode = "on-axis" | "power";

/**
 * Two sources (the cone and a port, PR group or line mouth; or a 6th-order box's two ports)
 * d_m apart, as volume velocities: what the listener gets.
 * - d = 0: side by side, `a + b` exactly.
 * - "on-axis": `b` is d farther from the listener than `a`: it arrives d/c later at the same level (far field,
 *   like the 1 m SPL itself, and as VituixCAD has a rear vent). A 1/r level drop is left out on purpose: below
 *   the tuning the two nearly cancel, and a level mismatch would leave bass that isn't there far away.
 * - "power": like Hornresp's Acoustic Path Length, the two as point sources d apart, their power
 *   summed over all directions: |a|² + |b|² + 2·Re(a·b*)·sinc(kd). Only the level changes; the phase
 *   stays the side-by-side one, as Hornresp's exports have it.
 */
export function combineAtDistance(a: Complex, b: Complex, d_m: number, w: number, c: number, mode: PathMode): Complex {
  if (!(d_m > 0)) return add(a, b);
  const kd = (w * d_m) / c;
  if (mode === "on-axis") {
    return add(a, mul(b, cx(Math.cos(kd), -Math.sin(kd))));
  }
  const sum = add(a, b);
  const pw = abs(a) ** 2 + abs(b) ** 2 + 2 * (a.re * b.re + a.im * b.im) * (Math.sin(kd) / kd);
  const m = abs(sum);
  return m > 0 ? scale(sum, Math.sqrt(Math.max(pw, 0)) / m) : sum;
}
