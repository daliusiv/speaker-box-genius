/**
 * The subwoofer box calculator's maths (no page): three boxes for a driver, compact, balanced
 * and deep, sealed or ported, each simulated with the app's own code at the power given. The
 * picks follow fixed rules (see pickRules below); the alignments are the app's presets, so a
 * pick equals what the preset chips give for the same driver.
 */
import { sealedVolumeForAlignment } from "@sbg/engine";
import { newDesign, type AppState, type DesignState, type VentedDesign } from "../state.ts";
import { alignmentDriver, limitsOf, PORT_LIMIT, runDesigns, solveDriver, type Design } from "../sim.ts";
import { bestVentedPort, FLAT_PEAK_DB, flatTuning, moreVentedFor, SEALED_MAX_VAS, sealedPreset, sealedQtc, ventedAlignmentFor } from "../presets.ts";
import { portSpeedFor, type AssistantPort } from "../ports.ts";
import { relRefOf, valueAt } from "../chartProps.ts";
import { driverQuery } from "./driverInput.ts";
import type { QuerySpec } from "./query.ts";

export const L_PER_FT3 = 28.3168;
const CM_PER_IN = 2.54;

/** The sizes the size chips offer (inches). */
export const SIZES = [8, 10, 12, 15, 18] as const;

/** The inputs kept in the page address: units, the size chip ("all" = none), box type, and the driver (driverInput.ts). */
export const SUBWOOFER_QUERY: QuerySpec = {
  u: { id: "sb-imperial", kind: "check", on: "in" },
  sz: { id: "sb-size", kind: "choice", choices: ["all", ...SIZES.map(String)] },
  t: { id: "sb-type", kind: "choice", choices: ["sealed", "ported"] },
  ...driverQuery("sb"),
};

export type BoxKind = "sealed" | "ported";
export type PickKey = "compact" | "balanced" | "deep";
export const PICK_NAMES: Record<PickKey, string> = { compact: "Compact", balanced: "Balanced", deep: "Deep" };
export const PICK_KEYS: PickKey[] = ["compact", "balanced", "deep"];

/** The deep ported box is the balanced one's size times this. */
export const DEEP_SIZE = 1.5;
/** The deep box is tuned as low as the response stays within this peak (dB above its passband). */
export const DEEP_PEAK_DB = FLAT_PEAK_DB;
/** What the deep ported box's tuning is called (it isn't one of the families). */
export const TUNED_LOW = "tuned low";
/** Chuffing line shown on the cards (m/s). */
export const PORT_AIR_LINE = PORT_LIMIT;

const r1 = (v: number) => Math.round(v * 10) / 10;

/** A pick before it's simulated: the box, or why there isn't one. */
export type Plan = { key: PickKey; box: { vb_l: number; fb?: number; tuning: string } } | { key: PickKey; why: string };

/** A pick with its simulated numbers. */
export interface Pick {
  key: PickKey;
  name: string;
  /** Why this pick can't be made (the other fields are then missing). */
  why?: string;
  design?: DesignState;
  /** Curve colour, as the chart draws it. */
  color?: string;
  vb_l?: number;
  /** "Qtc 0.707", "24.4 Hz (QB3)". */
  tuning?: string;
  fb?: number;
  f3?: number | null;
  /** SPL at 30 Hz at the power set (dB at 1 m). */
  spl30?: number;
  /** Peak cone excursion (mm) and the driver's Xmax (0 when not known). */
  x?: number | null;
  xmax?: number;
  /** Peak port air speed (m/s, as the app shows it: a flared port at its mouths). */
  air?: number | null;
  port?: AssistantPort;
}

/** What the picks need from the driver: the alignment values, or null while Fs, Qes, Qms or Vas is missing. */
export function alignOf(s: AppState) {
  return alignmentDriver(solveDriver(s), s);
}

/** The sealed picks' boxes: Qtc 0.9, the app's sealed preset (0.707), and Qtc 0.577 (both capped at 2 × Vas). */
export function sealedPlans(a: NonNullable<ReturnType<typeof alignOf>>, drivers = 1): Plan[] {
  const cap = SEALED_MAX_VAS * a.vas_l * drivers;
  const compact = sealedVolumeForAlignment(a, 0.9, drivers);
  const balanced = sealedPreset(a, drivers);
  const deepVb = sealedVolumeForAlignment(a, 0.577, drivers);
  const deep = (): Plan => {
    if (deepVb === null) return { key: "deep", why: "Qts is above 0.577, so no sealed box gets down to a Qtc of 0.577." };
    const vb = Math.min(deepVb, cap);
    if (balanced && vb <= balanced.vb_l * 1.005) return { key: "deep", why: `The balanced box is already as big as a sealed box goes here (${SEALED_MAX_VAS} × Vas).` };
    return { key: "deep", box: { vb_l: vb, tuning: deepVb <= cap ? "Qtc 0.577" : `Qtc ${sealedQtc(a, vb, drivers).toFixed(2)}` } };
  };
  return [
    compact === null || compact > cap
      ? { key: "compact", why: compact === null ? "Qts is above 0.9, so no sealed box gives a Qtc of 0.9." : `A Qtc of 0.9 needs more than ${SEALED_MAX_VAS} × Vas here.` }
      : { key: "compact", box: { vb_l: compact, tuning: "Qtc 0.9" } },
    balanced ? { key: "balanced", box: { vb_l: balanced.vb_l, tuning: balanced.name } } : { key: "balanced", why: "Qts is too high for a sealed box of 0.707." },
    deep(),
  ];
}

