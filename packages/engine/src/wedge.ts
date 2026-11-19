/**
 * Car wedge (single slope): a box whose front (or back) panel leans, so it is deeper at the
 * bottom than at the top and sits behind a car's rear seat. Exact inside volume, the solver
 * that sizes one dimension for a target volume, input checks, saw angles and the check that
 * the driver's motor clears the back and bottom of the box.
 *
 * Side view, origin at the outer bottom-back corner: x is depth (towards the front), y height,
 * z width. All lengths in mm, angles in degrees, volumes in litres.
 *
 *   width (W), height (H)     outside width and height
 *   topDepth (D1)             outside depth at the top (the short one)
 *   bottomDepth (D2)          outside depth at the bottom (the long one)
 *   wall (T)                  wall thickness of the sides, top, bottom and the upright panel
 *   slopeWall (Tb)            thickness of the sloped panel (default T; 2T for a double baffle)
 *   lip (L)                   outside height of an upright part under the slope (default 0)
 *
 * With a lip the sloped face starts at height L: below it the face is upright (a lip panel,
 * wall thick) and the slope rises H − L. s = (D2 − D1)/(H − L) = cot θ, θ = atan(H/(D2 − D1)) the slope from horizontal, φ = 90° − θ the
 * slope from vertical (the bevel angle), k = 1/sin θ = √(1 + s²). The sloped panel measured
 * square to its face is Tb thick, so across the horizontal it takes Tb·k. Inside:
 *
 *   V = (W − 2T)(H − 2T)·[(D1 + D2)/2 − T − Tb·k]     (no lip)
 *
 * In general the inside depth at height y is min(D2 − T, D2 − s(y − L) − Tb·k) − T: the lip's
 * inside face below the point yk where it meets the slope's inside face, the slope above; the
 * lip–slope joint runs from the outside corner (D2, L) to that inside corner (D2 − T, yk).
 *
 * The same formula holds with the slope at the back (the driver on an upright front baffle):
 * the profile is the mirror image.
 */

export interface WedgeDims {
  /** Outside width, mm (z). */
  width: number;
  /** Outside height, mm (y). */
  height: number;
  /** Outside depth at the top, mm: the short one. */
  topDepth: number;
  /** Outside depth at the bottom, mm: the long one. */
  bottomDepth: number;
  /** Wall thickness, mm. */
  wall: number;
  /** Thickness of the sloped panel, mm (absent = wall). */
  slopeWall?: number;
  /** Outside height of the upright lip under the slope, mm (absent or 0 = sloped all the way down). */
  lip?: number;
}

/** Which panel slopes: the front (driver on the sloped baffle, the default) or the back (upright baffle). */
export type WedgeSlope = "front" | "rear";
/** Butt joints with bevelled edges (one saw setting, φ) or mitred corners. */
export type WedgeJoinery = "butt" | "miter";

export interface WedgeGeometry {
  /** (D2 − D1)/H = cot θ. */
  s: number;
  /** 1/sin θ. */
  k: number;
  /** Slope of the sloped panel from horizontal (°). 90 = upright (a plain box). */
  theta: number;
  /** Slope from vertical (°): the bevel angle for butt joints. */
  phi: number;
  insideWidth: number;
  insideHeight: number;
  /** Inside depth along the top and the bottom (mm); the top one is negative when the inside closes before the top. */
  insideTopDepth: number;
  insideBottomDepth: number;
  /** Length of the sloped panel's inside face, top to bottom inside (mm). */
  insideSlant: number;
  /** Height of the lip's inside face, from the inside bottom to where the slope starts inside (mm); 0 without a lip. */
  insideLip: number;
  /** Height (mm, outside frame) where the sloped panel's inside face starts: T without a lip. */
  slopeFoot: number;
  /** Outside lip height actually used (mm): the lip clamped to [0, H]. */
  lip: number;
  /** Length of the sloped outside face (mm). */
  outsideSlant: number;
  /** Exact inside volume (litres). */
  volume_l: number;
  /** What the usual shortcut gives, (W − 2T)(H − 2T)(D_avg − 2T): too big by the sloped panel's extra width across. */
  naiveVolume_l: number;
}

const DEG = 180 / Math.PI;
const pos = (x: number) => Math.max(0, x);

export const slopeWallOf = (d: WedgeDims) => d.slopeWall ?? d.wall;

export const lipOf = (d: WedgeDims) => Math.min(Math.max(d.lip ?? 0, 0), Math.max(d.height, 0));

