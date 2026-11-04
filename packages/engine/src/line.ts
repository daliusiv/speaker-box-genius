import { add, cx, div, mul, scale, sub, type Complex } from "./complex.ts";
import { STANDARD_AIR, type Air } from "./constants.ts";
import { portArea, portEffectiveLength, portMouthArea, type PortInput } from "./model.ts";

/**
 * Transmission lines (and their relatives: TQWT, offset-driver TL, mass-loaded TL) as a
 * one-dimensional acoustic duct, the way Hornresp and Akabak model them.
 *
 * The line runs from a closed end (x = 0) to an open mouth. Each piece is a 2×2 transfer
 * matrix between pressure p and volume velocity U at its two ends:
 *
 *   [p₁]   [cos kL       j·Zc·sin kL] [p₂]
 *   [U₁] = [j·sin kL/Zc  cos kL     ] [U₂],    Zc = ρc/S  (e^{jωt})
 *
 * Tapered pieces are a chain of thin uniform slices (any taper; converges to Webster's
 * horn equation). The driver's rear sits at `driverAt_cm` from the closed end and sees the
 * two branches in parallel: the closed end behind it and the open end in front. The open
 * end radiates as a baffled piston, optionally through a port (a mass-loaded line).
 *
 * Stuffing: fibre fill in a piece makes the air lossy. Delany–Bazley's empirical model for
 * fibrous absorbers gives the wave number and characteristic impedance from the flow
 * resistivity, which comes from the fill density (Garai & Pompoli, polyester fibre). Less
 * certain than the rest, as in every TL simulator.
 */

export type Taper = "linear" | "conical" | "exponential";

export interface LineSegment {
  length_cm: number;
  /** Cross-section at the start (closed-end side) and the end (mouth side), cm². */
  startArea_cm2: number;
  endArea_cm2: number;
  /**
   * How the area changes along the piece. "linear": area changes linearly (one side of a
   * rectangular line tapers; Hornresp's "Par"). "conical": the radius changes linearly
   * (Hornresp's "Con"). "exponential": Hornresp's "Exp". Default linear.
   */
  taper?: Taper;
  /** Stuffing density (kg/m³) in this piece, 0 = empty. Polyester fibre: 4–16 is typical. */
  fill_kgm3?: number;
}

export interface LineInput {
  kind: "line";
  /** From the closed end to the mouth. */
  segments: LineSegment[];
  /** Distance of the driver from the closed end (cm). 0 = at the closed end (classic TL). */
  driverAt_cm: number;
  /** Port at the mouth (mass-loaded line), or none: the mouth is open. May be flared. */
  port?: PortInput;
  /**
   * Tapped horn: the driver's front feeds the line at this distance from the closed end
   * (its rear at `driverAt_cm`), so only the mouth radiates.
   */
  tap_cm?: number;
  /**
   * Front-loaded horn: the driver sits at the throat (x = 0, so `driverAt_cm` must be 0) in a
   * sealed rear chamber, its front into a throat (compression) chamber that opens into the
   * horn. Only the mouth radiates. Volumes in litres; throat 0 = none.
   */
  frontLoaded?: { rear_l: number; throat_l: number };
  /**
   * Extra distance from the mouth (or port) to the listener compared with the cone (cm),
   * e.g. about the box depth for a mouth on the back. 0 = next to the driver.
   */
  mouthDistance_cm?: number;
}

/** One uniform slice. */
interface Slice {
  len: number; // m
  area: number; // m²
  fill: number; // kg/m³
}

// ---------------------------------------------------------------------------
// Complex helpers not in complex.ts
// ---------------------------------------------------------------------------

const cxCos = (z: Complex): Complex => cx(Math.cos(z.re) * Math.cosh(z.im), -Math.sin(z.re) * Math.sinh(z.im));
const cxSin = (z: Complex): Complex => cx(Math.sin(z.re) * Math.cosh(z.im), Math.cos(z.re) * Math.sinh(z.im));
const J = cx(0, 1);

type M2 = [Complex, Complex, Complex, Complex]; // [A, B, C, D]

const mm = (x: M2, y: M2): M2 => [
  add(mul(x[0], y[0]), mul(x[1], y[2])),
  add(mul(x[0], y[1]), mul(x[1], y[3])),
  add(mul(x[2], y[0]), mul(x[3], y[2])),
  add(mul(x[2], y[1]), mul(x[3], y[3])),
];

// ---------------------------------------------------------------------------
// Fill (Delany–Bazley) and radiation (baffled piston)
// ---------------------------------------------------------------------------