/** The response's highest point above its passband reference (dB). */
export function peakDb(d: Design): number {
  const ref = relRefOf(d.result);
  let m = -Infinity;
  for (const v of d.result.spl) if (Number.isFinite(v) && v - ref > m) m = v - ref;
  return m;
}

/** The deep ported box's tuning: the flattest low tuning (presets.ts flatTuning) of the bigger box, searched from the balanced box's tuning down. */
export const deepTuning = (s: AppState, vb_l: number, from: number): number | null => flatTuning(s, vb_l, from);

/** The ported picks' boxes: BB4 (SBB4 when WinISD's is flat), QB3 (as WinISD sizes them), and 1.5 × QB3's box tuned as low as stays flat. */
export function ventedPlans(s: AppState, a: NonNullable<ReturnType<typeof alignOf>>, drivers = 1): Plan[] {
  const bb4 = moreVentedFor(a, drivers).find((x) => x.name === "BB4" || x.name === "SBB4");
  const qb3 = ventedAlignmentFor(a, drivers);
  const deepFb = qb3 ? deepTuning(s, r1(qb3.vb_l * DEEP_SIZE), qb3.fb) : null;
  const tooHigh = "Qts is too high for QB3, so there is no flat ported box for this driver.";
  return [
    bb4 ? { key: "compact", box: { vb_l: bb4.vb_l, fb: bb4.fb, tuning: bb4.name } } : { key: "compact", why: "No boom-box (BB4) alignment suits this driver." },
    qb3 ? { key: "balanced", box: { vb_l: qb3.vb_l, fb: qb3.fb, tuning: "QB3" } } : { key: "balanced", why: tooHigh },
    qb3 && deepFb !== null ? { key: "deep", box: { vb_l: qb3.vb_l * DEEP_SIZE, fb: deepFb, tuning: TUNED_LOW } } : { key: "deep", why: qb3 ? "No tuning gives a flat response in the bigger box." : tooHigh },
  ];
}

const titleOf = (key: PickKey) => PICK_NAMES[key];

/** A pick's design: sealed, or ported with the port the app's "Size all boxes" picks (bestVentedPort). */
function designFor(s: AppState, kind: BoxKind, plan: Extract<Plan, { box: unknown }>, existing: DesignState[]): { design: DesignState; port?: AssistantPort } | string {
  const name = titleOf(plan.key);
  if (kind === "sealed") return { design: { ...newDesign("sealed", existing), name, vb_l: r1(plan.box.vb_l), preset: plan.box.tuning } };
  const base = newDesign("vented", existing) as VentedDesign;
  const vb = r1(plan.box.vb_l);
  const fb = r1(plan.box.fb!);
  const best = bestVentedPort(s, base, vb, fb);
  if (!best) return "No simple port fits this box and tuning: it needs a bent port or a different box.";
  const f = best.fields as Partial<VentedDesign>;
  const design: VentedDesign = { ...base, ...f, name, vb_l: vb, targetFb: fb, preset: plan.box.tuning === TUNED_LOW ? undefined : plan.box.tuning } as VentedDesign;
  if (design.preset === undefined) delete design.preset;
  const port: AssistantPort =
    design.shape === "slot"
      ? { kind: "slot", slotWidth_cm: design.slotWidth_cm, slotHeight_cm: design.slotHeight_cm, length_cm: design.length_cm, count: design.count }
      : { kind: design.flare_cm > 0 ? "flared" : "straight", diameter_cm: design.diameter_cm, flare_cm: design.flare_cm, length_cm: design.length_cm, count: design.count };
  return { design, port };
}

/**
 * The three picks for the driver in `s` (at its power): the plans, the designs, and each design's
 * numbers from the app's simulation. `state` is `s` with the picks as its designs (for the chart
 * and the "Open in the simulator" link), in the order of PICK_KEYS, those that could be made.
 */
