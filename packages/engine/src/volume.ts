import { wedgeGeometry } from "./wedge.ts";

/**
 * Real-world enclosure volume: gross internal volume of common shapes, minus
 * everything that takes up space inside, plus an optional fill (stuffing) factor.
 *
 * All shape dimensions are EXTERNAL; the wall thickness is removed on every side.
 * Use wall_mm = 0 to enter internal dimensions directly.
 */

export type Shape =
  | { kind: "box"; width_cm: number; height_cm: number; depth_cm: number }
  /**
   * A tube with flat end caps. `capWall_mm` is the end caps' thickness when it differs from the
   * tube wall (a cardboard or PVC tube with MDF caps); absent = the same as the wall.
   */
  | { kind: "cylinder"; diameter_cm: number; length_cm: number; capWall_mm?: number }
  | { kind: "sphere"; diameter_cm: number }
  /**
   * Rectangular truncated pyramid (a tapered box or wedge): bottom W×D, top W×D, height. The
   * volume doesn't depend on where the top sits over the bottom (a wedge with one sloped face
   * holds the same as one tapered on both sides); the walls are taken as tapering evenly.
   */
  | {
      kind: "frustum";
      bottomWidth_cm: number;
      bottomDepth_cm: number;
      topWidth_cm: number;
      topDepth_cm: number;
      height_cm: number;
    }
  /**
   * Car wedge (single slope): outside width and height, the outside depth at the top (short)
   * and at the bottom (long); one panel slopes between them. `slopeWall_mm` is the sloped
   * panel's thickness when it differs from the walls (a double baffle); absent = the wall.
   * Exact: the sloped panel takes its thickness ÷ sin θ across the horizontal (see wedge.ts).
   * Whether the front or the back slopes doesn't change the volume.
   */
  | { kind: "wedge"; width_cm: number; height_cm: number; topDepth_cm: number; bottomDepth_cm: number; slopeWall_mm?: number };

/** A wedge shape in the millimetres wedge.ts works in. */
export const wedgeDimsOf = (shape: Extract<Shape, { kind: "wedge" }>, wall_mm: number) => ({
  width: shape.width_cm * 10,
  height: shape.height_cm * 10,
  topDepth: shape.topDepth_cm * 10,
  bottomDepth: shape.bottomDepth_cm * 10,
  wall: wall_mm,
  ...(shape.slopeWall_mm !== undefined ? { slopeWall: shape.slopeWall_mm } : {}),
});

const pos = (x: number) => Math.max(0, x);

/** Internal volume (litres) of a shape with walls of thickness wall_mm. */
export function grossVolume(shape: Shape, wall_mm = 0): number {
  const t = wall_mm / 10; // cm
  let cm3: number;
  switch (shape.kind) {
    case "box":
      cm3 = pos(shape.width_cm - 2 * t) * pos(shape.height_cm - 2 * t) * pos(shape.depth_cm - 2 * t);
      break;
    case "cylinder": {
      const r = pos(shape.diameter_cm / 2 - t);
      const cap = (shape.capWall_mm ?? wall_mm) / 10;
      cm3 = Math.PI * r * r * pos(shape.length_cm - 2 * cap);
      break;
    }
    case "sphere": {
      const r = pos(shape.diameter_cm / 2 - t);
      cm3 = (4 / 3) * Math.PI * r ** 3;
      break;
    }
    case "frustum": {
      const f = frustumInside(shape, t);
      // Prismatoid formula: exact for a rectangular frustum, even when the top and bottom
      // are not similar rectangles.
      const mid = ((f.w1 + f.w2) / 2) * ((f.d1 + f.d2) / 2);
      cm3 = (f.h / 6) * (f.w1 * f.d1 + 4 * mid + f.w2 * f.d2);
      break;
    }
    case "wedge":
      cm3 = wedgeGeometry(wedgeDimsOf(shape, wall_mm)).volume_l * 1000;
      break;
  }
  return cm3 / 1000;
}

