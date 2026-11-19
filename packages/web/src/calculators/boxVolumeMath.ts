/**
 * The box volume calculator's sums (the page at /calculators/box-volume/), with the app's own
 * volume code: the form becomes the app's volume calculator state (Build → Box) and one design
 * linked to it, and every figure comes from `volumeFor`, `dimensionsFor` and `solveWedgeFor`,
 * so the page and the app's Box card can't disagree. No DOM, so the site build and the tests
 * use it too.
 */
import { insideLongest_cm, lowestMode_hz, wedgeGeometry, type VolumeResult } from "@sbg/engine";
import { DEFAULT_STATE, newDesign, type AppState, type DesignState, type PrDesign, type PrParams, type SealedDesign, type ShapeKind, type VentedDesign } from "../state.ts";
import { airOf, dimensionsFor, prTotal, shapeOf, solveWedgeFor, volumeFor, wedgeDimsOf, wedgeToVolume } from "../sim.ts";

/**
 * What the page's form holds, in metric (cm, mm, litres). The sizes are kept per meaning, as the
 * link keys are: `w h d` a box's (and a wedge's width and height), `dia len` a tube's or a
 * sphere's, `tw td bw bd` the top and bottom of a tapered box (a wedge uses `td` and `bd` for its
 * depths), `h` every shape's height.
 */
export interface BoxForm {
  shape: ShapeKind;
  w: number;
  h: number;
  d: number;
  dia: number;
  len: number;
  tw: number;
  td: number;
  bw: number;
  bd: number;
  /** Car wedge: the upright lip's outside height (0 = none). */
  lip: number;
  /** Walls (mm). */
  wall: number;
  /** Cylinder end caps (mm); null = the same as the walls. */
  cap: number | null;
  /** Car wedge sloped panel (mm); null = the same as the walls. */
  sw: number | null;
  /** Drivers: how many, and the air each takes (L). */
  n: number;
  dd: number;
  /** Passive radiators: how many, and the air each takes (L). */
  np: number;
  pd: number;
  /** Ports: how many, round or slot, inside diameter or slot width × height (cm), length (cm), wall (mm). */
  pc: number;
  pt: "round" | "slot";
  pdia: number;
  pw: number;
  ph: number;
  pl: number;
  pwt: number;
  /** Bracing (% of the gross) and anything else inside (L). */
  br: number;
  o: number;
}

/** The page's starting box: 60 × 45 × 50 cm in 18 mm board, a 12-inch driver, one 10 cm port, 3 % bracing. */
export const BOX_DEFAULTS: BoxForm = {
  shape: "box",
  w: 60,
  h: 45,
  d: 50,
  dia: 40,
  len: 100,
  tw: 30,
  td: 30,
  bw: 50,
  bd: 50,
  lip: 0,
  wall: 18,
  cap: null,
  sw: null,
  n: 1,
  dd: 3.01,
  np: 0,
  pd: 0,
  pc: 1,
  pt: "round",
  pdia: 10,
  pw: 20,
  ph: 5,
  pl: 45.5,
  pwt: 3,
  br: 3,
  o: 0,
};

export const SHAPE_IDS = ["box", "wedge", "cylinder", "sphere", "frustum"] as const satisfies readonly ShapeKind[];

/** A count as the app holds it: a whole number, at least `min`. */
const whole = (x: number, min: number) => (Number.isFinite(x) ? Math.max(min, Math.round(x)) : min);
const nonNeg = (x: number) => (Number.isFinite(x) && x > 0 ? x : 0);

/** The app's volume calculator for this form (Build → Box), linked to design d1. */
export function volumeOf(f: BoxForm, base: AppState["volume"] = DEFAULT_STATE.volume): AppState["volume"] {
  const v: AppState["volume"] = {
    ...base,
    link: "d1",
    shape: f.shape,
    wall_mm: nonNeg(f.wall),
    capWall_mm: null,
    slopeWall_mm: null,
    lip_cm: 0,
    driverDisp_l: nonNeg(f.dd),
    prDisp_l: nonNeg(f.pd),
    portWall_mm: nonNeg(f.pwt),
    bracing_pct: nonNeg(f.br),
    other_l: nonNeg(f.o),
  };
  switch (f.shape) {
    case "box":
      return { ...v, width_cm: f.w, height_cm: f.h, depth_cm: f.d };
    case "wedge":
      return {
        ...v,
        width_cm: f.w,
        height_cm: f.h,
        topDepth_cm: f.td,
        depth_cm: f.bd,
        lip_cm: nonNeg(f.lip),
        slopeWall_mm: f.sw !== null && f.sw > 0 ? f.sw : null,
      };
    case "cylinder":
      return { ...v, diameter_cm: f.dia, height_cm: f.len, capWall_mm: f.cap !== null && f.cap >= 0 ? f.cap : null };
    case "sphere":
      return { ...v, diameter_cm: f.dia };
    case "frustum":
      return { ...v, width_cm: f.bw, depth_cm: f.bd, topWidth_cm: f.tw, topDepth_cm: f.td, height_cm: f.h };
  }
}