/** Flow resistivity (Pa·s/m²) of polyester fibre fill at this density (Garai & Pompoli 2005). */
export const flowResistivity = (fill_kgm3: number) => 25.989 * fill_kgm3 ** 1.404;

/** Wave number (1/m) and characteristic acoustic impedance (Pa·s/m³) of a slice. */
function propagation(s: Slice, w: number, air: Air): { k: Complex; zc: Complex } {
  const k0 = w / air.c;
  const z0 = (air.rho * air.c) / s.area;
  if (!(s.fill > 0)) return { k: cx(k0), zc: cx(z0) };
  const f = w / (2 * Math.PI);
  // Delany–Bazley holds for 0.01 < ρf/σ < 1; keep it inside that range.
  const X = Math.min(1, Math.max(0.01, (air.rho * f) / flowResistivity(s.fill)));
  const k = scale(cx(1 + 0.0978 * X ** -0.7, -0.189 * X ** -0.595), k0);
  const zc = scale(cx(1 + 0.0571 * X ** -0.754, -0.087 * X ** -0.732), z0);
  return { k, zc };
}

function sliceMatrix(s: Slice, w: number, air: Air): M2 {
  const { k, zc } = propagation(s, w, air);
  const kl = scale(k, s.len);
  const c = cxCos(kl);
  const sn = cxSin(kl);
  return [c, mul(J, mul(zc, sn)), mul(J, div(sn, zc)), c];
}

// Bessel J0, J1 (Numerical Recipes rational approximations) and Struve H1 (Aarts & Janssen 2003).
function besselJ0(x: number): number {
  const ax = Math.abs(x);
  if (ax < 8) {
    const y = x * x;
    const a = 57568490574.0 + y * (-13362590354.0 + y * (651619640.7 + y * (-11214424.18 + y * (77392.33017 + y * -184.9052456))));
    const b = 57568490411.0 + y * (1029532985.0 + y * (9494680.718 + y * (59272.64853 + y * (267.8532712 + y))));
    return a / b;
  }
  const z = 8 / ax;
  const y = z * z;
  const xx = ax - 0.785398164;
  const a = 1 + y * (-0.1098628627e-2 + y * (0.2734510407e-4 + y * (-0.2073370639e-5 + y * 0.2093887211e-6)));
  const b = -0.1562499995e-1 + y * (0.1430488765e-3 + y * (-0.6911147651e-5 + y * (0.7621095161e-6 - y * 0.934935152e-7)));
  return Math.sqrt(0.636619772 / ax) * (Math.cos(xx) * a - z * Math.sin(xx) * b);
}
function besselJ1(x: number): number {
  const ax = Math.abs(x);
  if (ax < 8) {
    const y = x * x;
    const a = x * (72362614232.0 + y * (-7895059235.0 + y * (242396853.1 + y * (-2972611.439 + y * (15704.4826 + y * -30.16036606)))));
    const b = 144725228442.0 + y * (2300535178.0 + y * (18583304.74 + y * (99447.43394 + y * (376.9991397 + y))));
    return a / b;
  }
  const z = 8 / ax;
  const y = z * z;
  const xx = ax - 2.356194491;
  const a = 1 + y * (0.183105e-2 + y * (-0.3516396496e-4 + y * (0.2457520174e-5 + y * -0.240337019e-6)));
  const b = 0.04687499995 + y * (-0.2002690873e-3 + y * (0.8449199096e-5 + y * (-0.88228987e-6 + y * 0.105787412e-6)));
  const ans = Math.sqrt(0.636619772 / ax) * (Math.cos(xx) * a - z * Math.sin(xx) * b);
  return x < 0 ? -ans : ans;
}
function struveH1(x: number): number {
  if (x < 1e-6) return 0;
  return 2 / Math.PI - besselJ0(x) + (16 / Math.PI - 5) * (Math.sin(x) / x) + (12 - 36 / Math.PI) * ((1 - Math.cos(x)) / (x * x));
}

/**
 * How much less a baffled piston radiates than a point source with the same volume velocity
 * (as an amplitude factor): √(R / R_low-ka). 1 at low frequency, falling once ka passes ~1.
 * Hornresp works its SPL out from radiated power, which is this factor times the on-axis result.
 */
export function pistonPowerFactor(area: number, w: number, air: Air = STANDARD_AIR): number {
  const x = (2 * w * Math.sqrt(area / Math.PI)) / air.c;
  if (x < 1e-2) return 1;
  return Math.sqrt((1 - (2 * besselJ1(x)) / x) / ((x * x) / 8));
}

