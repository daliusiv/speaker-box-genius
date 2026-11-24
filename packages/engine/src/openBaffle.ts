import { abs, sub, type Complex } from "./complex.ts";
import { STANDARD_AIR, type Air } from "./constants.ts";
import { lineNetwork, type LineInput } from "./line.ts";
import type { OpenBaffleInput } from "./model.ts";
import { FULL_MODEL_TOP_HZ, flatBaffleModel, type FlatBaffleModel } from "./edgeDiffraction.ts";
import { discSources, rectSources, slabModels, SLAB_TOP_HZ, type SlabModel } from "./slabDiffraction.ts";

/**
 * Open baffle (dipole) geometry: how the rear wave reaches a listener on the front axis.
 *
 * Flat board: edge diffraction summed to all orders (edgeDiffraction.ts), checked against
 * boundary-element solutions, with the board's thickness worked in (see OB_THICK_BASS below).
 *
 * Frames: the cone drives short ducts of the frame's inside cross-section (H: one each side of
 * the board, U: one behind it), modelled as transmission lines with an open mouth. A frame's mouth
 * is the open end of a thin-walled pipe, not a hole in a wall, so it radiates as an unflanged pipe
 * end (`openPipeImpedance`): the ducts' first resonance sits near c/4(L + 0.61·r), a little higher
 * for a big mouth. The sound outside is edge diffraction round the frame taken as a solid block
 * (its outline × its depth, slabDiffraction.ts): the front source is the cone (U) or the front
 * mouth (H), the rear source the rear mouth, each spread over its face. Checked against
 * boundary-element runs of four H/U frames (open-baffle-frame-bem.test.ts).
 */

export interface OpenBaffleGeometry {
  frame: "flat" | "h" | "u";
  /** Duct behind the cone (H, U); its mouth is the rear source. */
  rearLine: LineInput | null;
  /** Duct in front of the cone (H); its mouth is the front source. */
  frontLine: LineInput | null;
  /** Inside cross-section of the frame (cm²), H/U. */
  ductArea_cm2: number;
  /** Duct length on each side (H) or behind (U), cm. */
  ductLength_cm: number;
}

export const DEFAULT_BAFFLE_THICKNESS_CM = 1.8;

/** The flat board's response model; sd_m2 is one cone's area (0 for a point source). */
export function flatModel(b: OpenBaffleInput, sd_m2: number, air: Air = STANDARD_AIR): FlatBaffleModel {
  openBaffleGeometry(b); // checks the board and the driver position
  const W = b.w_cm / 100;
  const H = b.h_cm / 100;
  const x = (b.x_cm ?? b.w_cm / 2) / 100;
  const y = (b.y_cm ?? b.h_cm / 2) / 100;
  const a = Math.sqrt(Math.max(sd_m2, 0) / Math.PI);
  const t = (b.t_cm ?? DEFAULT_BAFFLE_THICKNESS_CM) / 100;
  // A thin board of the same size, grown by g on every side (the driver stays where it is on it).
  const grown = (g: number) => flatBaffleModel({ w: W + 2 * g, h: H + 2 * g, x: x + g, y: y + g, a }, air.c);
  if (!(t > 0)) return grown(0);
  const bass = grown(OB_THICK_BASS * t);
  const peak = grown(OB_THICK_PEAK * t);
  const ft = OB_THICK_BLEND * firstPeak((f) => abs(peak.at(f)), 4 * FULL_MODEL_TOP_HZ);
  return {
    d_m: bass.d_m,
    at(f: number): Complex {
      const w = 1 / (1 + (f / ft) ** 2);
      const p = bass.at(f);
      const q = peak.at(f);
      return { re: w * p.re + (1 - w) * q.re, im: w * p.im + (1 - w) * q.im };
    },
  };
}

/**
 * Board thickness. The rear wave round a thick board's edge goes along its side face and round two
 * square corners. Edge diffraction of the thick board itself (validation/bem/btm_thick.py) matches
 * boundary-element runs of nine thick boards within 0.04 dB, but needs nodes T/2 apart, too slow
 * here. Instead the thin model runs on a slightly bigger board: in the bass the thick board acts as a
 * thin one grown by 1.0·T on every side, round its dipole peak as one grown by 0.55·T (a thick
 * board's bass path grows about twice as much as its peak falls), blended at 0.4 × that peak.
 * Fitted on the 45 cm boards and checked on all nine (30, 45, 60 cm; 18, 25, 40 mm): bass within
 * 0.13 dB, peak within 2.4 %, rms 0.19–0.54 dB to 900 Hz (open-baffle-bem.test.ts). A thin board
 * was 0.6–2.1 dB short in the bass with its peak 4–11 % high.
 */
export const OB_THICK_BASS = 1.0;
export const OB_THICK_PEAK = 0.55;
export const OB_THICK_BLEND = 0.4;

/** The first maximum of a response, found on a 1 % grid from 10 Hz and refined. */
function firstPeak(mag: (f: number) => number, top: number): number {
  let f = 10;
  while (f < top && mag(f * 1.01) >= mag(f)) f *= 1.01;
  return refine(mag, f / 1.01, f * 1.01, 1);
}

