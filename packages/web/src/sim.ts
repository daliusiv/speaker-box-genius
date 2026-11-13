import {
  STANDARD_AIR,
  airAt,
  WINISD_AIR,
  baffleStepDb,
  lineNetwork,
  foldLine,
  type LineInput,
  type Air,
  type Baffle,
  netVolume,
  roomGainDb,
  simulate,
  transitionFrequency,
  bankResistance,
  voltsPerRootWatt,
  DEFAULT_END_CORRECTION,
  solveTs,
  type DriverInput,
  type EqStage,
  type EnclosureInput,
  type PortInput,
  type Shape,
  type SimulationResult,
  type SolveResult,
  type VolumeResult,
  semiActive,
  transientResponse,
  solveWedge,
  type WedgeDims,
  type WedgeField,
  type WedgeSolve,
} from "@sbg/engine";
import type { AppState, DesignKind, DesignState, LineDesign, PortFields, PrDesign, PrGroupState, Settings } from "./state.ts";
import { compareView } from "./state.ts";
import { qaGain, stuffFactor, stuffable, stuffingEffect } from "./stuffing.ts";

export { KIND_COLORS } from "./palette.ts";
import { KIND_COLORS } from "./palette.ts";

export const KIND_LABEL = { sealed: "Sealed", vented: "Ported", pr: "Passive radiators", bandpass: "Bandpass", line: "Transmission line" } as const;

/** Line style of the comparison driver's curves. */
export const COMPARE_DASH = "7 4";

/** A short name for the comparison driver in labels ("RSS315HF-4" from "Dayton Audio RSS315HF-4"). */
export const compareShort = (name: string, brand: string) => {
  const n = name.trim();
  const rest = brand && n.startsWith(brand) ? n.slice(brand.length).trim() : n;
  // The model number names a driver best ("18 Sound 8NTLS2000" → "8NTLS2000").
  const model = rest.split(/\s+/).find((w) => /\d/.test(w) && /[a-z]/i.test(w));
  const out = model ?? rest;
  return out.length > 18 ? `${out.slice(0, 17)}…` : out || "comparison";
};

export function colorOf(s: AppState, id: string): string {
  const i = s.designs.findIndex((d) => d.id === id);
  if (i < 0) return KIND_COLORS.sealed[0]!;
  const kind = s.designs[i]!.kind;
  const shades = KIND_COLORS[kind];
  const nth = s.designs.slice(0, i).filter((d) => d.kind === kind).length;
  return shades[nth % shades.length]!;
}

export interface Design {
  design: DesignState;
  /** Name for charts and tables ("Ported", or "Ported vs RSS315HF" for the comparison run). */
  label: string;
  /** Line style: dashed for the comparison driver. */
  dash?: string;
  /** The same box with the comparison driver (drawn faint and dashed). */
  compare?: boolean;
  color: string;
  /** Net volume as built (a bandpass's rear chamber). */
  vb_l: number;
  /** The volume it acts as, when stuffing makes that differ from vb_l. */
  acting_l?: number;
  /**
   * With room or cabin gain on: the F3 of the box's response with that gain (the summary's
   * F3 is the box's own, as WinISD gives it, and so are the chart's F3 dots). Null when the
   * gain keeps it from falling 3 dB in range.
   */
  f3Room?: number | null;
  result: SimulationResult;
}

export function shapeOf(v: AppState["volume"]): Shape {
  switch (v.shape) {
    case "box":
      return { kind: "box", width_cm: v.width_cm, height_cm: v.height_cm, depth_cm: v.depth_cm };
    case "cylinder":
      return {
        kind: "cylinder",
        diameter_cm: v.diameter_cm,
        length_cm: v.height_cm,
        ...(typeof v.capWall_mm === "number" && Number.isFinite(v.capWall_mm) && v.capWall_mm >= 0 ? { capWall_mm: v.capWall_mm } : {}),
      };
    case "sphere":
      return { kind: "sphere", diameter_cm: v.diameter_cm };
    case "wedge":
      return {
        kind: "wedge",
        width_cm: v.width_cm,
        height_cm: v.height_cm,
        topDepth_cm: v.topDepth_cm,
        bottomDepth_cm: v.depth_cm,
        ...(v.slopeWall_mm !== null && v.slopeWall_mm > 0 ? { slopeWall_mm: v.slopeWall_mm } : {}),
      };
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

export function portOf(v: Omit<PortFields, "count" | "targetFb"> & { flare_cm?: number }, length_cm = v.length_cm): PortInput {
  return v.shape === "slot"
    ? { shape: "slot", width_cm: v.slotWidth_cm, height_cm: v.slotHeight_cm, length_cm }
    : { shape: "round", diameter_cm: v.diameter_cm, length_cm, ...(v.flare_cm! > 0 ? { flare_cm: v.flare_cm } : {}) };
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
  });
}

export const linkedDesign = (s: AppState) => s.designs.find((d) => d.id === s.volume.link);

/** A design's net volume as built: the calculator's result if it is linked, else its own field. */
export function builtVbOf(s: AppState, d: DesignState): number {
  if (d.kind === "line") return lineVolume(d);
  return s.volume.link === d.id ? volumeFor(s, d).net_l : d.vb_l;
}

/**
 * How many times bigger a design's box acts than it is built: its stuffing's gain, or (no
 * stuffing, Settings → "Qa makes the box bigger") the gain of Settings' Qa, VituixCAD's way.
 * Stuffing wins: its gain is the same physics, so it never counts twice.
 */
export function actingFactor(s: AppState, d: DesignState): number {
  if (d.kind === "line") return 1;
  const f = stuffFactor(d);
  if (f !== 1) return f;
  if (s.settings.qaVolume && (d.kind === "sealed" || d.kind === "vented" || d.kind === "pr")) return qaGain(lossesFor(s, d).qa);
  return 1;
}

/** The volume a design acts as, which the simulation and tuning use: the built volume, scaled by its stuffing (or Qa). */
export function vbOf(s: AppState, d: DesignState): number {
  return builtVbOf(s, d) * actingFactor(s, d);
}