/**
 * The inside of a tapered box with walls t cm thick (measured square to each face). A sloping
 * wall is thicker across the horizontal than t, by 1/cos of its slope, and the inside top and
 * bottom sit t in from the outside ones, where the outside is already a little narrower (or
 * wider). When the inside closes to a point or edge below the top, it stops there. All cm:
 * inside bottom w1 × d1 at height z0, top w2 × d2 at z0 + h, centred over the outside.
 */
export function frustumInside(shape: Extract<Shape, { kind: "frustum" }>, t: number) {
  const H = shape.height_cm;
  if (!(H > 0)) return { w1: 0, d1: 0, w2: 0, d2: 0, h: 0, z0: 0 };
  const sw = (shape.bottomWidth_cm - shape.topWidth_cm) / (2 * H);
  const sd = (shape.bottomDepth_cm - shape.topDepth_cm) / (2 * H);
  const ow = t * Math.hypot(1, sw);
  const od = t * Math.hypot(1, sd);
  const w = (z: number) => shape.bottomWidth_cm - 2 * sw * z - 2 * ow;
  const d = (z: number) => shape.bottomDepth_cm - 2 * sd * z - 2 * od;
  let z0 = t;
  let z1 = H - t;
  // Keep only the heights where the inside is open in both directions (each is linear in z).
  for (const [f, s] of [[w, sw], [d, sd]] as const) {
    const zero = f(0) / (2 * s); // where f reaches 0, if it slopes
    if (s > 0) z1 = Math.min(z1, zero);
    else if (s < 0) z0 = Math.max(z0, zero);
    else if (f(0) <= 0) z1 = z0;
  }
  if (!(z1 > z0)) return { w1: 0, d1: 0, w2: 0, d2: 0, h: 0, z0: 0 };
  return { w1: pos(w(z0)), d1: pos(d(z0)), w2: pos(w(z1)), d2: pos(d(z1)), h: z1 - z0, z0 };
}

/** The longest straight run inside the shape (cm): how long a straight port can be, at most. */
export function insideLongest_cm(shape: Shape, wall_mm = 0): number {
  const t = wall_mm / 10;
  switch (shape.kind) {
    case "box":
      return pos(Math.max(shape.width_cm, shape.height_cm, shape.depth_cm) - 2 * t);
    case "cylinder":
      return Math.max(pos(shape.diameter_cm - 2 * t), pos(shape.length_cm - (2 * (shape.capWall_mm ?? wall_mm)) / 10));
    case "sphere":
      return pos(shape.diameter_cm - 2 * t);
    case "frustum": {
      const f = frustumInside(shape, t);
      return Math.max(f.w1, f.d1, f.w2, f.d2, f.h);
    }
    case "wedge": {
      const g = wedgeGeometry(wedgeDimsOf(shape, wall_mm));
      return pos(Math.max(g.insideWidth, g.insideHeight, g.insideBottomDepth, g.insideSlant)) / 10;
    }
  }
}

/**
 * The enclosure's lowest standing wave (Hz), for air with sound speed c (m/s): a box's is half
 * a wavelength across its longest inside dimension. Round shapes are different: a sphere's
 * lowest is at ka = 2.0816 (the first zero of j1′), 1.32 times higher than half a wavelength
 * across its diameter; a cylinder's across its diameter at ka = 1.8412 (J1′), 1.17 times
 * higher, so its lowest is that or the one along its length, whichever is lower. A tapered
 * box or a wedge is taken as a box of its longest inside run (its modes shift with the taper).
 */
export function lowestMode_hz(shape: Shape, wall_mm = 0, c = 343): number {
  const t = wall_mm / 10;
  const m = (cm: number) => (cm > 0 ? c / (2 * cm / 100) : Infinity);
  switch (shape.kind) {
    case "sphere": {
      const d = pos(shape.diameter_cm - 2 * t) / 100;
      return d > 0 ? (2.0816 * c) / (Math.PI * d) : Infinity;
    }
    case "cylinder": {
      const d = pos(shape.diameter_cm - 2 * t) / 100;
      const across = d > 0 ? (1.8412 * c) / (Math.PI * d) : Infinity;
      return Math.min(across, m(pos(shape.length_cm - (2 * (shape.capWall_mm ?? wall_mm)) / 10)));
    }
    default:
      return m(insideLongest_cm(shape, wall_mm));
  }
}

