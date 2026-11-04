/**
 * Baffle step and edge diffraction for a driver on a flat rectangular front baffle,
 * heard on its axis.
 *
 * Edge-source model (Vanderkooy, "A simple theory of cabinet edge diffraction",
 * JAES 1991; the approach of The Edge and VituixCAD's diffraction tool): sound reaching
 * an edge of the baffle is re-radiated by that edge with half the strength and inverted
 * sign, delayed by the extra path. Each piece of the perimeter is weighted by the angle
 * it takes up as seen from the driver, so the whole edge has weight 1:
 *
 *   H(f) = 1 − ½ · Σ wᵢ · e^(−jk·(dᵢ + √(dᵢ² + r²) − r))
 *
 * where dᵢ is the distance from the driver to that bit of edge and r the listening
 * distance. At low frequencies H → ½ (−6 dB: the cabinet radiates into full space
 * instead of the half space of an infinite baffle); well above the step H → 1, with
 * ripples whose size depends on how evenly the edges sit around the driver. The result
 * is averaged over the cone (a point source exaggerates the ripples).
 *
 * Only the front baffle is modelled (no rounded edges, sides or floor), as in the
 * usual design tools; it is the baffle step that matters for bass and midbass design.
 */

export interface Baffle {
  /** Baffle size (m). */
  width: number;
  height: number;
  /** Driver centre, from the left edge and from the top edge (m). */
  x: number;
  y: number;
  /** Cone area (cm²), to average over the cone. Optional. */
  sd_cm2?: number;
  /** Listening distance on axis (m). Default 1 (well into the far field for the step). */
  distance?: number;
  /** Speed of sound (m/s). Default 343. */
  c?: number;
}

/** Edge points around the baffle as seen from (sx, sy): angle weight and distance. */
function edges(b: Baffle, sx: number, sy: number, n = 720): { w: number; d: number }[] {
  // Walk the perimeter in small steps; weight each step by the angle it covers from the source.
  const pts: [number, number][] = [];
  const per = 2 * (b.width + b.height);
  for (let i = 0; i < n; i++) {
    let s = (i / n) * per;
    let p: [number, number];
    if (s < b.width) p = [s, 0];
    else if ((s -= b.width) < b.height) p = [b.width, s];
    else if ((s -= b.height) < b.width) p = [b.width - s, b.height];
    else p = [0, b.height - (s - b.width)];
    pts.push(p);
  }
  const out: { w: number; d: number }[] = [];
  for (let i = 0; i < n; i++) {
    const a = pts[i]!;
    const c = pts[(i + 1) % n]!;
    const a1 = Math.atan2(a[1] - sy, a[0] - sx);
    const a2 = Math.atan2(c[1] - sy, c[0] - sx);
    let da = a2 - a1;
    while (da > Math.PI) da -= 2 * Math.PI;
    while (da < -Math.PI) da += 2 * Math.PI;
    const mx = (a[0] + c[0]) / 2 - sx;
    const my = (a[1] + c[1]) / 2 - sy;
    out.push({ w: Math.abs(da) / (2 * Math.PI), d: Math.hypot(mx, my) });
  }
  // Normalise (the angles add up to 2π for a source inside the baffle).
  const sum = out.reduce((t, e) => t + e.w, 0);
  for (const e of out) e.w /= sum;
  return out;
}

/** Source points spread over the cone: the centre and a ring at 0.7 × the cone radius. */
function sourcePoints(b: Baffle): [number, number][] {
  if (!(b.sd_cm2! > 0)) return [[b.x, b.y]];
  const a = 0.7 * Math.sqrt(b.sd_cm2! / 1e4 / Math.PI);
  const pts: [number, number][] = [[b.x, b.y]];
  for (let k = 0; k < 6; k++) pts.push([b.x + a * Math.cos((k * Math.PI) / 3), b.y + a * Math.sin((k * Math.PI) / 3)]);
  return pts;
}

/**
 * On-axis gain (dB) of the baffle relative to an infinite baffle (half space), at each
 * frequency. About −6 dB well below the step, 0 dB well above it, with diffraction ripple.
 */
export function baffleStepDb(freqs: ArrayLike<number>, b: Baffle): Float64Array {
  if (!(b.width > 0 && b.height > 0)) throw new Error("Baffle size must be positive");
  const r = b.distance ?? 1;
  const c = b.c ?? 343;
  const sources = sourcePoints(b).map(([sx, sy]) => {
    // Keep each source point on the baffle.
    const x = Math.min(b.width - 1e-4, Math.max(1e-4, sx));
    const y = Math.min(b.height - 1e-4, Math.max(1e-4, sy));
    return edges(b, x, y).map((e) => ({ w: e.w, path: e.d + Math.sqrt(e.d * e.d + r * r) - r }));
  });
  const out = new Float64Array(freqs.length);
  for (let i = 0; i < freqs.length; i++) {
    const k = (2 * Math.PI * freqs[i]!) / c;
    let re = 0;
    let im = 0;
    for (const edgesOf of sources) {
      let dr = 0;
      let di = 0;
      for (const e of edgesOf) {
        dr += e.w * Math.cos(k * e.path);
        di -= e.w * Math.sin(k * e.path);
      }
      re += 1 - 0.5 * dr;
      im += -0.5 * di;
    }
    re /= sources.length;
    im /= sources.length;
    out[i] = 10 * Math.log10(re * re + im * im);
  }
  return out;
}

/**
 * Frequency where the step is half done (−3 dB), from a computed response; the usual
 * rule of thumb is 115 / baffle width (m).
 */
export function baffleStepFrequency(b: Baffle): number {
  const f: number[] = [];
  for (let x = 20; x <= 5000; x *= 1.02) f.push(x);
  const db = baffleStepDb(f, b);
  for (let i = f.length - 1; i > 0; i--) {
    if (db[i - 1]! < -3 && db[i]! >= -3) {
      const t = (-3 - db[i - 1]!) / (db[i]! - db[i - 1]!);
      return f[i - 1]! * (f[i]! / f[i - 1]!) ** t;
    }
  }
  return 115 / b.width;
}