/** What enclosureOf needs from Settings: Qa's volume gain on bandpass chambers, and the port-length vent delay. */
export function enclosureOptsOf(s: AppState): EnclosureOpts {
  return {
    qaVolume: s.settings.qaVolume,
    portLength: s.settings.ventPlacement === "portLength" ? { endCorrection: endCorrectionOf(s), driverSd_cm2: s.ts.sd_cm2 } : undefined,
  };
}

/** Box losses for a design: Settings', with the Qa its stuffing sets. */
export function lossesFor(s: AppState, d: DesignState): Settings["losses"] {
  const qa = stuffable(d.kind) ? stuffingEffect(d.stuffing, d.kind).qa : null;
  return qa === null ? s.settings.losses : { ...s.settings.losses, qa };
}

/** Hornresp's air: c = 344 m/s, ρ = 1.205 kg/m³. */
export const HORNRESP_AIR: Air = { rho: 1.205, c: 344 };
export const airOf = (s: AppState): Air =>
  s.settings.air === "winisd"
    ? WINISD_AIR
    : s.settings.air === "hornresp"
      ? HORNRESP_AIR
      : s.settings.air === "custom"
        ? airAt(s.settings.airConditions)
        : STANDARD_AIR;

/** Chuffing guideline, in whichever convention (peak or RMS) the user chose to display: the default of the setting. */
export const PORT_LIMIT = 17;
/** The chuffing line in use (Settings → Ports), in the displayed convention. */
export const portLimitOf = (s: Pick<AppState, "settings">): number => (s.settings.portLimit_ms > 0 ? s.settings.portLimit_ms : PORT_LIMIT);

/** Air distortion limit (HD2, %): the default of the setting. */
export const AIR_LIMIT = 10;
/** The air distortion limit in use (Settings → Limits), % HD2. */
export const airLimitOf = (s: Pick<AppState, "settings">): number => (s.settings.airLimit_pct > 0 ? s.settings.airLimit_pct : AIR_LIMIT);
/** Polytropic exponent of the box air for each fill (1.4 adiabatic, empty; heavy fill tends towards 1.0, isothermal). */
export const AIR_FILL_N: Record<AppState["settings"]["airFill"], number> = { empty: 1.4, lined: 1.3, filled: 1.2, packed: 1.1 };
/** Above this compression (ΔV/Vb) the air distortion estimate loosens; above twice it, it's outside the model. */
export const AIR_COMPRESSION_CAUTION = 0.1;

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
  if (g.mode === "curve") return g.curve && g.curve.f.length >= 2 ? { curve: { f: g.curve.f, v: g.curve.v } } : null;
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
  // No Ql: the textbook presets are the lossless alignments. The WinISD-style ones (the default)
  // come from WinISD's own curves, which need Re (as wired) for its 0.1 Ω amplifier resistance.
  const dvc = dvcFactors(s);
  return {
    fs: v.fs!,
    qms: v.qms!,
    qes: v.qes! * dvc.qes,
    vas_l: v.vas_l! / (s.isobaric ? 2 : 1),
    ...(v.re && v.re > 0 ? { re: v.re * dvc.re } : {}),
    style: s.settings.alignments,
  };
}

/** The line's pieces for the engine: each section runs from the previous end area to its own. */
export function lineSegmentsOf(d: LineDesign): LineInput["segments"] {
  let start = d.closedArea_cm2;
  return d.sections.map((x) => {
    const seg = { length_cm: x.length_cm, startArea_cm2: start, endArea_cm2: x.endArea_cm2, taper: x.taper, fill_kgm3: x.fill_kgm3 };
    start = x.endArea_cm2;
    return seg;
  });
}

export const lineLength = (d: LineDesign) => d.sections.reduce((a, x) => a + x.length_cm, 0);

/** Folded layout of a line design (lengths in mm). */
export function lineFoldOf(d: LineDesign, wall_mm: number, driverCutout?: number) {
  return foldLine({
    segments: lineSegmentsOf(d),
    width: d.fold.width_cm * 10,
    folds: d.fold.folds,
    wall: wall_mm,
    driverAt_mm: d.end === "horn" ? 0 : d.driverAt_cm * 10,
    driverCutout,
    port: d.end === "port" ? { holeDiameter: (d.portDiameter_cm + 2 * d.portFlare_cm) * 10, length: d.portLength_cm * 10 } : undefined,
    ...(d.end === "tapped" ? { tap_mm: d.tapAt_cm * 10 } : {}),
    ...(d.end === "horn" ? { horn: { rear_l: d.rearChamber_l, throat_l: d.throatChamber_l } } : {}),
  });
}

/** Engine input for a line design. */
export function lineInputOf(d: LineDesign, wall_mm = 18): LineInput {
  const L = lineLength(d);
  let mouthDistance = 0;
  if (d.mouth === "custom") mouthDistance = d.mouthDistance_cm;
  else if (d.mouth === "back" && d.end !== "horn") {
    try {
      mouthDistance = lineFoldOf(d, wall_mm).outside.depth / 10;
    } catch {
      mouthDistance = 0;
    }
  }
  return {
    kind: "line",
    segments: lineSegmentsOf(d),
    driverAt_cm: d.end === "horn" ? 0 : Math.min(Math.max(0, d.driverAt_cm), L - 0.1),
    ...(d.end === "tapped" ? { tap_cm: d.tapAt_cm } : {}),
    ...(d.end === "horn" ? { frontLoaded: { rear_l: Math.max(0.01, d.rearChamber_l), throat_l: Math.max(0, d.throatChamber_l) } } : {}),
    ...(d.end === "port"
      ? { port: { shape: "round" as const, diameter_cm: d.portDiameter_cm, length_cm: d.portLength_cm, ...(d.portFlare_cm > 0 ? { flare_cm: d.portFlare_cm } : {}) } }
      : {}),
    ...(mouthDistance > 0 ? { mouthDistance_cm: mouthDistance } : {}),
  };
}

