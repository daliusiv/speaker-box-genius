/**
 * Ports that fit: the plain tube, flared tube and slot the design assistant (and the app's
 * bandpass sizing) try, each the largest of its kind that fits straight inside its chamber by
 * the app's own "too long to fit" rule (portRoom_cm), and how fast is too fast for each.
 */
import { portLengthForFb, type Air } from "@sbg/engine";
import { portRoom_cm } from "./sim.ts";
import type { PortFields, VentedDesign } from "./state.ts";

const r1 = (v: number) => Math.round(v * 10) / 10;

/** A port the assistant suggests, as a vented design's fields: a straight or flared tube, or a slot. */
export type AssistantPort =
  | { kind: "straight" | "flared"; diameter_cm: number; flare_cm: number; length_cm: number; count: number }
  | { kind: "slot"; slotWidth_cm: number; slotHeight_cm: number; length_cm: number; count: number };

/** Round port sizes tried, largest first (cm, inside diameter). */
const PORT_SIZES = [20, 15, 12.5, 10, 7.5, 6, 5, 4, 3];

/**
 * The widest round port (fewest chuffing problems) that still fits straight, by the same rule
 * as the app's "Port too long to fit" check (portRoom_cm: a cube of this volume, less a port
 * diameter). Two ports when one won't fit.
 */
export function choosePort(vb_l: number, fb: number, air: Air): { diameter_cm: number; length_cm: number; count: number } | null {
  for (const count of [1, 2]) {
    for (const d of PORT_SIZES) {
      const len = portLengthForFb(vb_l, { shape: "round", diameter_cm: d, length_cm: 10 }, fb, count, undefined, air);
      if (len > 1 && len <= portRoom_cm(vb_l, d)) return { diameter_cm: d, length_cm: r1(len), count };
    }
  }
  return null;
}

const SLOT_HEIGHTS = [8, 6, 5, 4, 3, 2.5, 2, 1.5];
/** How much faster than the chuffing line a flared port's throat may run (its mouths set the noise). */
const FLARED_THROAT = 2;
const r05 = (v: number) => Math.round(v * 2) / 2;

/**
 * The ports worth trying, simplest to build first, each the largest of its kind that fits
 * straight (portRoom_cm): a plain tube; a tube with round-overs at both ends (a flared port,
 * radius ¼ of the throat as the app suggests, judged at its wider mouths); a slot as wide as
 * the box (a cube's side) along a wall, which only needs its height clear of the opposite wall.
 */
export function portCandidates(vb_l: number, fb: number, air: Air): AssistantPort[] {
  const out: AssistantPort[] = [];
  const straight = choosePort(vb_l, fb, air);
  if (straight) out.push({ kind: "straight", flare_cm: 0, ...straight });
  for (const d of PORT_SIZES) {
    const flare = Math.max(1, r05(d / 4));
    const len = portLengthForFb(vb_l, { shape: "round", diameter_cm: d, length_cm: 10, flare_cm: flare }, fb, 1, undefined, air);
    if (len >= 2 * flare + 1 && len <= portRoom_cm(vb_l, d)) {
      out.push({ kind: "flared", diameter_cm: d, flare_cm: flare, length_cm: r1(len), count: 1 });
      break;
    }
  }
  const width = Math.floor(Math.cbrt(vb_l * 1000) * 2) / 2;
  for (const h of SLOT_HEIGHTS) {
    if (h * 3 > width) continue;
    const len = portLengthForFb(vb_l, { shape: "slot", width_cm: width, height_cm: h, length_cm: 10 }, fb, 1, undefined, air);
    if (len > 1 && len <= portRoom_cm(vb_l, h)) {
      out.push({ kind: "slot", slotWidth_cm: width, slotHeight_cm: h, length_cm: r1(len), count: 1 });
      break;
    }
  }
  return out;
}

/** A port's fields for a vented design. */
export function portFieldsOf(p: AssistantPort): Partial<VentedDesign> {
  const { kind, ...rest } = p;
  return kind === "slot" ? { shape: "slot", flare_cm: 0, ...rest } : { shape: "round", ...rest };
}

/** A port's fields for a bandpass chamber (its target tuning set too). */
export function chamberPortFields(p: AssistantPort, fb: number, was: PortFields): PortFields {
  const { kind, ...rest } = p;
  return kind === "slot"
    ? { ...was, shape: "slot", flare_cm: 0, ...(rest as Partial<PortFields>), targetFb: r1(fb) }
    : { ...was, shape: "round", ...(rest as Partial<PortFields>), targetFb: r1(fb) };
}

/**
 * A port's air speed as it counts against the chuffing line (`limit`, same convention as
 * `vp`): a flared port is judged at its mouths (as the app does), but its narrow throat still
 * roars and compresses, so the throat may not pass FLARED_THROAT × the line either.
 */
export function portSpeedFor(p: AssistantPort, vp: number): number {
  if (p.kind !== "flared") return vp;
  const throat = (vp * ((p.diameter_cm + 2 * p.flare_cm) / p.diameter_cm) ** 2) / FLARED_THROAT;
  return Math.max(vp, throat);
}
