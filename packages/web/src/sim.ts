import {
  STANDARD_AIR,
  WINISD_AIR,
  type Air,
  netVolume,
  roomGainDb,
  simulate,
  transitionFrequency,
  solveTs,
  type DriverInput,
  type EqStage,
  type EnclosureInput,
  type PortInput,
  type Shape,
  type SimulationResult,
  type SolveResult,
  type VolumeResult,
} from "@sbg/engine";
import type { AppState, DesignState, PortFields, PrDesign, PrGroupState, Settings } from "./state.ts";

/** One colour per design slot; distinguishable in light and dark mode. */
export const PALETTE = ["#3b82f6", "#f97316", "#22c55e", "#a855f7", "#e11d48", "#0d9488", "#ca8a04", "#64748b"];

export const KIND_LABEL = { sealed: "Sealed", vented: "Ported", pr: "Passive radiators", bandpass: "Bandpass" } as const;

export function colorOf(s: AppState, id: string): string {
  const i = s.designs.findIndex((d) => d.id === id);
  return PALETTE[(i < 0 ? 0 : i) % PALETTE.length]!;
}

export interface Design {
  design: DesignState;
  color: string;
  vb_l: number;
  result: SimulationResult;
}

export function shapeOf(v: AppState["volume"]): Shape {
  switch (v.shape) {
    case "box":
      return { kind: "box", width_cm: v.width_cm, height_cm: v.height_cm, depth_cm: v.depth_cm };
    case "cylinder":
      return { kind: "cylinder", diameter_cm: v.diameter_cm, length_cm: v.height_cm };
    case "sphere":
      return { kind: "sphere", diameter_cm: v.diameter_cm };
    case "frustum":
      return {
        kind: "frustum",
        bottomWidth_cm: v.width_cm,
        bottomDepth_cm: v.depth_cm,
        topWidth_cm: v.topWidth_cm,
        topDepth_cm: v.topDepth_cm,
        height_cm: v.height_cm,
      };
  }
}

export function portOf(v: Omit<PortFields, "count" | "targetFb">, length_cm = v.length_cm): PortInput {
  return v.shape === "slot"
    ? { shape: "slot", width_cm: v.slotWidth_cm, height_cm: v.slotHeight_cm, length_cm }
    : { shape: "round", diameter_cm: v.diameter_cm, length_cm };
}

/** Net volume of the calculator's box, with deductions for the design it feeds (if any). */
export function volumeFor(s: AppState, d: DesignState | undefined): VolumeResult {
  const v = s.volume;
  return netVolume({
    shape: shapeOf(v),
    wall_mm: v.wall_mm,
    drivers: { count: s.drivers * (s.isobaric ? 2 : 1), displacement_l: v.driverDisp_l },
    passiveRadiators:
      d?.kind === "pr"
        ? { count: prTotal(d), displacement_l: v.prDisp_l }
        : d?.kind === "bandpass" && d.order !== "4" && d.rearOpening === "pr"
          ? { count: d.rearPrs.reduce((n, g) => n + g.count, 0), displacement_l: v.prDisp_l }
          : undefined,
    ports:
      d?.kind === "bandpass" && d.order !== "4" && d.rearOpening === "port"
        ? {
            count: d.rear.count,
            length_cm: d.rear.length_cm,
            wall_mm: v.portWall_mm,
            innerDiameter_cm: d.rear.diameter_cm,
            slot: d.rear.shape === "slot" ? { width_cm: d.rear.slotWidth_cm, height_cm: d.rear.slotHeight_cm } : undefined,
          }
        : d?.kind === "vented"
        ? {
            count: d.count,
            length_cm: d.length_cm,
            wall_mm: v.portWall_mm,
            innerDiameter_cm: d.diameter_cm,
            slot: d.shape === "slot" ? { width_cm: d.slotWidth_cm, height_cm: d.slotHeight_cm } : undefined,
          }
        : undefined,
    bracing_pct: v.bracing_pct,
    other_l: v.other_l,
    fill_pct: v.fill_pct,
  });
}

export const linkedDesign = (s: AppState) => s.designs.find((d) => d.id === s.volume.link);

/** Box volume a design should use: the calculator's result if it is linked, else its own field. */
export function vbOf(s: AppState, d: DesignState): number {
  return s.volume.link === d.id ? volumeFor(s, d).effective_l : d.vb_l;
}

export const airOf = (s: AppState): Air => (s.settings.air === "winisd" ? WINISD_AIR : STANDARD_AIR);

