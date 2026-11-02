import {
  netVolume,
  simulate,
  solveTs,
  type DriverInput,
  type EnclosureInput,
  type Shape,
  type SimulationResult,
  type SolveResult,
  type VolumeResult,
} from "@sbg/engine";
import type { AppState, DesignKey } from "./state.ts";

export const COLORS: Record<DesignKey, string> = { sealed: "#3b82f6", vented: "#f97316", pr: "#22c55e" };
export const LABELS: Record<DesignKey, string> = { sealed: "Sealed", vented: "Ported", pr: "PR" };

export interface Design {
  key: DesignKey;
  label: string;
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

/** Net volume of the calculator's box, with deductions appropriate for the design it feeds. */
export function volumeFor(s: AppState, target: DesignKey | "none"): VolumeResult {
  const v = s.volume;
  return netVolume({
    shape: shapeOf(v),
    wall_mm: v.wall_mm,
    drivers: { count: s.drivers, displacement_l: v.driverDisp_l },
    passiveRadiators: target === "pr" ? { count: s.pr.count, displacement_l: v.prDisp_l } : undefined,
    ports:
      target === "vented"
        ? { count: s.vented.count, innerDiameter_cm: s.vented.diameter_cm, length_cm: s.vented.length_cm, wall_mm: v.portWall_mm }
        : undefined,
    bracing_pct: v.bracing_pct,
    other_l: v.other_l,
    fill_pct: v.fill_pct,
  });
}

/** Box volume a design should use: the calculator's result if it is linked, else its own field. */
export function vbOf(s: AppState, key: DesignKey): number {
  if (s.volume.link === key) return volumeFor(s, key).effective_l;
  return key === "sealed" ? s.sealed.vb_l : key === "vented" ? s.vented.vb_l : s.pr.vb_l;
}

export function solveDriver(s: AppState): SolveResult {
  return solveTs(s.ts);
}

export function runDesigns(s: AppState, solved: SolveResult): Design[] {
  if (solved.missing.length > 0) return [];
  const t = solved.values;
  const driver: DriverInput = {
    fs: t.fs!,
    qms: t.qms!,
    qes: t.qes!,
    vas_l: t.vas_l!,
    re: t.re!,
    sd_cm2: t.sd_cm2!,
    le_mh: s.le_mh,
    xmax_mm: s.xmax_mm,
    pe_w: s.pe_w,
  };
  const opts = {
    power: s.power,
    drivers: s.drivers,
    fMin: 10,
    fMax: 500,
    points: 300,
    highPass: s.highPass.on ? { type: s.highPass.type, order: s.highPass.order, freq: s.highPass.freq } : null,
  };
  const boxes: [DesignKey, boolean, (vb: number) => EnclosureInput][] = [
    ["sealed", s.sealed.on, (vb) => ({ kind: "sealed", vb_l: vb })],
    [
      "vented",
      s.vented.on,
      (vb) => ({
        kind: "vented",
        vb_l: vb,
        port: { shape: "round", diameter_cm: s.vented.diameter_cm, length_cm: s.vented.length_cm },
        portCount: s.vented.count,
      }),
    ],
    [
      "pr",
      s.pr.on,
      (vb) => ({ kind: "passive-radiator", vb_l: vb, pr: s.pr.params, prCount: s.pr.count, addedMass_g: s.pr.addedMass_g }),
    ],
  ];
  const out: Design[] = [];
  for (const [key, on, box] of boxes) {
    if (!on) continue;
    const vb = vbOf(s, key);
    if (!(vb > 0)) continue;
    try {
      out.push({ key, label: LABELS[key], vb_l: vb, result: simulate(driver, box(vb), opts) });
    } catch {
      // Invalid input mid-edit: skip this design until the numbers make sense again.
    }
  }
  return out;
}