/** Back from the app's volume calculator to the form's sizes (the rest of the form stays). */
export function formFromVolume(f: BoxForm, v: AppState["volume"]): BoxForm {
  switch (v.shape) {
    case "box":
      return { ...f, shape: "box", w: v.width_cm, h: v.height_cm, d: v.depth_cm };
    case "wedge":
      return { ...f, shape: "wedge", w: v.width_cm, h: v.height_cm, td: v.topDepth_cm, bd: v.depth_cm, lip: v.lip_cm };
    case "cylinder":
      return { ...f, shape: "cylinder", dia: v.diameter_cm, len: v.height_cm };
    case "sphere":
      return { ...f, shape: "sphere", dia: v.diameter_cm };
    case "frustum":
      return { ...f, shape: "frustum", bw: v.width_cm, bd: v.depth_cm, tw: v.topWidth_cm, td: v.topDepth_cm, h: v.height_cm };
  }
}

/** The box type the inside parts make: ports → ported, passive radiators → PR box, else sealed. */
export type BoxKind = "vented" | "pr" | "sealed";
export const kindOf = (f: BoxForm): BoxKind => (whole(f.pc, 0) > 0 ? "vented" : whole(f.np, 0) > 0 ? "pr" : "sealed");

/** A database passive radiator for the PR box (else the app's example PR). */
export interface PickedPr {
  id: string;
  name: string;
  params: PrParams;
}

/** The design the calculator feeds (id d1): the port or PRs of the form, its volume `vb_l`. */
export function designOf(f: BoxForm, vb_l = 0, pr?: PickedPr | null): DesignState {
  const vb = Math.round(vb_l * 100) / 100;
  const kind = kindOf(f);
  if (kind === "vented") {
    const d = newDesign("vented", []) as VentedDesign;
    return {
      ...d,
      id: "d1",
      name: `Ported ${vb.toFixed(1)} L`,
      vb_l: vb,
      shape: f.pt,
      diameter_cm: f.pt === "round" ? nonNeg(f.pdia) : d.diameter_cm,
      slotWidth_cm: f.pt === "slot" ? nonNeg(f.pw) : d.slotWidth_cm,
      slotHeight_cm: f.pt === "slot" ? nonNeg(f.ph) : d.slotHeight_cm,
      length_cm: nonNeg(f.pl),
      count: whole(f.pc, 1),
      flare_cm: 0,
    };
  }
  if (kind === "pr") {
    const d = newDesign("pr", []) as PrDesign;
    return {
      ...d,
      id: "d1",
      name: `Passive radiator ${vb.toFixed(1)} L`,
      vb_l: vb,
      count: whole(f.np, 1),
      extra: [],
      ...(pr ? { prName: pr.name, prId: pr.id, params: { ...pr.params } } : {}),
    };
  }
  const d = newDesign("sealed", []) as SealedDesign;
  return { ...d, id: "d1", name: `Sealed ${vb.toFixed(1)} L`, vb_l: vb };
}

/** The app's state for the form: `base`'s driver, the form's drivers, its box linked to its one design. */
export function stateOf(f: BoxForm, base: AppState = DEFAULT_STATE, pr?: PickedPr | null): AppState {
  const s0: AppState = { ...base, drivers: whole(f.n, 1), isobaric: false, volume: volumeOf(f, base.volume), designs: [designOf(f, 0, pr)] };
  const net = volumeFor(s0, s0.designs[0]).net_l;
  return { ...s0, designs: [designOf(f, net, pr)] };
}

/** Why the box holds nothing. */
export type BoxProblem = "walls" | "parts";

export interface BoxVolume {
  /** Gross, each deduction and net (L), as the app's Box card shows them. */
  r: VolumeResult;
  /** Total of the deductions (L). */
  parts_l: number;
  /** Longest straight run inside (cm) and the lowest standing wave (Hz). */
  longest_cm: number;
  mode_hz: number;
  kind: BoxKind;
  /** Passive radiators entered with ports: a box has one or the other, so they aren't taken off. */
  prLeftOut: boolean;
  /** The walls (no air inside) or the parts (more than the air) take up the whole box; null when it holds some. */
  problem: BoxProblem | null;
  /** The car wedge's slope (degrees from the bottom); null for other shapes. */
  slope_deg: number | null;
}

const AIR_C = airOf(DEFAULT_STATE).c;