/** Integral over [y0, y1] of max(0, min(cap, a + b·y)), exactly (piecewise linear). */
function clippedIntegral(y0: number, y1: number, a: number, b: number, cap: number): number {
  if (!(y1 > y0)) return 0;
  const cuts = [y0, y1];
  if (b !== 0) for (const v of [0, cap]) { const y = (v - a) / b; if (y > y0 && y < y1) cuts.push(y); }
  cuts.sort((p, q) => p - q);
  const f = (y: number) => Math.max(0, Math.min(cap, a + b * y));
  let sum = 0;
  for (let i = 0; i + 1 < cuts.length; i++) sum += ((f(cuts[i]!) + f(cuts[i + 1]!)) / 2) * (cuts[i + 1]! - cuts[i]!);
  return sum;
}

export function wedgeGeometry(d: WedgeDims): WedgeGeometry {
  const { width: W, height: H, topDepth: D1, bottomDepth: D2, wall: T } = d;
  const Tb = slopeWallOf(d);
  const L = lipOf(d);
  const R = H - L;
  const s = R > 0 ? (D2 - D1) / R : 0;
  const k = Math.hypot(1, s);
  const theta = R > 0 ? Math.atan2(R, D2 - D1) * DEG : 90;
  // Inside face of the sloped panel: x = D2 − s(y − L) − Tb·k; the lip's: x = D2 − T.
  const xIn = (y: number) => D2 - s * (y - L) - Tb * k;
  // Without a lip nothing upright caps the front: the bottom runs out under the slope.
  const cap = L > 0 ? D2 - T : Infinity;
  const depthAt = (y: number) => Math.min(cap, xIn(y)) - T;
  const insideBottomDepth = depthAt(T);
  const insideTopDepth = depthAt(H - T);
  const insideWidth = W - 2 * T;
  const insideHeight = H - 2 * T;
  // Where the slope's inside face meets the lip's (below it the inside is upright).
  const yk = L > 0 ? (s > 0 ? L + (T - Tb * k) / s : H) : -Infinity;
  const slopeFoot = insideHeight > 0 ? Math.min(Math.max(T, yk), H - T) : T;
  const area = insideHeight > 0 ? clippedIntegral(T, H - T, D2 - Tb * k + s * L - T, -s, cap - T) : 0;
  const outerArea = D2 * L + (R * (D1 + D2)) / 2;
  return {
    s,
    k,
    theta,
    phi: 90 - theta,
    insideWidth,
    insideHeight,
    insideTopDepth,
    insideBottomDepth,
    insideSlant: pos(H - T - slopeFoot) * k,
    insideLip: pos(slopeFoot - T),
    slopeFoot,
    lip: L,
    outsideSlant: pos(R) * k,
    volume_l: (pos(insideWidth) * area) / 1e6,
    naiveVolume_l: (pos(insideWidth) * pos(insideHeight) * pos((H > 0 ? outerArea / H : 0) - 2 * T)) / 1e6,
  };
}

/** Exact inside volume (litres). */
export const wedgeVolume_l = (d: WedgeDims) => wedgeGeometry(d).volume_l;

/** The inside of a wedge, for entering inside dimensions instead (all mm). */
export interface WedgeInside {
  width: number;
  height: number;
  topDepth: number;
  bottomDepth: number;
  wall: number;
  slopeWall?: number;
}

/** Outside dimensions of the wedge with this inside (the inside slope is the outside slope). */
export function wedgeFromInside(i: WedgeInside): WedgeDims {
  const T = i.wall;
  const Tb = i.slopeWall ?? T;
  const H = i.height + 2 * T;
  const s = i.height > 0 ? (i.bottomDepth - i.topDepth) / i.height : 0;
  const D2 = i.bottomDepth + T + s * T + Tb * Math.hypot(1, s);
  return { width: i.width + 2 * T, height: H, topDepth: D2 - s * H, bottomDepth: D2, wall: T, ...(i.slopeWall !== undefined ? { slopeWall: i.slopeWall } : {}) };
}

/** Top depth for a slope of theta degrees from horizontal: D1 = D2 − (H − L)·cot θ (L the lip, default 0). */
export const topDepthForAngle = (bottomDepth: number, height: number, theta: number, lip = 0) =>
  bottomDepth - (height - lip) / Math.tan(theta / DEG);