export function openBaffleGeometry(b: OpenBaffleInput): OpenBaffleGeometry {
  const frame = b.frame ?? "flat";
  const W = b.w_cm;
  const H = b.h_cm;
  const t = b.t_cm ?? DEFAULT_BAFFLE_THICKNESS_CM;
  if (!(W > 0 && H > 0)) throw new Error("An open baffle needs a width and a height");
  if (!(t >= 0)) throw new Error("Baffle thickness can't be negative");
  const x = b.x_cm ?? W / 2;
  const y = b.y_cm ?? H / 2;
  if (!(x > 0 && x < W && y > 0 && y < H)) throw new Error("The driver must sit on the baffle");
  const depth = frame === "flat" ? t : (b.depth_cm ?? 0);
  if (frame !== "flat" && !(depth > t)) throw new Error("A frame must be deeper than the board");
  const inner = (W - 2 * t) * (H - 2 * t);
  if (frame !== "flat" && !(inner > 0)) throw new Error("The frame's walls fill it");

  const duct = (length_cm: number): LineInput => ({
    kind: "line",
    segments: [{ length_cm, startArea_cm2: inner, endArea_cm2: inner }],
    driverAt_cm: 0,
    mouth: b.ductMouth ?? "open",
  });
  const ductLength_cm = frame === "h" ? (depth - t) / 2 : frame === "u" ? depth - t : 0;
  return {
    frame,
    rearLine: frame === "flat" ? null : duct(ductLength_cm),
    frontLine: frame === "h" ? duct(ductLength_cm) : null,
    ductArea_cm2: frame === "flat" ? 0 : inner,
    ductLength_cm,
  };
}

/** A frame's outside sound: F for unit outward flow from its front source (the cone on a U-frame's board, an H-frame's front mouth) and from its rear mouth. */
export interface FrameModel {
  front: SlabModel;
  rear: SlabModel;
}

/** The frame's outside model; sd_m2 is one cone's area (a U-frame's front source). Built once per frame and cached. */
export function frameModel(b: OpenBaffleInput, sd_m2: number, air: Air = STANDARD_AIR): FrameModel {
  const g = openBaffleGeometry(b);
  if (g.frame === "flat") throw new Error("A flat board has no frame");
  const W = b.w_cm / 100;
  const H = b.h_cm / 100;
  const t = (b.t_cm ?? DEFAULT_BAFFLE_THICKNESS_CM) / 100;
  const D = (b.depth_cm ?? 0) / 100;
  const mouth = (face: "front" | "rear") => rectSources(face, t, t, W - 2 * t, H - 2 * t);
  const front =
    g.frame === "h" ? mouth("front") : discSources("front", (b.x_cm ?? b.w_cm / 2) / 100, (b.y_cm ?? b.h_cm / 2) / 100, Math.sqrt(Math.max(sd_m2, 0) / Math.PI));
  const [f, r] = slabModels({ w: W, h: H, t: D }, [front, mouth("rear")], air.c);
  return { front: f!, rear: r! };
}

/**
 * The frequencies a builder works with: the path D, the dipole peak and first null, and the
 * frame's duct resonance. D is the model's low-frequency limit (F → jkD), the peak and null its
 * response's first maximum and the minimum after it: for a frame, of its outside sound with equal
 * and opposite flows from the front source and the rear mouth (the ducts left out).
 */
export function openBaffleFrequencies(b: OpenBaffleInput, air: Air = STANDARD_AIR, sd_m2 = 0): { d_m: number; fPeak: number; fNull: number; fQuarter: number | null } {
  const g = openBaffleGeometry(b);
  let at: (f: number) => Complex;
  let d_m: number;
  let top: number;
  if (g.frame === "flat") {
    const m = flatModel(b, sd_m2, air);
    at = (f) => m.at(f);
    d_m = m.d_m;
    top = 4 * FULL_MODEL_TOP_HZ;
  } else {
    const m = frameModel(b, sd_m2, air);
    at = (f) => sub(m.front.at(f), m.rear.at(f));
    const f0 = 1;
    d_m = at(f0).im / ((2 * Math.PI * f0) / air.c);
    top = 2 * SLAB_TOP_HZ;
  }
  const mag = (f: number) => abs(at(f));
  let f = 10;
  while (f < top && mag(f * 1.01) >= mag(f)) f *= 1.01;
  const fPeak = refine(mag, f / 1.01, f * 1.01, 1);
  f = fPeak * 1.01;
  while (f < top && mag(f * 1.01) <= mag(f)) f *= 1.01;
  const fNull = f >= top ? top : refine(mag, f / 1.01, f * 1.01, -1);
  let fQuarter: number | null = null;
  if (g.rearLine) {
    // A duct with one open end: λ/4 at its length plus the open pipe end's correction (0.6133·r
    // at low frequency) as a first guess, then the peak of the mouth's flow per cone flow in
    // the duct model itself (a big mouth's end correction shrinks as it radiates).
    const r = Math.sqrt(g.ductArea_cm2 / Math.PI) / 100;
    const guess = air.c / (4 * (g.ductLength_cm / 100 + 0.6133 * r));
    const net = lineNetwork(g.rearLine, air);
    const at = (f: number) => abs(net.exitPerCone(2 * Math.PI * f));
    let best = guess;
    for (let f = guess * 0.6; f < guess * 1.6; f *= 1.005) if (at(f) > at(best)) best = f;
    fQuarter = refine(at, best / 1.005, best * 1.005, 1);
  }
  return { d_m, fPeak, fNull, fQuarter };
}

/** Golden-section search for a maximum (sign 1) or minimum (−1) of fn on [a, b]. */
function refine(fn: (f: number) => number, a: number, b: number, sign: 1 | -1): number {
  for (let k = 0; k < 40; k++) {
    const m1 = b - (b - a) / 1.618034;
    const m2 = a + (b - a) / 1.618034;
    if (sign * fn(m1) > sign * fn(m2)) b = m2;
    else a = m1;
  }
  return (a + b) / 2;
}