/** Inside volume of a line design (litres), port excluded; a horn's chambers included. */
export function lineVolume(d: LineDesign): number {
  try {
    const chambers = d.end === "horn" ? Math.max(0, d.rearChamber_l) + Math.max(0, d.throatChamber_l) : 0;
    return lineNetwork(lineInputOf(d)).volume_l + chambers;
  } catch {
    return 0;
  }
}

/**
 * How far a box's port or PRs (a 6th-order parallel box: its rear opening from the front one) is
 * from the cone, cm; 0 = side by side. "On the back" takes the volume calculator's outside depth
 * when the calculator is linked to this box (box or wedge shape).
 */
export function ventDistanceOf(d: DesignState, volume?: AppState["volume"]): number {
  if (d.kind === "bandpass") return d.order === "6p" ? (d.ventDistance_cm ?? 0) : 0;
  if (d.kind !== "vented" && d.kind !== "pr") return 0;
  if (d.ventAt === "custom") return d.ventDistance_cm ?? 0;
  if (d.ventAt === "back") return backDepthOf(d, volume) ?? 0;
  return 0;
}

/** The outside depth a port on the back panel sits from the cone, when the calculator is linked to this box. */
export function backDepthOf(d: DesignState, volume?: AppState["volume"]): number | null {
  if (!volume || volume.link !== d.id) return null;
  if (volume.shape === "box") return volume.depth_cm;
  if (volume.shape === "wedge") return (volume.depth_cm + volume.topDepth_cm) / 2;
  return null;
}

export type EnclosureOpts = { qaVolume?: boolean; portLength?: { endCorrection: number; driverSd_cm2?: number } };

export function enclosureOf(d: DesignState, vb: number, losses: Settings["losses"], wall_mm = 18, volume?: AppState["volume"], opts?: EnclosureOpts): EnclosureInput {
  const { ql, qa, qp } = losses;
  let dv = ventDistanceOf(d, volume);
  // "Port length" placement (VituixCAD). Vented: a side-by-side port is heard later by its physical
  // length (no end correction: that fits VituixCAD's group delay for four port lengths within 0.07 ms).
  // Passive radiator: VituixCAD (measured) delays it by the centre spacing of driver and PR side by
  // side, (Dd + Dpr) / 2 with D = 2 sqrt(Sd / pi), whatever the PR count. With mixed PR groups the largest Sd is used.
  if (opts?.portLength && dv === 0 && (d.kind === "vented" || d.kind === "pr") && !d.ventAt) {
    if (d.kind === "vented") dv = portOf(d).length_cm;
    else {
      const sdd = opts.portLength.driverSd_cm2;
      const sdp = Math.max(d.params.sd_cm2, ...d.extra.map((g) => g.params.sd_cm2));
      if (sdd !== undefined && sdd > 0 && Number.isFinite(sdd) && sdp > 0 && Number.isFinite(sdp)) {
        dv = (Math.sqrt(sdd / Math.PI) + Math.sqrt(sdp / Math.PI));
      }
    }
  }
  const at = dv > 0 ? { ventDistance_cm: dv } : {};
  switch (d.kind) {
    case "line":
      return lineInputOf(d, wall_mm);
    case "sealed":
      return { kind: "sealed", vb_l: vb, ql, qa };
    case "vented":
      return { kind: "vented", vb_l: vb, port: portOf(d), portCount: d.count, ql, qa, qp, ...at };
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
        ...at,
      };
    case "bandpass": {
      // Each chamber has its own losses when the design sets them; otherwise both use Settings.
      const fl = d.losses?.front ?? losses;
      const rl = d.losses?.rear ?? losses;
      // Qa's volume gain (Settings), per chamber: sealed/vented/pr get theirs through vbOf.
      const g = (q: number) => (opts?.qaVolume ? qaGain(q) : 1);
      const rearVb = vb * g(rl.qa);
      const frontVb = d.frontVb_l * g(fl.qa);
      return {
        kind: "bandpass",
        rear:
          d.order === "4"
            ? { vb_l: rearVb, ql: rl.ql, qa: rl.qa }
            : d.rearOpening === "pr"
              ? { vb_l: rearVb, prs: groupsOf(d.rearPrs), ql: rl.ql, qa: rl.qa }
              : { vb_l: rearVb, port: portOf(d.rear), portCount: d.rear.count, ...rl },
        front:
          d.frontOpening === "pr"
            ? { vb_l: frontVb, prs: groupsOf(d.frontPrs), ql: fl.ql, qa: fl.qa }
            : { vb_l: frontVb, port: portOf(d.front), portCount: d.front.count, ...fl },
        rearPortTo: d.order === "6s" ? "front" : "outside",
        qicl: d.losses?.qicl ?? 100,
        ...at,
      };
    }
  }
}

/** The driver as the engine sees it (DVC wiring and coil model applied). Needs a complete solve. */
export function driverInputOf(s: AppState, solved: SolveResult): DriverInput {
  const t = solved.values;
  const k = dvcFactors(s);
  return {
    fs: t.fs!,
    qms: t.qms!,
    qes: t.qes! * k.qes,
    vas_l: t.vas_l!,
    re: t.re! * k.re,
    sd_cm2: t.sd_cm2!,
    le_mh: s.settings.inductance ? s.le_mh * k.re : 0,
    // L2 and R2 are coil impedances too, so they scale with DVC wiring like Re and Le.
    ...(s.settings.inductance && s.l2_mh > 0 && s.r2_ohm > 0 ? { l2_mh: s.l2_mh * k.re, r2_ohm: s.r2_ohm * k.re } : {}),
    // Frequency-dependent damping is mechanical: DVC wiring doesn't touch it.
    ...(s.fdd && s.fdd.ams_mm_per_n > 0 ? { fdd: s.fdd } : {}),
    // The semi-inductance model's parts are coil impedances too.
    ...(s.settings.inductance && semiActive(s.semi)
      ? {
          semi: {
            leb_mh: s.semi.leb_mh * k.re,
            le_mh: s.semi.le_mh * k.re,
            ke: s.semi.ke * k.re,
            rss_ohm: s.semi.rss_ohm * k.re,
            ...(s.semi.re_ohm && s.semi.re_ohm > 0 ? { re_ohm: s.semi.re_ohm * k.re } : {}),
          },
        }
      : {}),
    xmax_mm: s.xmax_mm,
    pe_w: s.pe_w,
  };
}

