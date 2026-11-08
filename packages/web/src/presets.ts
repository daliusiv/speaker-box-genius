import {
  keeleAlignment,
  prAddedMassForFb,
  prFb,
  prGroupsAddedMassForFb,
  prGroupsFb,
  portLengthForFb,
  qb3Alignment,
  sealedVolumeForAlignment,
  simulate,
  type Air,
  type AlignmentDriver,
  type VentedAlignment,
  moreVentedAlignments,
  type ShapedAlignment,
} from "@sbg/engine";
import { airOf, endCorrectionOf, alignmentDriver, driverInputOf, enclosureOf, limitsOf, lossesFor, portLimitOf, portOf, portRoom_cm, prGroupsOf, ratedPowerOf, simOptionsOf, solveDriver } from "./sim.ts";
import type { AppState, BandpassDesign, DesignState, PrDesign, VentedDesign } from "./state.ts";
import { sizeBandpass } from "./bandpassSize.ts";
import { choosePortCount, portCandidates, portFieldsOf, portSpeedFor, type AssistantPort } from "./ports.ts";
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

/** The other vented alignment families that suit this driver (C4/SC4, BB4/SBB4, SQB3), as preset chips. */
export const moreVentedFor = (a: AlignmentDriver, drivers: number): ShapedAlignment[] => moreVentedAlignments(a, drivers);

/** What a family's preset does, for its chip's tooltip. */
export function alignmentHelp(a: ShapedAlignment): string {
  const db = `${a.db.toFixed(1)} dB`;
  const size = `${a.vb_l.toFixed(1)} L tuned to ${a.fb.toFixed(1)} Hz`;
  switch (a.name) {
    case "SC4":
      return `Sub-Chebyshev: flat, about QB3's size but tuned lower, with a gentler roll-off. ${size}.`;
    case "C4":
      return `Chebyshev: deeper than the flat preset in a bigger box, with a ${db} ripple above the roll-off. ${size}.`;
    case "SBB4":
      return `Sub-boom box: tuned to Fs, in a box about QB3's size or a little bigger; flat with a gentle roll-off and good transients. ${size}.`;
    case "BB4":
      return `Boom box: tuned to Fs; peaks ${db} before rolling off. ${size}.`;
    case "SQB3":
      return `Super QB3: QB3 carried past B4; peaks ${db} before rolling off. ${size}.`;
    default:
      return size;
  }
}

/** Largest sealed box offered, as a multiple of Vas: past it the box adds little bass. */
export const SEALED_MAX_VAS = 2;

/**
 * The sealed preset: Qtc 0.707, unless that needs a box bigger than twice Vas (Qts close to
 * 0.707, where the box size runs away: a Qts of 0.68 asks for 13 × Vas). Then a box of twice
 * Vas and the Qtc that gives, Qts·√1.5.
 */
export function sealedPreset(align: { qms: number; qes: number; vas_l: number }, drivers: number): { vb_l: number; name: string } | null {
  const vb = sealedVolumeForAlignment(align as never, 0.707, drivers);
  if (vb === null) return null;
  const cap = SEALED_MAX_VAS * align.vas_l * drivers;
  if (vb <= cap) return { vb_l: vb, name: "Qtc 0.707" };
  return { vb_l: cap, name: `Qtc ${sealedQtc(align, cap, drivers).toFixed(2)}` };
}

/** A sealed box's Qtc for this driver (Qts·√(1 + Vas/Vb), no losses). */
export function sealedQtc(align: { qms: number; qes: number; vas_l: number }, vb_l: number, drivers: number): number {
  const qts = (align.qms * align.qes) / (align.qms + align.qes);
  return qts * Math.sqrt(1 + (align.vas_l * drivers) / vb_l);
}

