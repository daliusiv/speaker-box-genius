import {
  STANDARD_AIR,
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
} from "@sbg/engine";
import type { AppState, DesignKind, DesignState, LineDesign, PortFields, PrDesign, PrGroupState, Settings } from "./state.ts";
import { compareView } from "./state.ts";
import { stuffFactor, stuffable, stuffingEffect } from "./stuffing.ts";

/** One colour per design slot; distinguishable in light and dark mode. */
/**
 * Each box type has its own colour, whatever else is in the project: sealed blue, ported
 * orange, passive radiators green, bandpass purple, transmission lines pink. A second (third…)
 * design of the same type takes the next shade of its colour.
 */
export const KIND_COLORS: Record<DesignKind, readonly string[]> = {
  sealed: ["#3b82f6", "#93c5fd", "#6366f1", "#bfdbfe"],
  vented: ["#f97316", "#fdba74", "#c2410c", "#ffedd5"],
  pr: ["#22c55e", "#86efac", "#84cc16", "#bbf7d0"],
  bandpass: ["#a855f7", "#d8b4fe", "#d946ef", "#e9d5ff"],
  line: ["#f472b6", "#f9a8d4", "#db2777", "#fbcfe8"],
};

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

/** The volume a design acts as, which the simulation and tuning use: the built volume, scaled by its stuffing. */
export function vbOf(s: AppState, d: DesignState): number {
  return builtVbOf(s, d) * stuffFactor(d);
}

/** Box losses for a design: Settings', with the Qa its stuffing sets. */
export function lossesFor(s: AppState, d: DesignState): Settings["losses"] {
  const qa = stuffable(d.kind) ? stuffingEffect(d.stuffing, d.kind).qa : null;
  return qa === null ? s.settings.losses : { ...s.settings.losses, qa };
}

/** Hornresp's air: c = 344 m/s, ρ = 1.205 kg/m³. */
export const HORNRESP_AIR: Air = { rho: 1.205, c: 344 };
export const airOf = (s: AppState): Air => (s.settings.air === "winisd" ? WINISD_AIR : s.settings.air === "hornresp" ? HORNRESP_AIR : STANDARD_AIR);

/** Chuffing guideline, in whichever convention (peak or RMS) the user chose to display: the default of the setting. */
export const PORT_LIMIT = 17;
/** The chuffing line in use (Settings → Ports), in the displayed convention. */
export const portLimitOf = (s: Pick<AppState, "settings">): number => (s.settings.portLimit_ms > 0 ? s.settings.portLimit_ms : PORT_LIMIT);

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