// ---------------------------------------------------------------------------
// Saw angles
// ---------------------------------------------------------------------------

export interface WedgeAngles {
  theta: number;
  phi: number;
  /** Butt + bevel: the one bevel (saw tilt from square) for every sloped joint. */
  bevel: number;
  /**
   * Mitred: the saw tilt from square at each joint (equal thicknesses: back corners 45°,
   * bottom–baffle 90° − θ/2, top–baffle θ/2). With a thicker sloped panel each side of a joint
   * gets its own tilt: the first is the top or bottom panel's, the second the sloped panel's.
   * With a lip, `bottom` is the lip–slope joint (the lip's tilt first) and the bottom–lip
   * corner is a plain 45°.
   */
  miter: { back: number; bottom: [number, number]; top: [number, number] };
  /**
   * Lip–slope joint (only with a lip): it runs from the outside corner to the inside one for
   * either joinery, so butt joints need this second tilt too. The lip's tilt, then the sloped
   * panel's (equal thicknesses: both φ/2).
   */
  lipJoint?: [number, number];
}

export function wedgeAngles(d: WedgeDims): WedgeAngles {
  const g = wedgeGeometry(d);
  const T = d.wall, Tb = slopeWallOf(d);
  const th = g.theta / DEG;
  // A miter joins the outside corner to the inside one. Tilt from square of each panel's cut:
  // the joint's run along the panel over its run through the thickness.
  // On the sloped panel: rotate a joint into its frame (face direction u = (−cos θ, sin θ), inward n = (−sin θ, −cos θ)).
  const onSlope = (jx: number, jy: number) => Math.atan2(Math.abs(jx * -Math.cos(th) + jy * Math.sin(th)), jx * -Math.sin(th) + jy * -Math.cos(th)) * DEG;
  let bottomOwn: number, bottomSlope: number, lipJoint: [number, number] | undefined;
  if (g.lip > 0) {
    // Lip–slope: joint from (D2, L) to (D2 − T, yk); the lip's own tilt is its rise over its thickness.
    const rise = g.slopeFoot - g.lip;
    lipJoint = [Math.atan2(Math.abs(rise), T) * DEG, onSlope(-T, rise)];
    [bottomOwn, bottomSlope] = lipJoint;
  } else {
    // Bottom–slope: joint from (D2, 0) to (D2 − sT − Tb·k, T).
    const along = g.s * T + Tb * g.k; // horizontal run (along the bottom)
    bottomOwn = Math.atan2(along, T) * DEG;
    bottomSlope = onSlope(-along, T);
  }
  // Top–slope: joint from (D1, H) to (D1 + sT − Tb·k, H − T).
  const run = g.s * T - Tb * g.k;
  const topOwn = Math.atan2(Math.abs(run), T) * DEG;
  const kx = run, ky = -T;
  const topSlope = onSlope(kx, ky);
  return { theta: g.theta, phi: g.phi, bevel: g.phi, miter: { back: 45, bottom: [bottomOwn, bottomSlope], top: [topOwn, topSlope] }, ...(lipJoint ? { lipJoint } : {}) };
}

// ---------------------------------------------------------------------------
// Checks
// ---------------------------------------------------------------------------

export interface WedgeIssue {
  level: "error" | "warning" | "info";
  code:
    | "slope-reversed"
    | "no-slope"
    | "too-narrow"
    | "too-low"
    | "top-closed"
    | "top-shallow"
    | "shallow-slope"
    | "near-upright"
    | "miter-tilt"
    | "cutout-too-big"
    | "flange-too-big"
    | "lip-too-tall"
    | "lip-too-short";
  message: string;
  /** A fix the app can offer as a button: swap the two depths, or switch to the plain box. */
  action?: "swap" | "use-box";
}

export interface WedgeCheckOptions {
  joinery?: WedgeJoinery;
  slope?: WedgeSlope;
  /** Driver cutout and outer flange (frame) diameter, mm; 0 or absent = unknown. */
  cutout?: number;
  flange?: number;
}

/** Space to leave around the driver cutout on the baffle (mm), as the cut list does. */
export const WEDGE_HOLE_MARGIN = 15;