/**
 * Every design resized for the current driver with the presets on its card: sealed →
 * Qtc 0.707, ported and passive radiator → QB3/B4 (Keele's alignment for higher Qts),
 * bandpass → the lowest flat band within its present volume (sizeBandpassDesign). Designs
 * that can't take the preset (driver Qts too high, port or PRs that can't reach the tuning),
 * lines and the design whose volume comes from the volume calculator are left as they are,
 * with a reason.
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
        const sealed = sealedPreset(align, drivers);
        if (!sealed) {
          skipped.push(`${d.name}: the driver's Qts is already above 0.707`);
          return d;
        }
        changed.push(`${d.name} → ${sizeText(d, sealed.vb_l)} (${sealed.name})`);
        return { ...d, vb_l: r1(sealed.vb_l / stuffFactor(d)), ...withPreset(d.name, sealed.name) };
      }
      case "vented": {
        if (!qb3) {
          skipped.push(`${d.name}: the driver's Qts is too high for a flat vented alignment (above 0.6)`);
          return d;
        }
        const best = bestVentedPort(s, d, qb3.vb_l, qb3.fb);
        if (!best) {
          skipped.push(`${d.name}: no port fits ${r1(qb3.vb_l)} L tuned to ${r1(qb3.fb)} Hz`);
          return d;
        }
        changed.push(`${d.name} → ${sizeText(d, qb3.vb_l)} at ${r1(qb3.fb)} Hz (${qb3.name}), ${best.text}`);
        return { ...d, vb_l: r1(qb3.vb_l / stuffFactor(d)), targetFb: r1(qb3.fb), ...best.fields, ...withPreset(d.name, qb3.name) };
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
      case "bandpass": {
        const sized = sizeBandpassDesign(s, d);
        if (typeof sized === "string") {
          skipped.push(`${d.name}: ${sized}`);
          return d;
        }
        changed.push(`${d.name} → ${sized.text}`);
        return sized.design;
      }
      case "line":
        skipped.push(`${d.name}: use the line's own presets (they size the line for the driver)`);
        return d;
    }
  });
  return { state: changed.length > 0 ? { ...s, designs } : s, changed, skipped };
}

/**
 * A bandpass design re-sized for the current driver within its present total volume (both
 * chambers): the lowest band (−3 dB from its own peak) that reaches up to 80 Hz with under
 * 3 dB of ripple, with ports that fit and, where they can, stay under the chuffing line at
 * the current drive (see sizeBandpass). 4th order and 6th order (parallel) with ports; a
 * reason instead for series 6th order and chambers opened by passive radiators.
 */
export function sizeBandpassDesign(s: AppState, d: BandpassDesign): { design: BandpassDesign; text: string } | string {
  if (d.order === "6s") return "series-tuned 6th order isn't sized automatically (choose 4th or parallel 6th order)";
  if (d.frontOpening !== "port" || (d.order === "6p" && d.rearOpening !== "port")) return "a chamber opens through passive radiators: size it with ports, then swap them in";
  const solved = solveDriver(s);
  const align = alignmentDriver(solved, s);
  const drv = driverInputOf(s, solved);
  if (!align || !drv) return "enter the driver's parameters first";
  const total = d.vb_l + d.frontVb_l;
  const opts = simOptionsOf(s);
  // The simulation's port speeds are peak; the chuffing line is in the displayed convention.
  const vLimit = portLimitOf(s) * (s.settings.velocity === "rms" ? Math.SQRT2 : 1);
  const losses = lossesFor(s, d);
  const found = sizeBandpass(
    d,
    align,
    airOf(s),
    {
      orders: [d.order],
      maxVolume_l: total,
      endCorrection: endCorrectionOf(s),
      drivers: s.drivers,
      priority: "low",
      portLimit: vLimit,
    },
    // The engine's response, without room or cabin gain (the band is judged as the box makes it).
    (x) => simulate(drv, enclosureOf(x, x.vb_l, losses, s.volume.wall_mm), opts),
    (r) => limitsOf(r, s.xmax_mm, s.highPass.on, vLimit),
  )[d.order];
  if (!found) return `no flat band up to 80 Hz fits in ${r1(total)} L with this driver: try a bigger box`;
  const x = found.design;
  const tune = x.order === "4" ? `front ${r1(x.front.targetFb)} Hz` : `${r1(x.rear.targetFb)} / ${r1(x.front.targetFb)} Hz`;
  const band = `band ${Math.round(found.f3)}–${Math.round(found.f3High)} Hz`;
  const limits = found.within ? "" : `; over a limit at this drive (within it at ${Math.round(found.safe * found.safe * 100)} % of the power)`;
  return {
    design: { ...x, ...withPreset(d.name, "Flat band") },
    text: `${r1(x.vb_l)} + ${r1(x.frontVb_l)} L, ${tune}, ${band}${limits}`,
  };
}

/** How a port reads in the size report: "2 × 7.5 cm ports", "a 10 cm flared port", "a 30 × 4 cm slot". */
function portText(p: AssistantPort): string {
  const n = p.count > 1 ? `${p.count} × ` : "a ";
  if (p.kind === "slot") return `${n}${p.slotWidth_cm} × ${p.slotHeight_cm} cm slot${p.count > 1 ? "s" : ""}`;
  return `${n}${p.diameter_cm} cm${p.kind === "flared" ? " flared" : ""} port${p.count > 1 ? "s" : ""}`;
}