/** The port end correction in use (Settings → Ports): K × the equivalent diameter. */
export const endCorrectionOf = (s: Pick<AppState, "settings">): number => s.settings.endCorrection ?? DEFAULT_END_CORRECTION;

/**
 * How every design is driven and simulated (drive level, wiring, filters, air…), without EQ.
 * `search`: for runs over many boxes (assistant, presets, fits), where the box air's distortion
 * is worked out only if it counts in Max SPL.
 */
export function simOptionsOf(s: AppState, search = false) {
  return {
    rg: s.settings.rg,
    endCorrection: endCorrectionOf(s),
    power: s.drive === "volts" ? s.volts : s.power,
    convention: s.drive === "volts" ? ("volts" as const) : undefined,
    drivers: s.drivers,
    wiring: s.wiring,
    isobaric: s.isobaric ? { coils: s.isoCoils } : null,
    fMin: 10,
    // The baffle step and its ripple, or port pipe resonances, sit higher up than the bass: show up to 1 kHz then.
    fMax: s.baffle.on || s.settings.portModel === "pipe" ? 1000 : 500,
    points: s.baffle.on || s.settings.portModel === "pipe" ? 400 : 300,
    highPass: s.highPass.on ? { type: s.highPass.type, order: s.highPass.order, freq: s.highPass.freq } : null,
    passive: s.passive.on ? { branches: s.passive.branches } : null,
    air: airOf(s),
    // The limit is in the displayed convention; the engine works in peak.
    portVelocityLimit: s.settings.velocity === "rms" ? portLimitOf(s) * Math.SQRT2 : portLimitOf(s),
    portCompression: s.settings.portCompression,
    // Always worked out for boxes (it changes nothing else); counted in Max SPL only when set.
    airDistortion:
      search && !s.settings.airInMaxSpl ? null : { threshold: airLimitOf(s) / 100, limit: s.settings.airInMaxSpl, n: AIR_FILL_N[s.settings.airFill] },
    splFrom: s.settings.lineSpl === "power" ? ("power" as const) : undefined,
    portModel: s.settings.portModel === "pipe" ? ("pipe" as const) : undefined,
    leakage: s.settings.leakage === "absorbed" ? ("absorbed" as const) : undefined,
    f3From: s.settings.f3From === "peak" ? ("peak" as const) : undefined,
    driveModel: s.settings.driveModel,
    coneLoad: s.settings.coneLoad === "piston" ? ("piston" as const) : undefined,
    coilTemp_C: s.settings.coilTemp_C > 20 ? s.settings.coilTemp_C : undefined,
    thermalLimit: s.settings.thermalLimit === "real" ? ("real" as const) : undefined,
    amp:
      s.settings.ampVolts > 0 || s.settings.ampAmps > 0
        ? { ...(s.settings.ampVolts > 0 ? { volts: s.settings.ampVolts } : {}), ...(s.settings.ampAmps > 0 ? { amps: s.settings.ampAmps } : {}) }
        : null,
  };
}

/**
 * Every box with the main driver, then (when comparing) every box again with the comparison
 * driver, flagged `compare`. Lookups by design id find the main run first.
 */
export function runDesigns(s: AppState, solved: SolveResult): Design[] {
  const main = runFor(s, solved, false);
  const view = compareView(s);
  if (!view || main.length === 0) return main;
  const cmp = runFor(view, solveDriver(view), true);
  // "Box · driver" for both, so every legend says which driver a curve is.
  // With different counts or wiring, say so: "2 × RSS265HF-4", "2 × … in series".
  const counted = view.drivers !== s.drivers || view.wiring !== s.wiring;
  const tag = (x: AppState, name: string) => (counted && x.drivers > 1 ? `${x.drivers} × ${name}${x.wiring === "series" ? " in series" : ""}` : name);
  const mine = tag(s, compareShort(s.driverName, s.driverBrand));
  let theirs = tag(view, compareShort(view.driverName, view.driverBrand));
  if (theirs === mine) theirs = `${theirs} (compare)`;
  return [
    ...main.map((d) => ({ ...d, label: `${d.design.name} · ${mine}` })),
    ...cmp.map((d) => ({ ...d, label: `${d.design.name} · ${theirs}`, dash: COMPARE_DASH, compare: true })),
  ];
}

/** One design's impulse and step response (peak scaled to ±1), for the time chart. */
export interface Transient {
  label: string;
  color: string;
  dash?: string;
  t_ms: Float64Array;
  impulse: Float64Array;
  step: Float64Array;
}

/**
 * Impulse and step response of each box that's on (the box alone: no baffle step or room gain),
 * with EQ and the high-pass filter. SPL from radiated power, like Hornresp, so the top end falls
 * as a real cone's does instead of a point source's. 48 kHz, up to 20 kHz.
 */
export function transientsOf(s: AppState, solved: SolveResult, designs: Design[]): Transient[] {
  if (solved.missing.length > 0) return [];
  const driver = driverInputOf(s, solved);
  const opts = simOptionsOf(s);
  const out: Transient[] = [];
  for (const x of designs) {
    if (x.compare) continue;
    const d = x.design;
    const vb = vbOf(s, d);
    const eq = s.eq
      .filter((e) => e.on && (e.target === "all" || e.target === d.id))
      .map(({ id: _id, on: _on, target: _t, ...stage }) => stage as EqStage);
    try {
      const r = transientResponse(driver, enclosureOf(d, vb, lossesFor(s, d), s.volume.wall_mm, s.volume, enclosureOptsOf(s)), { ...opts, eq, splFrom: "power", pathMode: s.settings.lineSpl }, { length: 16384 });
      out.push({ label: x.label, color: x.color, ...(x.dash ? { dash: x.dash } : {}), ...r });
    } catch {
      // Mid-edit: leave it out.
    }
  }
  return out;
}

