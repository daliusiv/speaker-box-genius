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

/** The widest straight round port that fits when there are exactly `count` of them, as a candidate. */
export function choosePortCount(vb_l: number, fb: number, air: Air, count: number): AssistantPort | null {
  for (const d of PORT_SIZES) {
    const len = portLengthForFb(vb_l, { shape: "round", diameter_cm: d, length_cm: 10 }, fb, count, undefined, air);
    if (len > 1 && len <= portRoom_cm(vb_l, d, null)) return { kind: "straight", diameter_cm: d, flare_cm: 0, length_cm: r1(len), count };
  }
  return null;
}

/**
 * The widest round port (fewest chuffing problems) that still fits straight, by the same rule
 * as the app's "Port too long to fit" check (portRoom_cm: a cube of this volume, less a port
 * diameter). Two ports when one won't fit.
 */
export function choosePort(vb_l: number, fb: number, air: Air, space: PortSpace | null = null): { diameter_cm: number; length_cm: number; count: number } | null {
  for (const count of [1, 2]) {
    for (const d of PORT_SIZES) {
      const len = portLengthForFb(vb_l, { shape: "round", diameter_cm: d, length_cm: 10 }, fb, count, undefined, air);
      if (len > 1 && len <= portRoom_cm(vb_l, d, space?.long_cm ?? null)) return { diameter_cm: d, length_cm: r1(len), count };
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
 * In a box built to a known space (`space`), its real inside: the longest inside dimension for
 * the length, the next for a slot's width.
 */
export function portCandidates(vb_l: number, fb: number, air: Air, space: PortSpace | null = null): AssistantPort[] {
  const out: AssistantPort[] = [];
  const room = (clearance: number) => portRoom_cm(vb_l, clearance, space?.long_cm ?? null);
  const straight = choosePort(vb_l, fb, air, space);
  if (straight) out.push({ kind: "straight", flare_cm: 0, ...straight });
  for (const d of PORT_SIZES) {
    const flare = Math.max(1, r05(d / 4));
    const len = portLengthForFb(vb_l, { shape: "round", diameter_cm: d, length_cm: 10, flare_cm: flare }, fb, 1, undefined, air);
    if (len >= 2 * flare + 1 && len <= room(d)) {
      out.push({ kind: "flared", diameter_cm: d, flare_cm: flare, length_cm: r1(len), count: 1 });
      break;
    }
  }
  const width = Math.floor((space?.wide_cm ?? Math.cbrt(vb_l * 1000)) * 2) / 2;
  for (const h of SLOT_HEIGHTS) {
    if (h * 3 > width) continue;
    const len = portLengthForFb(vb_l, { shape: "slot", width_cm: width, height_cm: h, length_cm: 10 }, fb, 1, undefined, air);
    if (len > 1 && len <= room(h)) {
      out.push({ kind: "slot", slotWidth_cm: width, slotHeight_cm: h, length_cm: r1(len), count: 1 });
      break;
    }
  }
  return out;
}

/** A box's real inside (cm), when it's built to a known space: its longest and next-longest dimensions. */
export interface PortSpace {
  long_cm: number;
  wide_cm: number;
}

/** Whether a port only fits because of the box's real inside (longer than a cube of this volume allows). */
export function needsSpace(p: AssistantPort, vb_l: number): boolean {
  const cube = Math.cbrt(vb_l * 1000);
  if (p.kind === "slot") return p.length_cm > portRoom_cm(vb_l, p.slotHeight_cm) + 0.05 || p.slotWidth_cm > cube + 0.5;
  return p.length_cm > portRoom_cm(vb_l, p.diameter_cm) + 0.05;
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