export function wedgeIssues(d: WedgeDims, o: WedgeCheckOptions = {}): WedgeIssue[] {
  const out: WedgeIssue[] = [];
  const g = wedgeGeometry(d);
  const r = (x: number) => Math.round(x);
  if (d.topDepth > d.bottomDepth) {
    out.push({ level: "error", code: "slope-reversed", message: "The top is deeper than the bottom: swap the two depths.", action: "swap" });
  } else if (d.topDepth === d.bottomDepth) {
    out.push({ level: "error", code: "no-slope", message: "No slope: the top and bottom depths are the same. Use Box.", action: "use-box" });
  }
  if (!(d.width > 2 * d.wall)) out.push({ level: "error", code: "too-narrow", message: "The width must be more than twice the wall thickness." });
  if (!(d.height > 2 * d.wall)) out.push({ level: "error", code: "too-low", message: "The height must be more than twice the wall thickness." });
  const lip = d.lip ?? 0;
  if (lip > 0 && d.height > 2 * d.wall) {
    if (!(lip < d.height - d.wall)) {
      out.push({ level: "error", code: "lip-too-tall", message: `The ${r(lip)} mm lip leaves no slope: make it lower than the height less a wall (${r(d.height - d.wall)} mm), or use Box.`, action: "use-box" });
    } else if (!(g.insideLip > 0)) {
      out.push({ level: "error", code: "lip-too-short", message: `A ${r(lip)} mm lip is lower than the bottom panel: use 0 (no lip) or more than ${r(d.wall + 1)} mm.` });
    }
  }
  if (d.height > 2 * d.wall && d.topDepth <= d.bottomDepth) {
    if (!(g.insideTopDepth > 0)) {
      out.push({ level: "error", code: "top-closed", message: `The inside closes before the top (${r(g.insideTopDepth)} mm at the top): make the top deeper or the slope gentler.` });
    } else if (g.insideTopDepth < 25) {
      out.push({ level: "warning", code: "top-shallow", message: `Only ${r(g.insideTopDepth)} mm inside at the top: hard to glue and brace, and the corner does little.` });
    }
  }
  if (d.topDepth < d.bottomDepth && !out.some((x) => x.code === "lip-too-tall")) {
    if (g.theta < 30) out.push({ level: "warning", code: "shallow-slope", message: `A very shallow slope (${g.theta.toFixed(1)}° from horizontal): the baffle lies almost flat and the box is mostly bottom.` });
    else if (g.theta > 88) out.push({ level: "info", code: "near-upright", message: `Nearly upright (${g.theta.toFixed(1)}°): a plain box would hold almost the same and is easier to build.` });
    if (o.joinery === "miter") {
      const a = wedgeAngles(d);
      const worst = Math.max(...a.miter.bottom, ...a.miter.top);
      if (worst > 45) {
        out.push({ level: "info", code: "miter-tilt", message: `The bottom miter needs a ${worst.toFixed(1)}° saw tilt, past most saws' 45°: butt joints with a ${a.bevel.toFixed(1)}° bevel need one setting.` });
      }
    }
  }
  // The driver goes on the sloped panel (slope front) or the upright one (slope rear).
  const faceIn = o.slope === "rear" ? pos(g.insideHeight) : g.insideSlant;
  const faceOut = o.slope === "rear" ? d.height : g.outsideSlant;
  const room = Math.min(pos(g.insideWidth), faceIn);
  if (o.cutout && o.cutout > 0 && o.cutout + 2 * WEDGE_HOLE_MARGIN > room) {
    out.push({ level: "error", code: "cutout-too-big", message: `The ${r(o.cutout)} mm cutout doesn't fit the baffle (${r(room)} mm inside, with ${WEDGE_HOLE_MARGIN} mm around it).` });
  }
  if (o.flange && o.flange > 0 && (o.flange > d.width || o.flange > faceOut)) {
    out.push({ level: "error", code: "flange-too-big", message: `The driver's ${r(o.flange)} mm frame is wider than the baffle (${r(Math.min(d.width, faceOut))} mm).` });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Solver
// ---------------------------------------------------------------------------

export type WedgeField = "width" | "height" | "topDepth" | "bottomDepth" | "lip";

export type WedgeSolve =
  | { ok: true; dims: WedgeDims; volume_l: number }
  | { ok: false; message: string; nearest: WedgeDims; volume_l: number };

/** Largest dimension the solver will go to (mm). */
export const WEDGE_MAX = 2000;
/** Solver tolerance (mm). */
const TOL = 0.01;

/**
 * The one dimension (the others locked) that gives this inside volume (litres). Width is
 * linear; height, the lip and the two depths raise the volume steadily, so bisection on
 * H ∈ (2T, 2000], L ∈ [0, H − T), D1 ∈ [D1 where the inside top closes, D2], D2 ∈ [D1, 2000].
 */
export function solveWedge(d: WedgeDims, field: WedgeField, target_l: number): WedgeSolve {
  const T = d.wall;
  const vol = (x: number) => wedgeVolume_l({ ...d, [field]: x });
  if (field === "width") {
    const g = wedgeGeometry({ ...d, width: 2 * T + 1 });
    const perMm = g.volume_l; // litres per mm of inside width
    if (!(perMm > 0) || !(target_l > 0)) {
      return { ok: false, message: "Target not reachable with these locks.", nearest: d, volume_l: wedgeVolume_l(d) };
    }
    const w = target_l / perMm + 2 * T;
    if (w > WEDGE_MAX) return { ok: false, message: "Target not reachable with these locks.", nearest: { ...d, width: WEDGE_MAX }, volume_l: vol(WEDGE_MAX) };
    return { ok: true, dims: { ...d, width: w }, volume_l: vol(w) };
  }
  let lo: number, hi: number;
  if (field === "height") {
    lo = Math.max(2 * T, lipOf(d) + T);
    hi = WEDGE_MAX;
  } else if (field === "lip") {
    // More lip, more volume (the top depth stays): from none to a wall below the top.
    lo = 0;
    hi = d.height - T - TOL;
  } else if (field === "topDepth") {
    hi = d.bottomDepth;
    lo = topDepthMin(d);
  } else {
    lo = d.topDepth;
    hi = WEDGE_MAX;
  }
  if (!(hi > lo)) return { ok: false, message: "Target not reachable with these locks.", nearest: d, volume_l: wedgeVolume_l(d) };
  const vLo = vol(lo), vHi = vol(hi);
  if (!(target_l >= vLo && target_l <= vHi)) {
    const x = target_l < vLo ? lo : hi;
    return { ok: false, message: "Target not reachable with these locks.", nearest: { ...d, [field]: x }, volume_l: vol(x) };
  }
  while (hi - lo > TOL) {
    const mid = (lo + hi) / 2;
    if (vol(mid) < target_l) lo = mid;
    else hi = mid;
  }
  const x = (lo + hi) / 2;
  return { ok: true, dims: { ...d, [field]: x }, volume_l: vol(x) };
}

/** Smallest top depth (mm) that still leaves the inside open at the top. */
export function topDepthMin(d: WedgeDims): number {
  const top = (x: number) => wedgeGeometry({ ...d, topDepth: x }).insideTopDepth;
  let lo = 0, hi = d.bottomDepth;
  if (top(lo) >= 0) return 0;
  if (top(hi) <= 0) return hi;
  while (hi - lo > TOL / 10) {
    const mid = (lo + hi) / 2;
    if (top(mid) < 0) lo = mid;
    else hi = mid;
  }
  return hi;
}

// ---------------------------------------------------------------------------
// Driver mount: does the motor clear the back and the bottom?
// ---------------------------------------------------------------------------

export type Vec2 = [number, number];

export interface DriverMount {
  /** Baffle cutout diameter (mm). */
  cutout: number;
  /** Mounting depth (mm), from the baffle to the back of the motor. */
  depth: number;
  /** Diameter of the motor (magnet) at the back (mm); absent = 70% of the cutout (estimated). */
  motorDiameter?: number;
  /** Xmax (mm): the cone and motor need this much more room behind. */
  xmax?: number;
  /** Space to leave behind and around the motor (mm, default 10), on top of Xmax. */
  gap?: number;
}

export interface MountCheck {
  ok: boolean;
  /** Where the driver's centre sits on the inside face of the baffle, mm from its bottom inside edge. */
  at: number;
  /** The driver's centre on the inside face of the baffle. */
  center: Vec2;
  /** Back of the motor on the axis. */
  rear: Vec2;
  /** The motor's two back corners in the side view. */
  corners: [Vec2, Vec2];
  /** Room along the axis from the inside face to the back or bottom wall (mm). */
  availableDepth: number;
  /** Mounting depth plus the gap (mm). */
  requiredDepth: number;
  /** Least clearance (mm) from the motor's corners to the walls, after the gap; negative = they hit. */
  margin: number;
  /** The position along the face that gives the most clearance, and that clearance. */
  best: { at: number; margin: number };
  /** The face length the centre can move along (mm): inside slant (slope front) or inside height (slope rear). */
  faceLength: number;
  motorEstimated: boolean;
}

/** Motor diameter guessed from the cutout when the datasheet doesn't give it. */
export const MOTOR_FROM_CUTOUT = 0.7;

/**
 * Slope front: the driver on the sloped baffle, its axis square to the baffle, pointing down
 * and back. Its motor's back corners Q± = P + M·n ± r·u (u up the slope, n into the box) must
 * stay gap clear of the back (x = T) and the bottom and top (y = T, H − T).
 * Slope rear: the axis is level; the corners must clear the sloped back at their height.
 * `at` (mm along the inside face from its bottom edge) defaults to the middle.
 */
export function wedgeDriverClearance(d: WedgeDims, slope: WedgeSlope, m: DriverMount, at?: number): MountCheck {
  const g = wedgeGeometry(d);
  const T = d.wall, Tb = slopeWallOf(d), H = d.height, D2 = d.bottomDepth;
  const gap = (m.gap ?? 10) + (m.xmax ?? 0);
  const motorEstimated = !(m.motorDiameter && m.motorDiameter > 0);
  const rm = (motorEstimated ? MOTOR_FROM_CUTOUT * m.cutout : m.motorDiameter!) / 2;
  const M = m.depth;
  const th = g.theta / DEG;
  const faceLength = slope === "front" ? g.insideSlant : pos(g.insideHeight);
  const backAt = (y: number) => (g.lip > 0 ? Math.max(T, g.s * (y - g.lip) + Tb * g.k) : g.s * y + Tb * g.k);

  const evalAt = (a: number) => {
    let P: Vec2, n: Vec2, u: Vec2, avail: number;
    let margin = Infinity;
    if (slope === "front") {
      // Bottom inside edge of the sloped face: on the bottom, or on the lip's top with a lip.
      const B: Vec2 = [D2 - g.s * (g.slopeFoot - g.lip) - Tb * g.k, g.slopeFoot];
      u = [-Math.cos(th), Math.sin(th)];
      n = [-Math.sin(th), -Math.cos(th)];
      P = [B[0] + a * u[0], B[1] + a * u[1]];
      const byBack = (P[0] - T) / Math.sin(th);
      const byBottom = Math.cos(th) > 1e-12 ? (P[1] - T) / Math.cos(th) : Infinity;
      avail = Math.min(byBack, byBottom);
    } else {
      // Upright baffle at the front (inside face x = D2 − T); the sloped back inside face x = s·(y − L) + Tb·k, the lip's x = T.
      P = [D2 - T, T + a];
      n = [-1, 0];
      u = [0, 1];
      avail = P[0] - backAt(P[1]);
    }
    const rear: Vec2 = [P[0] + M * n[0], P[1] + M * n[1]];
    const corners: [Vec2, Vec2] = [
      [rear[0] + rm * u[0], rear[1] + rm * u[1]],
      [rear[0] - rm * u[0], rear[1] - rm * u[1]],
    ];
    for (const q of corners) {
      const backX = slope === "front" ? T : backAt(q[1]);
      margin = Math.min(margin, q[0] - backX - gap, q[1] - (T + gap), H - T - gap - q[1]);
      // A front lip: the motor's lower corner must not reach its inside face.
      if (slope === "front" && g.lip > 0 && q[1] < g.slopeFoot) margin = Math.min(margin, D2 - T - gap - q[0]);
    }
    return { P, rear, corners, avail, margin };
  };

  const a0 = at ?? faceLength / 2;
  const here = evalAt(a0);
  // Best place: the centre has to leave room for the cutout on the face; search that span.
  const lo = Math.min(faceLength / 2, m.cutout / 2 + WEDGE_HOLE_MARGIN);
  const hi = Math.max(faceLength / 2, faceLength - m.cutout / 2 - WEDGE_HOLE_MARGIN);
  let best = { at: a0, margin: here.margin };
  const steps = 400;
  for (let i = 0; i <= steps; i++) {
    const a = lo + ((hi - lo) * i) / steps;
    const e = evalAt(a);
    if (e.margin > best.margin + 1e-9) best = { at: a, margin: e.margin };
  }
  return {
    ok: here.margin >= 0,
    at: a0,
    center: here.P,
    rear: here.rear,
    corners: here.corners,
    availableDepth: here.avail,
    requiredDepth: M + gap,
    margin: here.margin,
    best,
    faceLength,
    motorEstimated,
  };
}
