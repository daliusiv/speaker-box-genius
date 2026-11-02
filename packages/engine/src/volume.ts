/**
 * Real-world enclosure volume: gross internal volume of common shapes, minus
 * everything that takes up space inside, plus an optional fill (stuffing) factor.
 *
 * All shape dimensions are EXTERNAL; the wall thickness is removed on every side.
 * Use wall_mm = 0 to enter internal dimensions directly.
 */

export type Shape =
  | { kind: "box"; width_cm: number; height_cm: number; depth_cm: number }
  | { kind: "cylinder"; diameter_cm: number; length_cm: number }
  | { kind: "sphere"; diameter_cm: number }
  /** Rectangular truncated pyramid: bottom W×D, top W×D, height. */
  | {
      kind: "frustum";
      bottomWidth_cm: number;
      bottomDepth_cm: number;
      topWidth_cm: number;
      topDepth_cm: number;
      height_cm: number;
    };

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
      cm3 = Math.PI * r * r * pos(shape.length_cm - 2 * t); // end caps included
      break;
    }
    case "sphere": {
      const r = pos(shape.diameter_cm / 2 - t);
      cm3 = (4 / 3) * Math.PI * r ** 3;
      break;
    }
    case "frustum": {
      // Prismatoid formula: exact for a rectangular frustum, even when the
      // top and bottom are not similar rectangles.
      const w1 = pos(shape.bottomWidth_cm - 2 * t);
      const d1 = pos(shape.bottomDepth_cm - 2 * t);
      const w2 = pos(shape.topWidth_cm - 2 * t);
      const d2 = pos(shape.topDepth_cm - 2 * t);
      const h = pos(shape.height_cm - 2 * t);
      const mid = ((w1 + w2) / 2) * ((d1 + d2) / 2);
      cm3 = (h / 6) * (w1 * d1 + 4 * mid + w2 * d2);
      break;
    }
  }
  return cm3 / 1000;
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