function runFor(s: AppState, solved: SolveResult, isCompare: boolean): Design[] {
  if (solved.missing.length > 0) return [];
  const driver = driverInputOf(s, solved);
  const opts = simOptionsOf(s);
  const out: Design[] = [];
  for (const d of s.designs) {
    if (!d.on) continue;
    const built = builtVbOf(s, d);
    const vb = built * actingFactor(s, d);
    if (!(vb > 0)) continue;
    const eq = s.eq
      .filter((e) => e.on && (e.target === "all" || e.target === d.id))
      .map(({ id: _id, on: _on, target: _t, ...stage }) => stage as EqStage);
    try {
      // Settings → SPL applies to every design: in front of the box (default, like WinISD) or from radiated power (like Hornresp).
      const result = simulate(driver, enclosureOf(d, vb, lossesFor(s, d), s.volume.wall_mm, s.volume, enclosureOptsOf(s)), { ...opts, eq });
      if (s.settings.velocity === "rms") {
        if (result.portVelocity) result.portVelocity = result.portVelocity.map((v) => v / Math.SQRT2);
        if (result.rearPortVelocity) result.rearPortVelocity = result.rearPortVelocity.map((v) => v / Math.SQRT2);
      }
      const step = baffleOf(s, driver.sd_cm2);
      if (step) {
        const db = baffleCache(result.freq, step);
        result.spl = result.spl.map((v, i) => v + db[i]!);
        result.maxSpl = result.maxSpl.map((v, i) => v + db[i]!);
        if (result.parts) result.parts = { cone: result.parts.cone.map((v, i) => v + db[i]!), mouth: result.parts.mouth.map((v, i) => v + db[i]!) };
        if (result.splSideBySide) result.splSideBySide = result.splSideBySide.map((v, i) => v + db[i]!);
      }
      const room = roomGainOf(s);
      let f3Room: number | null | undefined;
      if (room) {
        const lift = result.freq.map((f) => roomGainDb(f, room));
        // The F3 in the room or car: the box's own response (no baffle step) plus the gain.
        const ref = result.summary.f3RefSpl;
        const rel = result.spl.map((v, i) => v - (step ? baffleCache(result.freq, step)[i]! : 0) + lift[i]! - ref);
        f3Room = (d.kind === "line" ? lowEdge(result.freq, rel) : minus3Points(result.freq, rel, d.kind === "bandpass"))[0] ?? null;
        result.spl = result.spl.map((v, i) => v + lift[i]!);
        result.maxSpl = result.maxSpl.map((v, i) => v + lift[i]!);
        if (result.parts) result.parts = { cone: result.parts.cone.map((v, i) => v + lift[i]!), mouth: result.parts.mouth.map((v, i) => v + lift[i]!) };
        if (result.splSideBySide) result.splSideBySide = result.splSideBySide.map((v, i) => v + lift[i]!);
      }
      out.push({
        design: d,
        label: d.name,
        compare: isCompare || undefined,
        color: colorOf(s, d.id),
        vb_l: built,
        ...(vb !== built ? { acting_l: vb } : {}),
        ...(f3Room !== undefined ? { f3Room } : {}),
        result,
      });
    } catch {
      // Invalid input mid-edit: skip this design until the numbers make sense again.
    }
  }
  return out;
}

/** The front baffle for the baffle step, or null when it's off or the size is unusable. */
export function baffleOf(s: AppState, sd_cm2?: number): Baffle | null {
  const b = s.baffle;
  if (!b.on) return null;
  const v = s.volume;
  const w = b.fromBox && v.shape === "box" ? v.width_cm : b.width_cm;
  const h = b.fromBox && v.shape === "box" ? v.height_cm : b.height_cm;
  if (!(w > 0 && h > 0)) return null;
  return {
    width: w / 100,
    height: h / 100,
    x: Math.min(w, Math.max(0, b.x_cm)) / 100,
    y: Math.min(h, Math.max(0, b.y_cm)) / 100,
    sd_cm2,
    c: airOf(s).c,
  };
}

/** The baffle step (dB) at these frequencies, or null when it's off. */
export function baffleDbFor(s: AppState, freq: Float64Array, sd_cm2?: number): Float64Array | null {
  const b = baffleOf(s, sd_cm2);
  return b ? baffleCache(freq, b) : null;
}