/** Chuffing guideline, in whichever convention (peak or RMS) the user chose to display. */
export const PORT_LIMIT = 17;

/**
 * Dual voice coil: factors that turn the entered Re (and Le) and Qes into the values for
 * the coils as wired. Per coil (other coil open) Re1, Bl1, Qes1; both coils driven:
 * parallel → Re1/2, Bl1, Qes1/2; series → 2·Re1, 2·Bl1, Qes1/2. Fs, Qms, Vas don't change.
 */
export function dvcFactors(s: AppState): { re: number; qes: number } {
  if (!s.dvc.on) return { re: 1, qes: 1 };
  const reOne = { one: 1, parallel: 2, series: 0.5 }[s.dvc.entered];
  const qesOne = s.dvc.entered === "one" ? 1 : 2;
  return { re: reOne * (s.dvc.wired === "parallel" ? 0.5 : 2), qes: qesOne * 0.5 };
}

/** Room / cabin gain settings in engine form, or null when off. */
export function roomGainOf(s: AppState) {
  const g = s.roomGain;
  if (g.mode === "off" || !(g.length_cm > 0)) return null;
  return { f0: transitionFrequency(g.length_cm / 100, airOf(s).c), slopeDbPerOct: g.slope, maxDb: g.max_db };
}

export function solveDriver(s: AppState): SolveResult {
  return solveTs(s.ts, 0.03, airOf(s));
}

/** The solved driver in the form the alignment helpers need, or null if incomplete. */
export function alignmentDriver(solved: SolveResult, s: AppState) {
  const v = solved.values;
  if (solved.missing.length > 0) return null;
  // An isobaric pair has the same Fs and Qs with half the Vas.
  return { fs: v.fs!, qms: v.qms!, qes: v.qes! * dvcFactors(s).qes, vas_l: v.vas_l! / (s.isobaric ? 2 : 1) };
}

function enclosureOf(d: DesignState, vb: number, losses: Settings["losses"]): EnclosureInput {
  const { ql, qa, qp } = losses;
  switch (d.kind) {
    case "sealed":
      return { kind: "sealed", vb_l: vb, ql, qa };
    case "vented":
      return { kind: "vented", vb_l: vb, port: portOf(d), portCount: d.count, ql, qa, qp };
    case "pr":
      return {
        kind: "passive-radiator",
        vb_l: vb,
        pr: d.params,
        prCount: d.count,
        addedMass_g: d.addedMass_g,
        extraPrs: d.extra.map((g) => ({ pr: g.params, count: g.count, addedMass_g: g.addedMass_g })),
        ql,
        qa,
      };
    case "bandpass":
      return {
        kind: "bandpass",
        rear:
          d.order === "4"
            ? { vb_l: vb, ql, qa }
            : d.rearOpening === "pr"
              ? { vb_l: vb, prs: groupsOf(d.rearPrs), ql, qa }
              : { vb_l: vb, port: portOf(d.rear), portCount: d.rear.count, ql, qa, qp },
        front:
          d.frontOpening === "pr"
            ? { vb_l: d.frontVb_l, prs: groupsOf(d.frontPrs), ql, qa }
            : { vb_l: d.frontVb_l, port: portOf(d.front), portCount: d.front.count, ql, qa, qp },
        rearPortTo: d.order === "6s" ? "front" : "outside",
      };
  }
}