/** Radiation impedance (acoustic, Pa·s/m³) of a piston of area S in an infinite baffle. */
export function baffledPistonImpedance(area: number, w: number, air: Air = STANDARD_AIR): Complex {
  const a = Math.sqrt(area / Math.PI);
  const x = (2 * w * a) / air.c;
  const z0 = (air.rho * air.c) / area;
  if (x < 1e-3) return scale(cx((x * x) / 8, (4 * x) / (3 * Math.PI)), z0); // small-x limits
  return scale(cx(1 - (2 * besselJ1(x)) / x, (2 * struveH1(x)) / x), z0);
}

// ---------------------------------------------------------------------------
// The line
// ---------------------------------------------------------------------------

/** Area at fraction t (0–1) along a piece. */
function areaAt(seg: LineSegment, t: number): number {
  const s1 = seg.startArea_cm2;
  const s2 = seg.endArea_cm2;
  switch (seg.taper ?? "linear") {
    case "linear":
      return s1 + (s2 - s1) * t;
    case "conical": {
      const r = Math.sqrt(s1) + (Math.sqrt(s2) - Math.sqrt(s1)) * t;
      return r * r;
    }
    case "exponential":
      return s1 * (s2 / s1) ** t;
  }
}

/**
 * Slices from the closed end to the mouth, with the given points (m) falling on slice
 * boundaries; returns the slice index at each point.
 */
function slicesAt(line: LineInput, points: number[], maxSlice = 0.02): { slices: Slice[]; at: number[] } {
  const slices: Slice[] = [];
  let x = 0;
  for (const seg of line.segments) {
    const L = seg.length_cm / 100;
    if (!(L > 0)) continue;
    const uniform = seg.startArea_cm2 === seg.endArea_cm2;
    const n = uniform ? 1 : Math.max(24, Math.ceil(L / maxSlice));
    const cuts = new Set<number>();
    for (let i = 0; i <= n; i++) cuts.add(i / n);
    for (const p of points) if (p > x + 1e-9 && p < x + L - 1e-9) cuts.add((p - x) / L);
    const ts = [...cuts].sort((a, b) => a - b);
    for (let i = 0; i + 1 < ts.length; i++) {
      const mid = (ts[i]! + ts[i + 1]!) / 2;
      slices.push({ len: (ts[i + 1]! - ts[i]!) * L, area: areaAt(seg, mid) / 1e4, fill: seg.fill_kgm3 ?? 0 });
    }
    x += L;
  }
  // Index of the first slice starting at or after each point.
  const at = points.map((p) => {
    let pos = 0;
    for (let i = 0; i < slices.length; i++) {
      if (pos >= p - 1e-9) return i;
      pos += slices[i]!.len;
    }
    return slices.length;
  });
  return { slices, at };
}

export interface LineNetwork {
  /** Acoustic impedance the cone(s) see, per unit volume velocity into the line from the rear. */
  zLoad(w: number): Complex;
  /**
   * The line's own acoustic impedance as Hornresp's Za chart shows it: at the driver for lines
   * and tapped horns (the same as zLoad), at the horn's throat (without the chambers) for a
   * front-loaded horn. Divide by `zaRef` for the normalised value.
   */
  za(w: number): Complex;
  /** ρc / area where Za is taken (at the driver, or the horn's throat), Pa·s/m³. */
  zaRef: number;
  /**
   * Pressure and volume velocity along the line for unit cone volume velocity (all the
   * cones together), from the closed end (x = 0) to the mouth, then on through a port.
   */
  profile(w: number): ProfilePoint[];
  /** Volume velocity leaving the mouth (or port) per unit cone volume velocity into the line. */
  exitPerCone(w: number): Complex;
  /** Volume velocity leaving the mouth for a pressure p at the driver (open lines). */
  mouthFlow(w: number, pDriver: Complex): Complex;
  /** Tapped horn: the cone's front is inside the line, so only the mouth radiates. */
  tapped: boolean;
  /** Only the mouth radiates (tapped and front-loaded horns): the cone is enclosed. */
  mouthOnly: boolean;
  /** Extra path from the exit to the listener (m). */
  mouthDistance: number;
  /** Extra resistance in series with the exit (port compression), Pa·s/m³. */
  setExitLoss(r: number): void;
  /** Area air leaves through (mouth, port, or a flared port's mouth), m². */
  exitArea: number;
  /** Narrowest area on the way out (the port's throat, or the mouth), m². */
  exitThroatArea: number;
  length_m: number;
  volume_l: number;
  /** Mouth area of the line itself (m²). */
  mouthArea: number;
}

