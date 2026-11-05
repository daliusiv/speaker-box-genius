import {
  keeleAlignment,
  portLengthForFb,
  prAddedMassForFb,
  prFb,
  prGroupsAddedMassForFb,
  prGroupsFb,
  qb3Alignment,
  sealedVolumeForAlignment,
  type Air,
  type AlignmentDriver,
  type VentedAlignment,
} from "@sbg/engine";
import { airOf, alignmentDriver, portOf, prGroupsOf, solveDriver } from "./sim.ts";
import type { AppState, DesignState, PrDesign } from "./state.ts";
import { stuffFactor } from "./stuffing.ts";

/** "31.1 L" or, for a stuffed box, "31.1 L (stuffed, acting as 37.3 L)". */
const sizeText = (d: DesignState, acting: number) =>
  stuffFactor(d) === 1 ? `${r1(acting)} L` : `${r1(acting / stuffFactor(d))} L (stuffed, acting as ${r1(acting)} L)`;

/** Preset names that older versions appended to a design's name ("Ported QB3"). */
const PRESET_SUFFIX = / (Qtc [\d.]+|QB3|B4|Keele)$/;
/** A design's name without a preset appended by older versions: "Ported QB3" → "Ported". */
export const stripPreset = (name: string) => name.replace(PRESET_SUFFIX, "");
/** The preset an older version appended to the name, if any. */
export const presetInName = (name: string) => PRESET_SUFFIX.exec(name)?.[1];
/** A preset applied to a design: the name stays (minus any old suffix), the preset becomes its tag. */
export const withPreset = (name: string, preset: string) => ({ name: stripPreset(name), preset });

/** Tuning helpers for a PR box (one or several groups); added mass goes on group 1. */
export function prTuning(d: PrDesign, vb_l: number, air: Air) {
  const groups = prGroupsOf(d);
  const mixed = groups.length > 1;
  return {
    mixed,
    fb: mixed ? prGroupsFb(vb_l, groups, air) : prFb(vb_l, d.params, d.count, d.addedMass_g, air),
    /** Added mass per PR in the first group for `fb` (NaN-free; may be negative or Infinity). */
    massFor: (fb: number, vb = vb_l) =>
      mixed ? prGroupsAddedMassForFb(vb, groups, fb, 0, air) : prAddedMassForFb(vb, d.params, fb, d.count, air),
    bare: (vb = vb_l) =>
      mixed ? prGroupsFb(vb, groups.map((g, i) => (i === 0 ? { ...g, addedMass_g: 0 } : g)), air) : prFb(vb, d.params, d.count, 0, air),
  };
}

const r1 = (v: number) => Math.round(v * 10) / 10;

/** The flat vented alignment for this driver: QB3/B4 up to Qts ≈ 0.38, Keele's above it (to Qts 0.6). */
export const ventedAlignmentFor = (a: AlignmentDriver, drivers: number): VentedAlignment | null =>
  qb3Alignment(a, drivers) ?? keeleAlignment(a, drivers);

/**
 * Every design resized for the current driver with the presets on its card: sealed →
 * Qtc 0.707, ported and passive radiator → QB3/B4 (Keele's alignment for higher Qts). Designs that can't take the preset
 * (driver Qts too high, port or PRs that can't reach the tuning), bandpass designs and the
 * design whose volume comes from the volume calculator are left as they are, with a reason.
 */
export function sizeAllForDriver(s: AppState): { state: AppState; changed: string[]; skipped: string[] } {
  const align = alignmentDriver(solveDriver(s), s);
  const changed: string[] = [];
  const skipped: string[] = [];
  if (!align) return { state: s, changed, skipped: ["Enter the driver's parameters first."] };
  const air = airOf(s);
  const drivers = s.drivers;
  const qb3 = ventedAlignmentFor(align, drivers);
  const designs = s.designs.map((d): DesignState => {
    if (s.volume.link === d.id) {
      skipped.push(`${d.name}: its volume comes from the volume calculator`);
      return d;
    }
    switch (d.kind) {
      case "sealed": {
        const vb = sealedVolumeForAlignment(align, 0.707, drivers);
        if (vb === null) {
          skipped.push(`${d.name}: the driver's Qts is already above 0.707`);
          return d;
        }
        changed.push(`${d.name} → ${sizeText(d, vb)} (Qtc 0.707)`);
        return { ...d, vb_l: r1(vb / stuffFactor(d)), ...withPreset(d.name, "Qtc 0.707") };
      }
      case "vented": {
        if (!qb3) {
          skipped.push(`${d.name}: the driver's Qts is too high for a flat vented alignment (above 0.6)`);
          return d;
        }
        const len = portLengthForFb(qb3.vb_l, portOf(d, 0), qb3.fb, d.count, undefined, air);
        if (!(len > 0)) {
          skipped.push(`${d.name}: its port is too small to tune ${r1(qb3.vb_l)} L to ${r1(qb3.fb)} Hz`);
          return d;
        }
        changed.push(`${d.name} → ${sizeText(d, qb3.vb_l)} at ${r1(qb3.fb)} Hz (${qb3.name})`);
        return { ...d, vb_l: r1(qb3.vb_l / stuffFactor(d)), targetFb: r1(qb3.fb), length_cm: r1(len), ...withPreset(d.name, qb3.name) };
      }
      case "pr": {
        if (!qb3) {
          skipped.push(`${d.name}: the driver's Qts is too high for a flat vented alignment (above 0.6)`);
          return d;
        }
        const add = prTuning(d, qb3.vb_l, air).massFor(qb3.fb, qb3.vb_l);
        if (!(add >= 0) || add === Infinity) {
          skipped.push(`${d.name}: these PRs can't reach ${r1(qb3.fb)} Hz in ${r1(qb3.vb_l)} L`);
          return d;
        }
        changed.push(`${d.name} → ${sizeText(d, qb3.vb_l)} at ${r1(qb3.fb)} Hz (${qb3.name}, ${Math.round(add)} g added)`);
        return {
          ...d,
          vb_l: r1(qb3.vb_l / stuffFactor(d)),
          targetFb: r1(qb3.fb),
          addedMass_g: Math.round(add),
          ...withPreset(d.name, qb3.name),
        };
      }
      case "bandpass":
        skipped.push(`${d.name}: bandpass boxes have no one-click alignment yet`);
        return d;
      case "line":
        skipped.push(`${d.name}: use the line's own presets (they size the line for the driver)`);
        return d;
    }
  });
  return { state: changed.length > 0 ? { ...s, designs } : s, changed, skipped };
}