export function runDesigns(s: AppState, solved: SolveResult): Design[] {
  if (solved.missing.length > 0) return [];
  const t = solved.values;
  const k = dvcFactors(s);
  const driver: DriverInput = {
    fs: t.fs!,
    qms: t.qms!,
    qes: t.qes! * k.qes,
    vas_l: t.vas_l!,
    re: t.re! * k.re,
    sd_cm2: t.sd_cm2!,
    le_mh: s.settings.inductance ? s.le_mh * k.re : 0,
    // L2 and R2 are coil impedances too, so they scale with DVC wiring like Re and Le.
    ...(s.settings.inductance && s.l2_mh > 0 && s.r2_ohm > 0 ? { l2_mh: s.l2_mh * k.re, r2_ohm: s.r2_ohm * k.re } : {}),
    xmax_mm: s.xmax_mm,
    pe_w: s.pe_w,
  };
  const opts = {
    rg: s.settings.rg,
    power: s.power,
    drivers: s.drivers,
    wiring: s.wiring,
    isobaric: s.isobaric ? { coils: s.isoCoils } : null,
    fMin: 10,
    fMax: 500,
    points: 300,
    highPass: s.highPass.on ? { type: s.highPass.type, order: s.highPass.order, freq: s.highPass.freq } : null,
    air: airOf(s),
    // The limit is in the displayed convention; the engine works in peak.
    portVelocityLimit: s.settings.velocity === "rms" ? PORT_LIMIT * Math.SQRT2 : PORT_LIMIT,
  };
  const out: Design[] = [];
  for (const d of s.designs) {
    if (!d.on) continue;
    const vb = vbOf(s, d);
    if (!(vb > 0)) continue;
    const eq = s.eq
      .filter((e) => e.on && (e.target === "all" || e.target === d.id))
      .map(({ id: _id, on: _on, target: _t, ...stage }) => stage as EqStage);
    try {
      const result = simulate(driver, enclosureOf(d, vb, s.settings.losses), { ...opts, eq });
      if (s.settings.velocity === "rms") {
        if (result.portVelocity) result.portVelocity = result.portVelocity.map((v) => v / Math.SQRT2);
        if (result.rearPortVelocity) result.rearPortVelocity = result.rearPortVelocity.map((v) => v / Math.SQRT2);
      }
      const room = roomGainOf(s);
      if (room) {
        const lift = result.freq.map((f) => roomGainDb(f, room));
        result.spl = result.spl.map((v, i) => v + lift[i]!);
        result.maxSpl = result.maxSpl.map((v, i) => v + lift[i]!);
      }
      out.push({ design: d, color: colorOf(s, d.id), vb_l: vb, result });
    } catch {
      // Invalid input mid-edit: skip this design until the numbers make sense again.
    }
  }
  return out;
}

/** Number of passive radiators in a PR design, all groups together. */
export const prTotal = (d: PrDesign) => d.count + d.extra.reduce((n, g) => n + g.count, 0);

const groupsOf = (gs: PrGroupState[]) => gs.map((g) => ({ pr: g.params, count: g.count, addedMass_g: g.addedMass_g }));

/** What each entry of a result's prGroups is, in the same order: for chart labels and CSV columns. */
export function prGroupLabels(d: DesignState): string[] {
  if (d.kind === "pr") return [d.prName, ...d.extra.map((g) => g.prName)];
  if (d.kind !== "bandpass") return [];
  const out: string[] = [];
  const add = (where: string, gs: PrGroupState[]) =>
    gs.forEach((g) => out.push(gs.length > 1 ? `${where} PRs, ${g.prName}` : `${where} PRs`));
  if (d.frontOpening === "pr") add("front", d.frontPrs);
  if (d.order !== "4" && d.rearOpening === "pr") add("rear", d.rearPrs);
  return out;
}

/** Every PR Xmax used by a design, for redlines. */
export function prXmaxes(d: DesignState): number[] {
  if (d.kind === "pr") return [d.params.xmax_mm, ...d.extra.map((g) => g.params.xmax_mm)];
  if (d.kind !== "bandpass") return [];
  return [
    ...(d.frontOpening === "pr" ? d.frontPrs : []),
    ...(d.order !== "4" && d.rearOpening === "pr" ? d.rearPrs : []),
  ].map((g) => g.params.xmax_mm);
}

/** PR groups of a design in engine form (first group + extras). */
export const prGroupsOf = (d: PrDesign) => [
  { pr: d.params, count: d.count, addedMass_g: d.addedMass_g },
  ...d.extra.map((g) => ({ pr: g.params, count: g.count, addedMass_g: g.addedMass_g })),
];

/**
 * Worst passive radiator excursion of a design from `fMin` up: the group that comes
 * closest to (or furthest past) its own Xmax, so one figure can be shown and flagged.
 */
export function prPeak(r: SimulationResult, fMin: number): { mm: number; xmax: number | null; over: boolean } | null {
  if (!r.prGroups) return null;
  let best: { mm: number; xmax: number | null; ratio: number } | null = null;
  for (const g of r.prGroups) {
    let m = 0;
    for (let i = 0; i < g.excursionMm.length; i++) if (r.freq[i]! >= fMin && g.excursionMm[i]! > m) m = g.excursionMm[i]!;
    const ratio = g.xmax_mm ? m / g.xmax_mm : 0;
    if (!best || ratio > best.ratio || (ratio === best.ratio && m > best.mm)) best = { mm: m, xmax: g.xmax_mm, ratio };
  }
  return best && { mm: best.mm, xmax: best.xmax, over: best.xmax !== null && best.mm > best.xmax };
}