export function subwooferPicks(s: AppState, kind: BoxKind, drivers = s.drivers): { picks: Pick[]; state: AppState } {
  const a = alignOf(s);
  const named = (key: PickKey, why: string): Pick => ({ key, name: titleOf(key), why });
  if (!a) return { picks: PICK_KEYS.map((k) => named(k, "Enter Fs, Qes, Qms and Vas to see the boxes.")), state: { ...s, designs: [] } };
  const plans = kind === "sealed" ? sealedPlans(a, drivers) : ventedPlans(s, a, drivers);
  // Balanced goes first in the designs, so it takes the box type's main colour (the app colours
  // designs by position) and opens first in the simulator; the cards keep pick order.
  const made_: { p: (typeof plans)[number]; d: ReturnType<typeof designFor> | string }[] = new Array(plans.length);
  const madeList: DesignState[] = [];
  const order = plans.map((_, i) => i).sort((i, j) => Number(plans[j]!.key === "balanced") - Number(plans[i]!.key === "balanced"));
  for (const i of order) {
    const p = plans[i]!;
    const d = "box" in p ? designFor(s, kind, p, madeList) : p.why;
    if (typeof d !== "string") madeList.push(d.design);
    made_[i] = { p, d };
  }
  const made = made_;
  const designs: DesignState[] = madeList;
  const state: AppState = { ...s, designs };
  const solved = solveDriver(state);
  const runs = designs.length > 0 ? runDesigns(state, solved) : [];
  const picks = made.map(({ p, d }): Pick => {
    if (typeof d === "string") return named(p.key, d);
    const run = runs.find((r) => r.design.id === d.design.id);
    if (!run) return named(p.key, "This box couldn't be simulated with this driver.");
    const lim = limitsOf(run.result, s.xmax_mm, false, PORT_LIMIT);
    return {
      key: p.key,
      name: titleOf(p.key),
      design: d.design,
      color: run.color,
      vb_l: d.design.vb_l,
      tuning: "box" in p ? (kind === "sealed" ? p.box.tuning : `${r1(p.box.fb!).toFixed(1)} Hz (${p.box.tuning})`) : "",
      ...(kind === "ported" ? { fb: (d.design as VentedDesign).targetFb } : {}),
      f3: run.result.summary.f3,
      spl30: valueAt(run.result.freq, run.result.spl, 30),
      x: lim.x,
      xmax: s.xmax_mm,
      // A flared port's air as the port length calculator and the app read it (portSpeedFor).
      air: airOf_(d.design, lim.vp),
      ...(d.port ? { port: d.port } : {}),
    };
  });
  return { picks, state };
}

/** Peak port air speed (m/s): a flared port's from its narrowest part, as on the port length page. */
function airOf_(d: DesignState, vp: number | null): number | null {
  if (vp === null || d.kind !== "vented") return vp;
  const v = d as VentedDesign;
  return v.shape === "round" && v.flare_cm > 0 ? portSpeedFor({ kind: "flared", diameter_cm: v.diameter_cm, flare_cm: v.flare_cm, length_cm: v.length_cm, count: v.count }, vp) : vp;
}

const num = (v: number) => String(Number(v.toFixed(1)));

/** A length in the user's unit with the other in brackets: "6 cm (2.4″)" or "2.4″ (6 cm)". */
export function lengthText(cm: number, imperial: boolean): string {
  const inch = `${(cm / CM_PER_IN).toFixed(1)}″`;
  return imperial ? `${inch} (${num(cm)} cm)` : `${num(cm)} cm (${inch})`;
}

/** A volume the same way: "58.1 L (2.05 ft³)". */
export function volumeText(l: number, imperial: boolean): string {
  const ft = `${(l / L_PER_FT3).toFixed(2)} ft³`;
  return imperial ? `${ft} (${l.toFixed(1)} L)` : `${l.toFixed(1)} L (${ft})`;
}

/** A port, for a card: "6 cm (2.4″) flared, 22.4 cm long" (two ports: "2 × 10 cm … each"). */
export function portText(p: AssistantPort, imperial: boolean): string {
  const long = imperial ? `${(p.length_cm / CM_PER_IN).toFixed(1)}″ long` : `${num(p.length_cm)} cm long`;
  if (p.kind === "slot") {
    const size = `${num(p.slotWidth_cm)} × ${num(p.slotHeight_cm)} cm slot`;
    return `${p.count > 1 ? `${p.count} × ` : ""}${size}, ${long}`;
  }
  const many = p.count > 1 ? `${p.count} × ` : "";
  return `${many}${lengthText(p.diameter_cm, imperial)}${p.kind === "flared" ? " flared" : ""}, ${long}${p.count > 1 ? " each" : ""}`;
}