export function enclosureOf(d: DesignState, vb: number, losses: Settings["losses"], wall_mm = 18): EnclosureInput {
  const { ql, qa, qp } = losses;
  switch (d.kind) {
    case "line":
      return lineInputOf(d, wall_mm);
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
    case "bandpass": {
      // Each chamber has its own losses when the design sets them; otherwise both use Settings.
      const fl = d.losses?.front ?? losses;
      const rl = d.losses?.rear ?? losses;
      return {
        kind: "bandpass",
        rear:
          d.order === "4"
            ? { vb_l: vb, ql: rl.ql, qa: rl.qa }
            : d.rearOpening === "pr"
              ? { vb_l: vb, prs: groupsOf(d.rearPrs), ql: rl.ql, qa: rl.qa }
              : { vb_l: vb, port: portOf(d.rear), portCount: d.rear.count, ...rl },
        front:
          d.frontOpening === "pr"
            ? { vb_l: d.frontVb_l, prs: groupsOf(d.frontPrs), ql: fl.ql, qa: fl.qa }
            : { vb_l: d.frontVb_l, port: portOf(d.front), portCount: d.front.count, ...fl },
        rearPortTo: d.order === "6s" ? "front" : "outside",
        qicl: d.losses?.qicl ?? 100,
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
    // The semi-inductance model's parts are coil impedances too.
    ...(s.settings.inductance && semiActive(s.semi)
      ? { semi: { leb_mh: s.semi.leb_mh * k.re, le_mh: s.semi.le_mh * k.re, ke: s.semi.ke * k.re, rss_ohm: s.semi.rss_ohm * k.re } }
      : {}),
    xmax_mm: s.xmax_mm,
    pe_w: s.pe_w,
  };
}

/** How every design is driven and simulated (drive level, wiring, filters, air…), without EQ. */
export function simOptionsOf(s: AppState) {
  return {
    rg: s.settings.rg,
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
    air: airOf(s),
    // The limit is in the displayed convention; the engine works in peak.
    portVelocityLimit: s.settings.velocity === "rms" ? portLimitOf(s) * Math.SQRT2 : portLimitOf(s),
    portCompression: s.settings.portCompression,
    splFrom: s.settings.lineSpl === "power" ? ("power" as const) : undefined,
    portModel: s.settings.portModel === "pipe" ? ("pipe" as const) : undefined,
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
  const mine = compareShort(s.driverName, s.driverBrand);
  let theirs = compareShort(view.driverName, view.driverBrand);
  if (theirs === mine) theirs = `${theirs} (compare)`;
  return [
    ...main.map((d) => ({ ...d, label: `${d.design.name} · ${mine}` })),
    ...cmp.map((d) => ({ ...d, label: `${d.design.name} · ${theirs}`, dash: COMPARE_DASH, compare: true })),
  ];
}

function runFor(s: AppState, solved: SolveResult, isCompare: boolean): Design[] {
  if (solved.missing.length > 0) return [];
  const driver = driverInputOf(s, solved);
  const opts = simOptionsOf(s);
  const out: Design[] = [];
  for (const d of s.designs) {
    if (!d.on) continue;
    const built = builtVbOf(s, d);
    const vb = built * stuffFactor(d);
    if (!(vb > 0)) continue;
    const eq = s.eq
      .filter((e) => e.on && (e.target === "all" || e.target === d.id))
      .map(({ id: _id, on: _on, target: _t, ...stage }) => stage as EqStage);
    try {
      const result = simulate(driver, enclosureOf(d, vb, lossesFor(s, d), s.volume.wall_mm), { ...opts, eq });
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
      }
      const room = roomGainOf(s);
      let f3Room: number | null | undefined;
      if (room) {
        const lift = result.freq.map((f) => roomGainDb(f, room));
        // The F3 in the room or car: the box's own response (no baffle step) plus the gain.
        const ref = result.summary.bandPeakSpl ?? result.summary.referenceSpl;
        const rel = result.spl.map((v, i) => v - (step ? baffleCache(result.freq, step)[i]! : 0) + lift[i]! - ref);
        f3Room = (d.kind === "line" ? lowEdge(result.freq, rel) : minus3Points(result.freq, rel, d.kind === "bandpass"))[0] ?? null;
        result.spl = result.spl.map((v, i) => v + lift[i]!);
        result.maxSpl = result.maxSpl.map((v, i) => v + lift[i]!);
        if (result.parts) result.parts = { cone: result.parts.cone.map((v, i) => v + lift[i]!), mouth: result.parts.mouth.map((v, i) => v + lift[i]!) };
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
    let m = 0;
    for (let i = 0; i < g.excursionMm.length; i++) if (r.freq[i]! >= fMin && r.freq[i]! < fMax && g.excursionMm[i]! > m) m = g.excursionMm[i]!;
    const ratio = g.xmax_mm ? m / g.xmax_mm : 0;
    if (!best || ratio > best.ratio || (ratio === best.ratio && m > best.mm)) best = { mm: m, xmax: g.xmax_mm, ratio };
  }
  return best && { mm: best.mm, xmax: best.xmax, over: best.xmax !== null && best.mm > best.xmax };
}

/** A limit a design can go over, and the chart that shows it. */
export type LimitKind = "xmax" | "pr" | "port";
export const LIMIT_CHART: Record<LimitKind, "excursion" | "pr" | "port"> = { xmax: "excursion", pr: "pr", port: "port" };
export const LIMIT_NAME: Record<LimitKind, string> = { xmax: "Xmax", pr: "PR Xmax", port: "Port speed" };

const peakAbove = (a: Float64Array | null | undefined, freq: Float64Array, fMin: number, fMax = Infinity) => {
  if (!a) return null;
  let m = 0;
  for (let i = 0; i < a.length; i++) if (freq[i]! >= fMin && freq[i]! < fMax && a[i]! > m) m = a[i]!;
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
 * port's chuffing line (`portLimit`, in the convention of the result's port speeds). With a high-pass filter, from 10 Hz. Without one, from 15 Hz, except
 * a tuned box's deep-bass zone (deepSplitOf), which is graded instead (see DEEP_SPLIT).
 */
export function limitsOf(r: SimulationResult, xmax_mm: number, highPassOn: boolean, portLimit = PORT_LIMIT): Limits {
  const fMin = highPassOn ? 10 : 15;
  const split = deepSplitOf(r, highPassOn);
  const lo = split ?? fMin;
  const x = peakAbove(r.excursionMm, r.freq, lo);
  const xpr = prPeak(r, lo);
  const vpFront = peakAbove(r.portVelocity, r.freq, fMin);
  const vpRear = peakAbove(r.rearPortVelocity, r.freq, fMin);
  const vp = vpFront === null ? vpRear : Math.max(vpFront, vpRear ?? 0);
  const xDeep = split ? peakAbove(r.excursionMm, r.freq, DEEP_FLOOR_HZ, split) : null;
  const prDeep = split ? prPeak(r, DEEP_FLOOR_HZ, split) : null;
  // How far past each limit (1 = at it): the worst sets the safe drive.
  const ratios = [
    x !== null ? x / xmax_mm : 0,
    xDeep !== null ? xDeep / (DEEP_ALLOW * xmax_mm) : 0,
    xpr?.xmax ? xpr.mm / xpr.xmax : 0,
    prDeep?.xmax ? prDeep.mm / (DEEP_ALLOW * prDeep.xmax) : 0,
    vp !== null ? vp / portLimit : 0,
  ];
  const over: LimitKind[] = [];
  if (ratios[0]! > 1 || ratios[1]! > 1) over.push("xmax");
  if (ratios[2]! > 1 || ratios[3]! > 1) over.push("pr");
  if (ratios[4]! > 1) over.push("port");
  // Deep bass: past Xmax (cone or PR) in the zone, but within the allowance.
  const deepRatio = Math.max(xDeep !== null ? xDeep / xmax_mm : 0, prDeep?.xmax ? prDeep.mm / prDeep.xmax : 0);
  const deep =
    split && deepRatio > 1 && !over.includes("xmax") && !over.includes("pr")
      ? { below_hz: split, x_mm: xDeep ?? 0, scale: 1 / deepRatio }
      : null;
  return { x, xpr: xpr && { ...xpr, over: ratios[2]! > 1 || ratios[3]! > 1 }, vp, over, deep, safeScale: Math.min(1, 1 / Math.max(...ratios, 1e-9)) };
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
  const r = bankResistance(driverInputOf(s, solved), { drivers: s.drivers, wiring: s.wiring, isobaric: s.isobaric ? { coils: s.isoCoils } : null });
  if (!(r > 0)) return { drive: to, power: s.power, volts: s.volts };
  const near = (a: number, b: number) => Math.abs(a - b) <= 0.01 * Math.max(a, b);
  if (to === "volts") {
    const v = Math.sqrt(s.power * r);
    return { drive: to, power: s.power, volts: near(v, s.volts) ? s.volts : Math.min(100, Math.max(0.1, Number(v.toPrecision(3)))) };
  }
  const p = (s.volts * s.volts) / r;
  return { drive: to, volts: s.volts, power: near(p, s.power) ? s.power : Math.min(10000, Math.max(1, Math.round(p * 10) / 10)) };
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
 * proportions first. Wall thickness and deductions stay as they are. Null when no
 * size reaches the target (deductions alone exceed it).
 */
export function dimensionsFor(
  s: AppState,
  d: DesignState | undefined,
  target_l: number,
  proportions: "keep" | "golden" = "keep",
): AppState["volume"] | null {
  const v0 = s.volume;
  let base = v0;
  if (proportions === "golden" && v0.shape === "box") {
    const unit = Math.cbrt(v0.width_cm * v0.height_cm * v0.depth_cm / (GOLDEN.w * GOLDEN.h * GOLDEN.d));
    base = { ...v0, width_cm: unit * GOLDEN.w, height_cm: unit * GOLDEN.h, depth_cm: unit * GOLDEN.d };
  }
  const scaled = (k: number): AppState["volume"] => ({
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