/**
 * Rough driver displacement when the datasheet doesn't give one: about a third
 * of the cylinder defined by the cutout and the mounting depth (cone + motor).
 */
export function estimateDriverDisplacement(cutout_mm: number, depth_mm: number): number {
  return (0.33 * Math.PI * (cutout_mm / 2) ** 2 * depth_mm) / 1e6;
}

/** Volume (litres) taken by slot ports inside the box (inner size plus walls on all four sides). */
export function slotPortDisplacement(width_cm: number, height_cm: number, length_cm: number, wall_mm: number, count = 1): number {
  const t = wall_mm / 10;
  return (count * (width_cm + 2 * t) * (height_cm + 2 * t) * length_cm) / 1000;
}

/** Volume (litres) taken by round port tubes inside the box. */
export function portTubeDisplacement(
  innerDiameter_cm: number,
  length_cm: number,
  wall_mm: number,
  count = 1,
): number {
  const r = innerDiameter_cm / 2 + wall_mm / 10;
  return (count * Math.PI * r * r * length_cm) / 1000;
}

export interface VolumeInput {
  shape: Shape;
  wall_mm: number;
  drivers?: { count: number; displacement_l: number };
  passiveRadiators?: { count: number; displacement_l: number };
  /** Round ports use innerDiameter_cm; slot ports give `slot` instead. */
  ports?: {
    count: number;
    length_cm: number;
    wall_mm: number;
    innerDiameter_cm?: number;
    slot?: { width_cm: number; height_cm: number };
  };
  /** Bracing as a percentage of the gross internal volume. */
  bracing_pct?: number;
  /** Crossover board, plate amp, terminal cup and anything else (litres). */
  other_l?: number;
  /** Extra effective volume from damping material, % of net (typically 0–25). */
  fill_pct?: number;
}

export interface VolumeResult {
  gross_l: number;
  deductions: { label: string; litres: number }[];
  net_l: number;
  /** Net volume including the fill factor: what the simulation should use. */
  effective_l: number;
}

export function netVolume(v: VolumeInput): VolumeResult {
  const gross = grossVolume(v.shape, v.wall_mm);
  const deductions: VolumeResult["deductions"] = [];
  if (v.drivers && v.drivers.count > 0 && v.drivers.displacement_l > 0) {
    deductions.push({ label: `Drivers (${v.drivers.count}×)`, litres: v.drivers.count * v.drivers.displacement_l });
  }
  if (v.passiveRadiators && v.passiveRadiators.count > 0 && v.passiveRadiators.displacement_l > 0) {
    deductions.push({
      label: `Passive radiators (${v.passiveRadiators.count}×)`,
      litres: v.passiveRadiators.count * v.passiveRadiators.displacement_l,
    });
  }
  if (v.ports && v.ports.count > 0 && v.ports.length_cm > 0) {
    deductions.push({
      label: `${v.ports.slot ? "Slot ports" : "Port tubes"} (${v.ports.count}×)`,
      litres: v.ports.slot
        ? slotPortDisplacement(v.ports.slot.width_cm, v.ports.slot.height_cm, v.ports.length_cm, v.ports.wall_mm, v.ports.count)
        : portTubeDisplacement(v.ports.innerDiameter_cm ?? 0, v.ports.length_cm, v.ports.wall_mm, v.ports.count),
    });
  }
  if (v.bracing_pct && v.bracing_pct > 0) {
    deductions.push({ label: `Bracing (${v.bracing_pct}%)`, litres: (gross * v.bracing_pct) / 100 });
  }
  if (v.other_l && v.other_l > 0) deductions.push({ label: "Other (crossover, amp…)", litres: v.other_l });

  const net = Math.max(0, gross - deductions.reduce((a, d) => a + d.litres, 0));
  return { gross_l: gross, deductions, net_l: net, effective_l: net * (1 + (v.fill_pct ?? 0) / 100) };
}
