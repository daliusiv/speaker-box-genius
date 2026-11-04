import { add, cx, div, mul, scale, sub, type Complex } from "./complex.ts";
import { STANDARD_AIR, type Air } from "./constants.ts";
import { portArea, type PortInput } from "./model.ts";

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
  /** Port at the mouth (mass-loaded line), or none: the mouth is open. */
  port?: PortInput;
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

/** Slices from the closed end to the mouth, the driver position falling on a slice boundary. */
function slicesOf(line: LineInput, maxSlice = 0.02): { slices: Slice[]; driverIndex: number } {
  const slices: Slice[] = [];
  let driverIndex = -1;
  let x = 0;
  const xd = line.driverAt_cm / 100;
  for (const seg of line.segments) {
    const L = seg.length_cm / 100;
    if (!(L > 0)) continue;
    const uniform = seg.startArea_cm2 === seg.endArea_cm2;
    // Cut points: regular slices, plus the driver position if it falls inside this piece.
    const n = uniform ? 1 : Math.max(24, Math.ceil(L / maxSlice));
    const cuts = new Set<number>();
    for (let i = 0; i <= n; i++) cuts.add(i / n);
    if (xd > x + 1e-9 && xd < x + L - 1e-9) cuts.add((xd - x) / L);
    const ts = [...cuts].sort((a, b) => a - b);
    for (let i = 0; i + 1 < ts.length; i++) {
      if (Math.abs(x + ts[i]! * L - xd) < 1e-9 && driverIndex < 0) driverIndex = slices.length;
      const mid = (ts[i]! + ts[i + 1]!) / 2;
      slices.push({ len: (ts[i + 1]! - ts[i]!) * L, area: areaAt(seg, mid) / 1e4, fill: seg.fill_kgm3 ?? 0 });
    }
    x += L;
  }
  if (driverIndex < 0) driverIndex = xd >= x - 1e-9 ? slices.length : 0;
  return { slices, driverIndex };
}

export interface LineNetwork {
  /** Acoustic impedance the back of the cone(s) sees (both branches in parallel). */
  zLoad(w: number): Complex;
  /** Volume velocity leaving the mouth (or port) for a pressure p at the driver. */
  mouthFlow(w: number, pDriver: Complex): Complex;
  /** Area air leaves through (mouth or port), m². */
  exitArea: number;
  length_m: number;
  volume_l: number;
  /** Mouth area of the line itself (m²). */
  mouthArea: number;
}

export function lineNetwork(line: LineInput, air: Air = STANDARD_AIR): LineNetwork {
  if (line.segments.length === 0) throw new Error("A transmission line needs at least one piece");
  for (const s of line.segments) {
    if (!(s.startArea_cm2 > 0 && s.endArea_cm2 > 0)) throw new Error("Line areas must be positive");
  }
  const { slices, driverIndex } = slicesOf(line);
  const length_m = slices.reduce((a, s) => a + s.len, 0);
  if (!(length_m > 0)) throw new Error("The line has no length");
  if (line.driverAt_cm / 100 > length_m - 1e-6) throw new Error("The driver must sit before the mouth");
  const volume_l = slices.reduce((a, s) => a + s.len * s.area, 0) * 1000;
  const behind = slices.slice(0, driverIndex).reverse(); // driver → closed end
  const ahead = slices.slice(driverIndex); // driver → mouth
  const mouthArea = slices[slices.length - 1]!.area;
  const port = line.port;
  if (port && port.length_cm > 0) {
    ahead.push({ len: port.length_cm / 100, area: portArea(port), fill: 0 });
  }
  const exitArea = port && port.length_cm > 0 ? portArea(port) : mouthArea;

  // Cache the chains per frequency (zLoad and mouthFlow are asked at the same ω).
  let lastW = NaN;
  let tBehind: M2 = [cx(1), cx(0), cx(0), cx(1)];
  let tAhead: M2 = [cx(1), cx(0), cx(0), cx(1)];
  let zRad = cx(0);
  const chains = (w: number) => {
    if (w === lastW) return;
    lastW = w;
    tBehind = [cx(1), cx(0), cx(0), cx(1)];
    for (const s of behind) tBehind = mm(tBehind, sliceMatrix(s, w, air));
    tAhead = [cx(1), cx(0), cx(0), cx(1)];
    for (const s of ahead) tAhead = mm(tAhead, sliceMatrix(s, w, air));
    zRad = baffledPistonImpedance(exitArea, w, air);
  };
  const zAheadIn = () => div(add(mul(tAhead[0], zRad), tAhead[1]), add(mul(tAhead[2], zRad), tAhead[3]));

  return {
    zLoad(w) {
      chains(w);
      const zA = zAheadIn();
      if (behind.length === 0) return zA; // driver at the closed end
      const zB = div(tBehind[0], tBehind[2]); // rigid end: U = 0
      return div(mul(zA, zB), add(zA, zB));
    },
    mouthFlow(w, pDriver) {
      chains(w);
      const uIn = div(pDriver, zAheadIn());
      // [p_m; U_m] = T⁻¹ [p_d; U_in]  (det T = 1)
      return sub(mul(tAhead[0], uIn), mul(tAhead[2], pDriver));
    },
    exitArea,
    length_m,
    volume_l,
    mouthArea,
  };
}