const ONE: M2 = [cx(1), cx(0), cx(0), cx(1)];

/** One point along the line: position from the closed end (m), area (m²), pressure and volume velocity. */
export interface ProfilePoint {
  x: number;
  area: number;
  p: Complex;
  u: Complex;
  /** In the port of a mass-loaded line (beyond the line's mouth). */
  port: boolean;
}

export function lineNetwork(line: LineInput, air: Air = STANDARD_AIR): LineNetwork {
  if (line.segments.length === 0) throw new Error("A transmission line needs at least one piece");
  for (const s of line.segments) {
    if (!(s.startArea_cm2 > 0 && s.endArea_cm2 > 0)) throw new Error("Line areas must be positive");
  }
  const total = line.segments.reduce((a, s) => a + Math.max(0, s.length_cm), 0) / 100;
  if (!(total > 0)) throw new Error("The line has no length");
  const xr = line.driverAt_cm / 100;
  if (xr > total - 1e-6) throw new Error("The driver must sit before the mouth");
  const tapped = line.tap_cm !== undefined;
  const flh = line.frontLoaded;
  if (flh) {
    if (tapped || xr > 1e-9) throw new Error("A front-loaded horn's driver sits at the throat");
    if (!(flh.rear_l > 0)) throw new Error("A front-loaded horn needs a rear chamber");
  }
  // Chambers as acoustic compliances: C = V / (ρc²).
  const cRear = flh ? flh.rear_l / 1000 / (air.rho * air.c * air.c) : 0;
  const cThroat = flh ? Math.max(0, flh.throat_l) / 1000 / (air.rho * air.c * air.c) : 0;
  /** Front-loaded horn: the impedance in front of the cone (throat chamber ∥ horn). */
  const zFront = (zHorn: Complex, w: number): Complex => {
    if (!(cThroat > 0)) return zHorn;
    const yTc = cx(0, w * cThroat);
    return div(cx(1), add(yTc, div(cx(1), zHorn)));
  };
  const xf = tapped ? line.tap_cm! / 100 : xr;
  if (tapped && !(xf > xr + 1e-6 && xf < total - 1e-6)) throw new Error("The front tap must sit between the driver's rear and the mouth");

  const { slices, at } = slicesAt(line, tapped ? [xr, xf] : [xr]);
  const length_m = slices.reduce((a, s) => a + s.len, 0);
  const volume_l = slices.reduce((a, s) => a + s.len * s.area, 0) * 1000;
  const iR = at[0]!;
  const iF = tapped ? at[1]! : iR;
  const behind = slices.slice(0, iR).reverse(); // rear tap → closed end
  const middle = slices.slice(iR, iF); // rear tap → front tap (tapped horn)
  const ahead = slices.slice(iF); // front tap (or driver) → mouth
  const mouthArea = slices[slices.length - 1]!.area;
  const port = line.port && line.port.length_cm > 0 ? line.port : undefined;
  let exitArea = mouthArea;
  let exitThroatArea = mouthArea;
  if (port) {
    // The flares' extra area is folded into an equivalent length at the throat's area; the
    // mouth of the flare radiates. End corrections come from the radiation impedance.
    ahead.push({ len: portEffectiveLength(port, 0), area: portArea(port), fill: 0 });
    exitArea = portMouthArea(port);
    exitThroatArea = portArea(port);
  }
  let exitLoss = 0;

  let lastW = NaN;
  let tBehind = ONE;
  let tMiddle = ONE;
  let tAhead = ONE;
  let zRad = cx(0);
  const chains = (w: number) => {
    if (w === lastW) return;
    lastW = w;
    tBehind = ONE;
    for (const s of behind) tBehind = mm(tBehind, sliceMatrix(s, w, air));
    tMiddle = ONE;
    for (const s of middle) tMiddle = mm(tMiddle, sliceMatrix(s, w, air));
    tAhead = ONE;
    for (const s of ahead) tAhead = mm(tAhead, sliceMatrix(s, w, air));
    zRad = add(baffledPistonImpedance(exitArea, w, air), cx(exitLoss));
  };
  const zAheadIn = () => div(add(mul(tAhead[0], zRad), tAhead[1]), add(mul(tAhead[2], zRad), tAhead[3]));
  // Admittance of the closed stub behind the rear tap (0 when there is none).
  const yBehind = () => (behind.length === 0 ? cx(0) : div(tBehind[2], tBehind[0]));
  const mouthFlow = (pDriver: Complex) => {
    const uIn = div(pDriver, zAheadIn());
    // [p_m; U_m] = T⁻¹ [p; U_in]  (det T = 1)
    return sub(mul(tAhead[0], uIn), mul(tAhead[2], pDriver));
  };

  /** Pressures at the rear and front taps for unit cone flow (tapped horn). */
  const tappedPressures = (): { pr: Complex; pf: Complex } => {
    // Middle section as admittances: U₁ = (D/B)p₁ − p₂/B, U₂ = p₁/B − (A/B)p₂ (det = 1).
    const [A, B, , D] = tMiddle;
    const yB = div(cx(1), zAheadIn());
    // Rear node: the cone pushes +1 in; front node: −1 (the same cone, other side).
    const a11 = add(yBehind(), div(D, B));
    const a12 = scale(div(cx(1), B), -1);
    const a21 = div(cx(1), B);
    const a22 = scale(add(div(A, B), yB), -1);
    const det = sub(mul(a11, a22), mul(a12, a21));
    const pr = div(sub(a22, a12), det);
    const pf = div(sub(a11, a21), det);
    return { pr, pf };
  };

  return {
    zLoad(w) {
      chains(w);
      if (flh) return add(zFront(zAheadIn(), w), cx(0, -1 / (w * cRear)));
      if (tapped) {
        const { pr, pf } = tappedPressures();
        return sub(pr, pf);
      }
      const zA = zAheadIn();
      if (behind.length === 0) return zA; // driver at the closed end
      const zB = div(tBehind[0], tBehind[2]); // rigid end: U = 0
      return div(mul(zA, zB), add(zA, zB));
    },
    za(w) {
      if (!flh) return this.zLoad(w);
      chains(w);
      return zAheadIn();
    },
    zaRef: (air.rho * air.c) / (slices[iR]?.area ?? mouthArea),
    profile(w) {
      chains(w);
      const pts: ProfilePoint[] = [];
      // Walk a run of slices from a known state, one slice at a time: [p'; U'] = T⁻¹ [p; U].
      const walk = (list: Slice[], p0: Complex, u0: Complex, x0: number, dir: 1 | -1) => {
        if (list.length === 0) return;
        let p = p0;
        let u = u0;
        let x = x0;
        pts.push({ x, area: list[0]?.area ?? 0, p, u, port: false });
        for (const sl of list) {
          const [A, B, C, D] = sliceMatrix(sl, w, air);
          const pn = sub(mul(D, p), mul(B, u));
          const un = sub(mul(A, u), mul(C, p));
          p = pn;
          u = un;
          x += dir * sl.len;
          pts.push({ x, area: sl.area, p, u, port: x > length_m + 1e-9 });
        }
      };
      if (flh) {
        const pt = zFront(zAheadIn(), w);
        walk(ahead, pt, div(pt, zAheadIn()), 0, 1);
      } else if (tapped) {
        const { pr, pf } = tappedPressures();
        const [, B, , D] = tMiddle;
        walk(behind, pr, mul(pr, yBehind()), xr, -1);
        walk(middle, pr, sub(div(mul(D, pr), B), div(pf, B)), xr, 1);
        walk(ahead, pf, div(pf, zAheadIn()), xf, 1);
      } else {
        const pd = this.zLoad(w);
        chains(w);
        walk(behind, pd, mul(pd, yBehind()), xr, -1);
        walk(ahead, pd, div(pd, zAheadIn()), xr, 1);
      }
      return pts.sort((a, b) => a.x - b.x);
    },
    exitPerCone(w) {
      chains(w);
      if (flh) return mouthFlow(zFront(zAheadIn(), w)); // pressure at the throat for unit cone flow
      if (tapped) return mouthFlow(tappedPressures().pf);
      const z = this.zLoad(w);
      return mouthFlow(z);
    },
    mouthFlow(w, pDriver) {
      chains(w);
      return mouthFlow(pDriver);
    },
    tapped,
    mouthOnly: tapped || !!flh,
    mouthDistance: Math.max(0, (line.mouthDistance_cm ?? 0) / 100),
    setExitLoss(r) {
      if (r !== exitLoss) {
        exitLoss = r;
        lastW = NaN;
      }
    },
    exitArea,
    exitThroatArea,
    length_m,
    volume_l,
    mouthArea,
  };
}
