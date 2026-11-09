/**
 * The port length calculator's sums (the page at /calculators/port-length/), with the
 * engine's own port model, so its lengths are the app's to the millimetre: the same end
 * corrections, flares, slot sizes and air as a ported design in the app.
 */
import { portEffectiveLength, portLengthForFb, portPipeResonance, portArea, portTubeDisplacement, slotPortDisplacement, ventedFb, type Air, type PortInput } from "@sbg/engine";
import { SLOT_WALL_K } from "../ports.ts";
import { portRoom_cm } from "../sim.ts";

/** Port ends, as WinISD offers them, plus a slot built along the box walls. */
export type PortEnds = "flanged" | "both" | "free" | "wall";
export const END_K: Record<Exclude<PortEnds, "wall">, number> = { flanged: 0.732, both: 0.85, free: 0.613 };

export interface PortCalcInput {
  /** Net volume (L): after driver and bracing. With `subtractPort`, before the port. */
  vb_l: number;
  fb: number;
  shape: "round" | "slot";
  diameter_cm: number;
  width_cm: number;
  height_cm: number;
  count: number;
  /** Round-over radius at both ends (cm), round ports only. */
  flare_cm: number;
  ends: PortEnds;
  /** Take the port's own volume (tube walls or slot walls included) out of vb_l first. */
  subtractPort: boolean;
  /** Port wall thickness (mm): a tube's wall, or the board a slot is built from. */
  wall_mm: number;
  /** Longest inside dimension of the box (cm), if known; else a cube of this volume. */
  inside_cm?: number;
}

export interface PortCalcResult {
  length_cm: number;
  /** Effective (acoustic) length of one port, end corrections included (cm). */
  effective_cm: number;
  area_cm2: number;
  /** Total port area per litre of box (cm²/L). */
  areaPerLitre: number;
  /** Volume the ports take (L) and the net volume they tune (L). */
  portDisp_l: number;
  tunedVb_l: number;
  pipe_hz: number;
  /** Room for a straight port (cm) and whether it fits. */
  room_cm: number;
  fits: boolean;
  /** Slot along a wall: the likely tuning range at this length (Hz). */
  wallRange?: { low: number; high: number };
  k: number;
}

export function portInputOf(i: Pick<PortCalcInput, "shape" | "diameter_cm" | "width_cm" | "height_cm" | "flare_cm">, length_cm = 0): PortInput {
  return i.shape === "round"
    ? { shape: "round", diameter_cm: i.diameter_cm, length_cm, ...(i.flare_cm > 0 ? { flare_cm: i.flare_cm } : {}) }
    : { shape: "slot", width_cm: i.width_cm, height_cm: i.height_cm, length_cm };
}

export const endK = (ends: PortEnds) => (ends === "wall" ? SLOT_WALL_K.mid : END_K[ends]);

function displacement(i: PortCalcInput, length_cm: number): number {
  if (!(length_cm > 0)) return 0;
  return i.shape === "round"
    ? portTubeDisplacement(i.diameter_cm, length_cm, i.wall_mm, i.count)
    : slotPortDisplacement(i.width_cm, i.height_cm, length_cm, i.wall_mm, i.count);
}

/** Null when the inputs can't make a port (no area, no volume, or the port would be shorter than nothing). */
export function portCalc(i: PortCalcInput, air: Air): PortCalcResult | null {
  const base = portInputOf(i);
  if (!(i.vb_l > 0) || !(i.fb > 0) || !(i.count >= 1) || !(portArea(base) > 0)) return null;
  const k = endK(i.ends);
  let vb = i.vb_l;
  let length = portLengthForFb(vb, base, i.fb, i.count, k, air);
  if (i.subtractPort) {
    // The port's volume lowers the net volume, which needs a longer port: settle the two.
    for (let n = 0; n < 30 && length > 0; n++) {
      const next = i.vb_l - displacement(i, length);
      if (!(next > 0)) return null;
      const l2 = portLengthForFb(next, base, i.fb, i.count, k, air);
      vb = next;
      if (Math.abs(l2 - length) < 1e-4) {
        length = l2;
        break;
      }
      length = l2;
    }
  }
  if (!(length > 0)) return null;
  const port = portInputOf(i, length);
  const area = portArea(port) * 1e4;
  const clearance = i.shape === "round" ? i.diameter_cm : i.height_cm;
  const room = portRoom_cm(i.vb_l, clearance, i.inside_cm && i.inside_cm > 0 ? i.inside_cm : null);
  const wallRange =
    i.ends === "wall" && i.shape === "slot"
      ? { low: ventedFb(vb, port, i.count, SLOT_WALL_K.high, air), high: ventedFb(vb, port, i.count, SLOT_WALL_K.low, air) }
      : undefined;
  return {
    length_cm: length,
    effective_cm: portEffectiveLength(port, k) * 100,
    area_cm2: area * i.count,
    areaPerLitre: (area * i.count) / vb,
    portDisp_l: displacement(i, length),
    tunedVb_l: vb,
    pipe_hz: portPipeResonance(port, k, air),
    room_cm: room,
    fits: length <= room,
    ...(wallRange ? { wallRange } : {}),
    k,
  };
}