/** The form's box worked out with the app's own volume code. */
export function boxVolume(f: BoxForm): BoxVolume {
  const s = stateOf(f);
  const r = volumeFor(s, s.designs[0]);
  const shape = shapeOf(s.volume);
  const parts_l = r.deductions.reduce((a, d) => a + d.litres, 0);
  const problem: BoxProblem | null = !(r.gross_l > 0) ? "walls" : !(r.net_l > 0) ? "parts" : null;
  return {
    r,
    parts_l,
    longest_cm: insideLongest_cm(shape, s.volume.wall_mm),
    mode_hz: lowestMode_hz(shape, s.volume.wall_mm, AIR_C),
    kind: kindOf(f),
    prLeftOut: kindOf(f) === "vented" && whole(f.np, 0) > 0 && nonNeg(f.pd) > 0,
    problem,
    slope_deg: f.shape === "wedge" ? wedgeGeometry(wedgeDimsOf(s.volume)).theta : null,
  };
}

/** How "Box size for a net volume" sizes the box: the app's Ratio (or, for a car wedge, Solve for) choices. */
export type Sizing = "keep" | "golden" | "length" | "width" | "height" | "topDepth" | "bottomDepth" | "lip";

/** The Ratio / Solve for choices per shape, the default first (as the app has them, a box starting from the golden ratio). */
export function sizingOptions(shape: ShapeKind): { value: Sizing; text: string }[] {
  switch (shape) {
    case "box":
      return [
        { value: "golden", text: "Golden ratio" },
        { value: "keep", text: "Keep shape" },
      ];
    case "cylinder":
      return [
        { value: "length", text: "Keep diameter" },
        { value: "keep", text: "Keep shape" },
      ];
    case "wedge":
      return [
        { value: "keep", text: "Scale all" },
        { value: "width", text: "Width" },
        { value: "height", text: "Height" },
        { value: "topDepth", text: "Top depth" },
        { value: "bottomDepth", text: "Bottom depth" },
        { value: "lip", text: "Lip height" },
      ];
    default:
      return [{ value: "keep", text: "Keep shape" }];
  }
}

export const ALL_SIZINGS: readonly Sizing[] = ["keep", "golden", "length", "width", "height", "topDepth", "bottomDepth", "lip"];

/** The sizing in force for a shape: the one asked for if the shape offers it, else its default. */
export const sizingFor = (shape: ShapeKind, asked: string) => {
  const o = sizingOptions(shape);
  return (o.find((x) => x.value === asked) ?? o[0]!).value;
};

export type SizeResult =
  /** The box that gives the target (sizes to 0.1 cm, as the app rounds them). */
  | { ok: true; f: BoxForm; net_l: number }
  /** A car wedge with the other sizes locked can't reach it: the nearest it gets. */
  | { ok: false; f: BoxForm; net_l: number };

/**
 * The outside sizes that give `target_l` net, as the app's Size for a volume finds them. Null
 * when no size reaches it (the parts alone are more).
 */
export function sizeFor(f: BoxForm, target_l: number, sizing: Sizing): SizeResult | null {
  if (!(target_l > 0)) return null;
  const s = stateOf(f);
  const d = s.designs[0];
  const how = sizingFor(f.shape, sizing);
  if (f.shape === "wedge" && how !== "keep") {
    const r = solveWedgeFor(s, d, how as Exclude<Sizing, "keep" | "golden" | "length">, target_l);
    if (!r) return null;
    const next = formFromVolume(f, wedgeToVolume(s.volume, r.ok ? r.dims : r.nearest));
    return { ok: r.ok, f: next, net_l: boxVolume(next).r.net_l };
  }
  const v = dimensionsFor(s, d, target_l, how === "golden" || how === "length" ? how : "keep");
  if (!v) return null;
  const next = formFromVolume(f, v);
  return { ok: true, f: next, net_l: boxVolume(next).r.net_l };
}

/** The form for an app state's volume calculator and the design it feeds (its ports or PRs), for checks and examples. */
export function formFromState(s: AppState): BoxForm {
  const v = s.volume;
  const d = s.designs.find((x) => x.id === v.link);
  const f: BoxForm = {
    ...BOX_DEFAULTS,
    wall: v.wall_mm,
    cap: v.capWall_mm,
    sw: v.slopeWall_mm,
    n: s.drivers * (s.isobaric ? 2 : 1),
    dd: v.driverDisp_l,
    np: d?.kind === "pr" ? prTotal(d) : 0,
    pd: v.prDisp_l,
    pc: d?.kind === "vented" ? d.count : 0,
    pt: d?.kind === "vented" ? d.shape : "round",
    pdia: d?.kind === "vented" ? d.diameter_cm : BOX_DEFAULTS.pdia,
    pw: d?.kind === "vented" ? d.slotWidth_cm : BOX_DEFAULTS.pw,
    ph: d?.kind === "vented" ? d.slotHeight_cm : BOX_DEFAULTS.ph,
    pl: d?.kind === "vented" ? d.length_cm : BOX_DEFAULTS.pl,
    pwt: v.portWall_mm,
    br: v.bracing_pct,
    o: v.other_l,
  };
  return formFromVolume(f, v);
}