/**
 * The port for a ported box of `vb_l` tuned to `fb`, at the driver's rated power (else the
 * current drive): of the ports that
 * fit straight inside (one tube, two tubes, a flared tube, a slot along a wall, simplest to
 * build first), the first that stays under the chuffing line; if none does, the quietest
 * (the size report and the box's warning say so). Null if none fits at all.
 */
export function bestVentedPort(s: AppState, d: DesignState & { kind: "vented" }, vb_l: number, fb: number): { fields: Partial<DesignState & { kind: "vented" }>; text: string; quiet: boolean } | null {
  const air = airOf(s);
  const ec = endCorrectionOf(s);
  const tried = portCandidates(vb_l, fb, air, null, ec);
  // Two tubes as well as one: double the area for the same diameter (when one tube fits).
  const one = tried.find((p) => p.kind === "straight" && p.count === 1);
  const two = one && choosePortCount(vb_l, fb, air, 2, ec);
  const cands = [...(one ? [one] : []), ...(two ? [two] : []), ...tried.filter((p) => p !== one)];
  if (cands.length === 0) return null;
  // Judged at the driver's power rating when it has one (the box is built for what it can take,
  // not the 1 W the charts may be showing), else at the current drive.
  const rated = ratedPowerOf(s) > 0;
  const at: AppState = rated ? { ...s, drive: "watts", power: ratedPowerOf(s) } : s;
  const solved = solveDriver(at);
  const drv = driverInputOf(at, solved);
  const opts = simOptionsOf(at);
  // The simulation's port speeds are peak; the chuffing line is in the displayed convention.
  const vLimit = portLimitOf(s) * (s.settings.velocity === "rms" ? Math.SQRT2 : 1);
  let best: { p: AssistantPort; v: number } | null = null;
  for (const p of cands) {
    const x = { ...d, vb_l, targetFb: fb, ...portFieldsOf(p) } as DesignState;
    const r = simulate(drv, enclosureOf(x, vb_l, lossesFor(s, x), s.volume.wall_mm), opts);
    const v = portSpeedFor(p, limitsOf(r, at.xmax_mm, at.highPass.on, vLimit).vp ?? Infinity);
    if (v <= vLimit) {
      best = { p, v };
      break;
    }
    if (!best || v < best.v) best = { p, v };
  }
  const quiet = best!.v <= vLimit;
  const p = best!.p;
  return {
    fields: { flare_cm: 0, ...portFieldsOf(p) } as Partial<DesignState & { kind: "vented" }>,
    text: quiet ? portText(p) : `${portText(p)} (still over the chuffing line at ${rated ? `its ${ratedPowerOf(s)} W rating` : "this power"})`,
    quiet,
  };
}

/** A port that fits a vented box of vb_l (acting) tuned to fb, as Size all boxes picks it (bestVentedPort). */
export type PortPicker = (d: VentedDesign, vb_l: number, fb: number) => { fields: Partial<VentedDesign>; text: string } | null;

/**
 * A vented alignment applied to a ported design: the box and tuning, and the port. The current
 * port keeps its size and gets the length for the new tuning when that fits the box straight (the
 * "Port too long to fit" rule, portRoom_cm); otherwise it's swapped for one that fits (`pick`, as
 * Size all boxes does). `vb_l` is the volume the box acts as; `fill` the stuffing factor.
 */
export function ventedPresetPatch(
  v: VentedDesign,
  a: { name: string; vb_l: number; fb: number },
  fill: number,
  air: Air,
  internalMax_cm: number | null,
  pick?: PortPicker,
  ec?: number,
): { patch: Partial<VentedDesign> | null; msg: string } {
  const box = { vb_l: Math.round((a.vb_l / fill) * 10) / 10, targetFb: Math.round(a.fb * 10) / 10, ...withPreset(v.name, a.name) };
  const len = portLengthForFb(a.vb_l, portOf(v, 0), a.fb, v.count, ec, air);
  const clearance = v.shape === "round" ? v.diameter_cm : v.slotHeight_cm;
  if (len > 0 && len <= portRoom_cm(a.vb_l, clearance, internalMax_cm)) return { patch: { ...box, length_cm: Math.round(len * 10) / 10 }, msg: "" };
  const why = len > 0 ? "would be too long to fit" : "is too small for that tuning";
  const best = pick?.(v, a.vb_l, a.fb);
  if (!best) return { patch: null, msg: `${a.name}: ${a.vb_l.toFixed(1)} L tuned to ${a.fb.toFixed(1)} Hz, but this port ${why} and no simple port fits. Try a bent port or a different box.` };
  return { patch: { ...box, ...best.fields }, msg: `${a.name}: this port ${why}, so it's now ${best.text}.` };
}