// The step only depends on the baffle and frequencies: compute it once per change.
let lastBaffle: { key: string; db: Float64Array } | null = null;
function baffleCache(freq: Float64Array, b: Baffle): Float64Array {
  const key = JSON.stringify([b, freq.length, freq[0], freq[freq.length - 1]]);
  if (lastBaffle?.key !== key) lastBaffle = { key, db: baffleStepDb(freq, b) };
  return lastBaffle.db;
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
export function prPeak(r: SimulationResult, fMin: number, fMax = Infinity): { mm: number; xmax: number | null; over: boolean } | null {
  if (!r.prGroups) return null;
  let best: { mm: number; xmax: number | null; ratio: number } | null = null;
  for (const g of r.prGroups) {
    const m = peakAbove(g.excursionMm, r.freq, fMin, fMax) ?? 0;
    const ratio = g.xmax_mm ? m / g.xmax_mm : 0;
    if (!best || ratio > best.ratio || (ratio === best.ratio && m > best.mm)) best = { mm: m, xmax: g.xmax_mm, ratio };
  }
  return best && { mm: best.mm, xmax: best.xmax, over: best.xmax !== null && best.mm > best.xmax };
}

/** A limit a design can go over, and the chart that shows it. */
export type LimitKind = "xmax" | "pr" | "port" | "air";
export const LIMIT_CHART: Record<LimitKind, "excursion" | "pr" | "port" | "air"> = { xmax: "excursion", pr: "pr", port: "port", air: "air" };
export const LIMIT_NAME: Record<LimitKind, string> = { xmax: "Xmax", pr: "PR Xmax", port: "Port speed", air: "Air distortion" };

const peakAbove = (a: Float64Array | null | undefined, freq: Float64Array, fMin: number, fMax = Infinity) => {
  if (!a) return null;
  let m = 0;
  for (let i = 0; i < a.length; i++) {
    if (freq[i]! >= fMin && freq[i]! < fMax && a[i]! > m) m = a[i]!;
    // The band's lower edge between two points: the value there too (log-f interpolation), so a
    // coarse grid (the design assistant's) grades the same as the app's fine one, where
    // excursion climbs fast below a box's tuning.
    if (i > 0 && freq[i - 1]! < fMin && freq[i]! > fMin && fMin < fMax) {
      const t = Math.log(fMin / freq[i - 1]!) / Math.log(freq[i]! / freq[i - 1]!);
      m = Math.max(m, a[i - 1]! + t * (a[i]! - a[i - 1]!));
    }
  }
  return m;
};

/**
 * Deep bass, for a tuned box (ported, PR, bandpass, line) with no high-pass filter: below
 * DEEP_SPLIT × its tuning the cone unloads and excursion runs away, but music has little
 * energy there. Down to DEEP_FLOOR_HZ the cone may reach DEEP_ALLOW × Xmax (the usual
 * damage margin) before it counts as over; past Xmax there is graded "deep bass" (amber),
 * not a failure. Below the floor there's no music to check.
 */
export const DEEP_SPLIT = 0.7;
export const DEEP_ALLOW = 2;
export const DEEP_FLOOR_HZ = 20;

/**
 * Lowest frequency any limit is checked at (Hz): 10 Hz with a high-pass filter (the filter is
 * modelled, so what's below it is real), else DEEP_FLOOR_HZ for every box, sealed included,
 * or the design's own F3 when that's lower: a box built to play below 20 Hz is checked there.
 * (A sealed box used to be checked from 15 Hz while ported and PR boxes were checked from
 * 20 Hz, so sealed boxes failed on bass the others were never asked to play.)
 */
export function checkFromHz(highPassOn: boolean, f3?: number | null): number {
  if (highPassOn) return 10;
  return f3 !== undefined && f3 !== null && f3 > 0 ? Math.max(10, Math.min(DEEP_FLOOR_HZ, f3)) : DEEP_FLOOR_HZ;
}

/** Where a design's deep-bass zone starts (Hz), or null (sealed, a high-pass filter, a very low tuning). */
export function deepSplitOf(r: SimulationResult, highPassOn: boolean): number | null {
  // A 4th-order bandpass box's sealed rear chamber holds the cone below its band, as a sealed
  // box's does: no runaway to grade (its band also starts well below the front tuning).
  if (r.summary.fc !== undefined && r.summary.fb !== undefined && r.summary.fbRear === undefined) return null;
  // A 6th-order bandpass box has two tunings: its band starts at the lower one.
  const fb = r.summary.fb !== undefined && r.summary.fbRear !== undefined ? Math.min(r.summary.fb, r.summary.fbRear) : r.summary.fb;
  return !highPassOn && fb !== undefined && DEEP_SPLIT * fb > DEEP_FLOOR_HZ ? DEEP_SPLIT * fb : null;
}

/** A design against its limits at the drive simulated. */
export interface Limits {
  /** Peak cone excursion (mm) above the deep-bass zone (or the whole range checked). */
  x: number | null;
  xpr: { mm: number; xmax: number | null; over: boolean } | null;
  /** Peak port air speed (m/s). */
  vp: number | null;
  /** Peak air distortion (HD2 %), when modelled. */
  hd2: number | null;
  over: LimitKind[];
  /** Past Xmax only in the deep-bass zone (within DEEP_ALLOW × Xmax): where, how far, and the drive scale that keeps it within. */
  deep: { below_hz: number; x_mm: number; scale: number } | null;
  /** Drive scale (amplitude, ≤ 1) that keeps every limit (1 when nothing is over). */
  safeScale: number;
}

/** A drive scaled in amplitude, in the user's unit: "15 W" or "8.7 V". */
export function driveAt(s: Pick<AppState, "drive" | "power" | "volts">, scale: number): string {
  if (s.drive === "volts") return `${(s.volts * scale).toPrecision(2)} V`;
  const w = s.power * scale * scale;
  return `${w >= 10 ? Math.round(w) : Number(w.toPrecision(2))} W`;
}

/**
 * Room for a straight port inside the box (cm): the longest inside dimension (from the volume
 * calculator, else a cube of this volume, the safe case), less one port diameter (or slot
 * height) of air between the port's inner end and the opposite wall.
 */
export function portRoom_cm(vb_l: number, clearance_cm: number, internalMax_cm: number | null = null): number {
  return (internalMax_cm ?? Math.cbrt(vb_l * 1000)) - clearance_cm;
}

/**
 * A design's peaks and which limits they cross: cone Xmax, the passive radiators' Xmax, the
 * port's chuffing line (`portLimit`, in the convention of the result's port speeds). From checkFromHz: 10 Hz with a high-pass filter, else 20 Hz (or the design's F3, if lower), except
 * a tuned box's deep-bass zone (deepSplitOf), which is graded instead (see DEEP_SPLIT).
 */
/** `airLimit` (% HD2): the air's distortion (box or line) counts only where a caller passes its limit. */
export function limitsOf(r: SimulationResult, xmax_mm: number, highPassOn: boolean, portLimit = PORT_LIMIT, airLimit = Infinity): Limits {
  const fMin = checkFromHz(highPassOn, r.summary.f3);
  const split = deepSplitOf(r, highPassOn);
  const lo = split ?? fMin;
  const x = peakAbove(r.excursionMm, r.freq, lo);
  const xpr = prPeak(r, lo);
  const vpFront = peakAbove(r.portVelocity, r.freq, fMin);
  const vpRear = peakAbove(r.rearPortVelocity, r.freq, fMin);
  const vp = vpFront === null ? vpRear : Math.max(vpFront, vpRear ?? 0);
  // Air distortion (when modelled): grows with the drive's amplitude, like excursion.
  const hd2 = peakAbove(r.airHd2, r.freq, fMin);
  const xDeep = split ? peakAbove(r.excursionMm, r.freq, DEEP_FLOOR_HZ, split) : null;
  const prDeep = split ? prPeak(r, DEEP_FLOOR_HZ, split) : null;
  // How far past each limit (1 = at it): the worst sets the safe drive.
  const ratios = [
    x !== null ? x / xmax_mm : 0,
    xDeep !== null ? xDeep / (DEEP_ALLOW * xmax_mm) : 0,
    xpr?.xmax ? xpr.mm / xpr.xmax : 0,
    prDeep?.xmax ? prDeep.mm / (DEEP_ALLOW * prDeep.xmax) : 0,
    vp !== null ? vp / portLimit : 0,
    hd2 !== null ? hd2 / airLimit : 0,
  ];
  const over: LimitKind[] = [];
  if (ratios[0]! > 1 || ratios[1]! > 1) over.push("xmax");
  if (ratios[2]! > 1 || ratios[3]! > 1) over.push("pr");
  if (ratios[4]! > 1) over.push("port");
  if (ratios[5]! > 1) over.push("air");
  // Deep bass: past Xmax (cone or PR) in the zone, but within the allowance.
  const deepRatio = Math.max(xDeep !== null ? xDeep / xmax_mm : 0, prDeep?.xmax ? prDeep.mm / prDeep.xmax : 0);
  const deep =
    split && deepRatio > 1 && !over.includes("xmax") && !over.includes("pr")
      ? { below_hz: split, x_mm: xDeep ?? 0, scale: 1 / deepRatio }
      : null;
  return { x, xpr: xpr && { ...xpr, over: ratios[2]! > 1 || ratios[3]! > 1 }, vp, hd2, over, deep, safeScale: Math.min(1, 1 / Math.max(...ratios, 1e-9)) };
}

/**
 * The same drive in the other unit, as the simulation converts it (V = √(P·R), R the whole
 * driver bank's Re): switching W ↔ V keeps the charts where they are. Null without a complete
 * driver. The other unit's stored value is kept when it already matches (within 1 %), so
 * switching back and forth doesn't drift by rounding.
 */
export function switchDrive(s: AppState, to: "watts" | "volts"): Pick<AppState, "drive" | "power" | "volts"> {
  if (s.drive === to) return { drive: to, power: s.power, volts: s.volts };
  const solved = solveDriver(s);
  if (solved.missing.length > 0) return { drive: to, power: s.power, volts: s.volts };
  // Volts² per watt as the simulation turns watts into volts (Settings → Watts).
  const o = simOptionsOf(s);
  const r = voltsPerRootWatt(driverInputOf(s, solved), { drivers: o.drivers, wiring: o.wiring, isobaric: o.isobaric, rg: o.rg, coilTemp_C: o.coilTemp_C, driveModel: o.driveModel, passive: o.passive }) ** 2;
  if (!(r > 0)) return { drive: to, power: s.power, volts: s.volts };
  const near = (a: number, b: number) => Math.abs(a - b) <= 0.01 * Math.max(a, b);
  if (to === "volts") {
    const v = Math.sqrt(s.power * r);
    return { drive: to, power: s.power, volts: near(v, s.volts) ? s.volts : Math.min(100, Math.max(0.1, Number(v.toPrecision(3)))) };
  }
  const p = (s.volts * s.volts) / r;
  return { drive: to, volts: s.volts, power: near(p, s.power) ? s.power : Math.min(10000, Math.max(1, Math.round(p * 10) / 10)) };
}

/**
 * What the amplifier sees across the whole driver bank (after DVC, isobaric pairing and
 * wiring): the cold Re the simulation uses, and the nominal impedance scaled the same way.
 * Null without a complete driver.
 */
export function amplifierLoad(s: AppState, solved: SolveResult): { re: number; nominal: number } | null {
  if (solved.missing.length > 0 || !(solved.values.re! > 0)) return null;
  const re = bankResistance(driverInputOf(s, solved), { drivers: s.drivers, wiring: s.wiring, isobaric: s.isobaric ? { coils: s.isoCoils } : null });
  if (!(re > 0)) return null;
  return { re, nominal: s.nominal_ohms * (re / solved.values.re!) };
}

/** The power rating of the whole driver bank (W): each driver's Pe times the drivers, as the thermal limit counts it. 0 when unknown. */
export const ratedPowerOf = (s: AppState): number => (s.pe_w > 0 ? Math.min(10000, Math.round(s.pe_w * s.drivers)) : 0);

/**
 * When the drive is about 1 W (3 W or less, in watts or volts: 2.83 V into a 4 Ω driver is about 2.5 W) and well under
 * the driver's rating, the excursion and port-speed charts sit far below their red lines: the
 * watts it amounts to and the rating, so the charts can say so. Null otherwise.
 */
export function lowDrive(s: AppState): { watts: number; rated: number } | null {
  const watts = s.drive === "watts" ? s.power : switchDrive(s, "watts").power;
  if (!(watts > 0) || watts > 3) return null;
  const rated = ratedPowerOf(s);
  if (rated > 0 && rated < 5 * watts) return null;
  return { watts, rated };
}

/** The drive level as people read it: "100 W" or "2.83 V". */
export const driveLabel = (s: Pick<AppState, "drive" | "power" | "volts">) => (s.drive === "volts" ? `${s.volts} V` : `${s.power} W`);
/** ", voice coil at 100 °C" when the coil is simulated hot; empty when cold. */
export const coilLabel = (s: Pick<AppState, "settings">) => (s.settings.coilTemp_C > 20 ? `, voice coil at ${s.settings.coilTemp_C} °C` : "");

/** Golden-ratio box proportions (width : height : depth), a common choice to spread standing waves. */
const GOLDEN = { w: 1, h: 1.618, d: 0.618 };

/**
 * Outside dimensions that give a design the target box volume (the calculator's
 * net volume, after every deduction). The shape is
 * scaled as a whole, keeping its proportions, or for a box set to golden-ratio
 * proportions first; a cylinder can instead keep its diameter and change only its length. Wall thickness and deductions stay as they are. Null when no
 * size reaches the target (deductions alone exceed it).
 */
export function dimensionsFor(
  s: AppState,
  d: DesignState | undefined,
  target_l: number,
  proportions: "keep" | "golden" | "length" = "keep",
): AppState["volume"] | null {
  const v0 = s.volume;
  let base = v0;
  if (proportions === "golden" && v0.shape === "box") {
    const unit = Math.cbrt(v0.width_cm * v0.height_cm * v0.depth_cm / (GOLDEN.w * GOLDEN.h * GOLDEN.d));
    base = { ...v0, width_cm: unit * GOLDEN.w, height_cm: unit * GOLDEN.h, depth_cm: unit * GOLDEN.d };
  }
  // A tube keeps its diameter (tubes come in set sizes): only its length changes.
  const scaled = (k: number): AppState["volume"] => proportions === "length" && v0.shape === "cylinder" ? { ...base, height_cm: base.height_cm * k } : ({
    ...base,
    width_cm: base.width_cm * k,
    height_cm: base.height_cm * k,
    depth_cm: base.depth_cm * k,
    diameter_cm: base.diameter_cm * k,
    topWidth_cm: base.topWidth_cm * k,
    topDepth_cm: base.topDepth_cm * k,
  });
  const vol = (k: number) => volumeFor({ ...s, volume: scaled(k) }, d).net_l;
  if (!(target_l > 0)) return null;
  let lo = 0.02;
  let hi = 1;
  while (vol(hi) < target_l && hi < 1e4) hi *= 2;
  if (vol(hi) < target_l) return null;
  for (let i = 0; i < 80; i++) {
    const mid = (lo + hi) / 2;
    if (vol(mid) < target_l) lo = mid;
    else hi = mid;
  }
  if (vol(hi) <= 0) return null;
  // Round to 0.1 cm: what someone would cut.
  const r = (x: number) => Math.round(x * 10) / 10;
  const out = scaled(hi);
  return {
    ...out,
    width_cm: r(out.width_cm),
    height_cm: r(out.height_cm),
    depth_cm: r(out.depth_cm),
    diameter_cm: r(out.diameter_cm),
    topWidth_cm: r(out.topWidth_cm),
    topDepth_cm: r(out.topDepth_cm),
  };
}

/** Cutout (mm) from the cone area when the database doesn't give one: about 1.12 × the effective cone diameter. */
export const cutoutFromSd = (sd_cm2: number) => Math.round(1.12 * 2 * Math.sqrt(sd_cm2 / Math.PI) * 10);

/** The calculator's car wedge in millimetres (depth_cm is the bottom depth, topDepth_cm the top). */
export function wedgeDimsOf(v: AppState["volume"]): WedgeDims {
  return {
    width: v.width_cm * 10,
    height: v.height_cm * 10,
    topDepth: v.topDepth_cm * 10,
    bottomDepth: v.depth_cm * 10,
    wall: v.wall_mm,
    ...(v.slopeWall_mm !== null && v.slopeWall_mm > 0 ? { slopeWall: v.slopeWall_mm } : {}),
  };
}

/** Back from millimetres to the calculator's fields. */
export const wedgeToVolume = (v: AppState["volume"], d: WedgeDims): AppState["volume"] => ({
  ...v,
  width_cm: d.width / 10,
  height_cm: d.height / 10,
  topDepth_cm: d.topDepth / 10,
  depth_cm: d.bottomDepth / 10,
});

/**
 * Gross inside volume that leaves this net volume after the calculator's deductions (the
 * fixed ones in litres, bracing as a share of the gross). Null when the deductions alone are more.
 */
export function grossForNet(s: AppState, d: DesignState | undefined, net_l: number): number | null {
  const r = volumeFor(s, d);
  const bracing = s.volume.bracing_pct > 0 ? s.volume.bracing_pct / 100 : 0;
  const fixed = r.deductions.filter((x) => !x.label.startsWith("Bracing")).reduce((a, x) => a + x.litres, 0);
  if (!(bracing < 1) || !(net_l > 0)) return null;
  return (net_l + fixed) / (1 - bracing);
}

/** The wedge's one dimension (the rest locked) for a net volume, rounded to 0.1 mm. */
export function solveWedgeFor(s: AppState, d: DesignState | undefined, field: WedgeField, net_l: number): WedgeSolve | null {
  const gross = grossForNet(s, d, net_l);
  if (gross === null) return null;
  const r = solveWedge(wedgeDimsOf(s.volume), field, gross);
  const round = (x: WedgeDims): WedgeDims => ({ ...x, [field]: Math.round(x[field] * 10) / 10 });
  return r.ok ? { ...r, dims: round(r.dims) } : { ...r, nearest: round(r.nearest) };
}

/** Transmission lines ripple above their tuning: their −3 dB point is the first one coming up from the bottom. */
export function lowEdge(freq: Float64Array, rel: ArrayLike<number>): number[] {
  for (let i = 1; i < rel.length; i++) {
    if (rel[i]! >= -3 && rel[i - 1]! < -3) {
      const t = (-3 - rel[i - 1]!) / (rel[i]! - rel[i - 1]!);
      return [freq[i - 1]! * (freq[i]! / freq[i - 1]!) ** t];
    }
  }
  return [];
}

/**
 * Where a relative response (0 dB = passband) crosses −3 dB, read off the curve as shown:
 * below its peak, and for a bandpass above it too. Interpolated in log f.
 */
export function minus3Points(freq: Float64Array, rel: ArrayLike<number>, bandLimited: boolean): number[] {
  let peak = 0;
  for (let i = 1; i < rel.length; i++) if (rel[i]! > rel[peak]!) peak = i;
  if (!(rel[peak]! >= -3)) return [];
  const at = (i: number, j: number) => {
    const t = (-3 - rel[i]!) / (rel[j]! - rel[i]!);
    return freq[i]! * (freq[j]! / freq[i]!) ** t;
  };
  const out: number[] = [];
  for (let i = peak; i > 0; i--) {
    if (rel[i - 1]! < -3) {
      out.push(at(i - 1, i));
      break;
    }
  }
  for (let i = peak; bandLimited && i + 1 < rel.length; i++) {
    if (rel[i + 1]! < -3) {
      out.push(at(i, i + 1));
      break;
    }
  }
  return out;
}
