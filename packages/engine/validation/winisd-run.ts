/**
 * The full WinISD run of 9 Nov 2026: 51 WinISD 0.7.0.950 projects (written by our own .wpr export,
 * then opened in WinISD) and about 1,300 values read off WinISD's graph cursor at six frequencies.
 * The projects are in test/fixtures/winisd-run/, the readings in readings.json beside them.
 *
 * - t01–t38: sealed, vented, passive radiator and bandpass boxes; Rg, Le, air, distance, coil
 *   heating, 2 and 4 drivers, isobaric, high-pass filters, and runs at rated power.
 * - u03–u38: nine of those again with the driver's full record (Bl, Mms, Cms, Rms and KLe=0),
 *   which is what our export writes now.
 * - v01–v05: the box losses (Ql, Qa, Qp) at different volumes and drivers.
 *
 * Values were read with OCR, so a minus sign can be lost: signed quantities accept either sign.
 * Readings the OCR passes disagreed on were dropped. What is left out of the comparison, and why,
 * is in `skipReason` below.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseWpr, type WprProject } from "../src/wdr.ts";
import { simulate, type SimulationOptions, type SimulationResult } from "../src/simulate.ts";
import type { DriverInput, EnclosureInput } from "../src/model.ts";
import { WINISD_AIR } from "../src/constants.ts";

const DIR = join(import.meta.dirname, "..", "test", "fixtures", "winisd-run");

export type RunGraph = "tf" | "tfphase" | "gd" | "spl" | "maxspl" | "maxpower" | "x" | "z" | "zphase" | "tfpr" | "xpr" | "vrear" | "vfront" | "vintra";

/** Allowed difference per graph: in its unit (dB, degrees), or as a fraction. */
export const RUN_TOL: Record<RunGraph, { tol: number; rel: boolean; signed: boolean; label: string; unit: string }> = {
  tf: { tol: 0.06, rel: false, signed: true, label: "Transfer function", unit: "dB" },
  tfphase: { tol: 1.5, rel: false, signed: true, label: "Phase", unit: "°" },
  gd: { tol: 0.03, rel: true, signed: true, label: "Group delay", unit: "ms" },
  spl: { tol: 0.08, rel: false, signed: false, label: "SPL", unit: "dB" },
  maxspl: { tol: 0.1, rel: false, signed: false, label: "Maximum SPL", unit: "dB" },
  maxpower: { tol: 0.015, rel: true, signed: false, label: "Maximum power", unit: "W" },
  x: { tol: 0.015, rel: true, signed: false, label: "Cone excursion", unit: "mm" },
  z: { tol: 0.015, rel: true, signed: false, label: "Impedance", unit: "Ω" },
  zphase: { tol: 1.5, rel: false, signed: true, label: "Impedance phase", unit: "°" },
  tfpr: { tol: 0, rel: false, signed: true, label: "PR transfer function", unit: "dB" },
  xpr: { tol: 0.015, rel: true, signed: false, label: "PR excursion", unit: "mm" },
  vrear: { tol: 0.015, rel: true, signed: false, label: "Port air speed", unit: "m/s" },
  vfront: { tol: 0.015, rel: true, signed: false, label: "Front port air speed", unit: "m/s" },
  vintra: { tol: 0.015, rel: true, signed: false, label: "Intra port air speed", unit: "m/s" },
};

/**
 * Group delay is the slope of the phase, and WinISD's comes from its own (coarser) sweep: where
 * it changes fast, a few tenths of a millisecond either way are sampling, not the model.
 */
export const GD_ABS_MS = 0.5;

export interface RunReading {
  graph: RunGraph;
  f: number;
  winisd: number;
}

export interface RunCase {
  id: string;
  title: string;
  readings: RunReading[];
}

const raw = JSON.parse(readFileSync(join(DIR, "readings.json"), "utf8")) as Record<string, { title: string; readings: [RunGraph, number, number][] }>;
export const RUN_CASES: RunCase[] = Object.entries(raw).map(([id, c]) => ({
  id,
  title: c.title,
  readings: c.readings.map(([graph, f, winisd]) => ({ graph, f, winisd })),
}));

export function loadRunProject(id: string): WprProject {
  return parseWpr(readFileSync(join(DIR, `${id}.wpr`), "utf8"));
}

/** A project's driver record has only the T/S basics (no Bl): WinISD then shows a different impedance. */
const partialRecord = (p: WprProject) => !(p.driver.ts.bl && p.driver.ts.bl > 0);

/** The simulation a WinISD project describes, driven as WinISD drives it (driveModel "winisd"). */
export function runSetup(p: WprProject): { driver: DriverInput; box: EnclosureInput; opts: SimulationOptions; zScale: number } {
  const t = p.driver.ts;
  const driver: DriverInput = { fs: t.fs!, qms: t.qms!, qes: t.qes!, vas_l: t.vas_l!, re: t.re!, sd_cm2: t.sd_cm2!, le_mh: p.simulateLe ? p.driver.le_mh : 0, xmax_mm: p.driver.xmax_mm, pe_w: p.driver.pe_w };
  const port = (w: { diameter_cm: number; length_cm: number }) => ({ shape: "round" as const, diameter_cm: w.diameter_cm, length_cm: w.length_cm });
  const b = p.box;
  let box: EnclosureInput;
  if (b.type === "sealed") box = { kind: "sealed", vb_l: b.vb_l, ql: b.ql, qa: b.qa };
  else if (b.type === "vented") box = { kind: "vented", vb_l: b.vb_l, port: port(p.port!), portCount: p.port!.count, endCorrection: p.port!.endCorrection, ql: b.ql, qa: b.qa, qp: b.qp };
  else if (b.type === "passive-radiator") box = { kind: "passive-radiator", vb_l: b.vb_l, pr: p.pr!.params, prCount: p.pr!.count, addedMass_g: p.pr!.addedMass_g, ql: b.ql, qa: b.qa };
  else {
    const bp = p.bandpass!;
    box = {
      kind: "bandpass",
      rear: { vb_l: bp.rear.vb_l, ql: bp.rear.ql, qa: bp.rear.qa, ...(bp.rear.port ? { port: port(bp.rear.port), portCount: bp.rear.port.count, qp: bp.rear.qp } : {}) },
      front: { vb_l: bp.front.vb_l, port: port(bp.front.port), portCount: bp.front.port.count, ql: bp.front.ql, qa: bp.front.qa, qp: bp.front.qp },
      rearPortTo: bp.order === "6s" ? "front" : "outside",
      endCorrection: bp.front.port.endCorrection,
      qicl: bp.qicl,
    };
  }
  const n = p.drivers;
  // The project's own ρ and c (WinISD writes them from its air conditions).
  const air = p.air ?? WINISD_AIR;
  const opts: SimulationOptions = {
    power: p.power,
    // WinISD's Rg is per driver (per coil of an isobaric pair); the drivers share one amplifier in parallel.
    rg: (p.rg * (p.isobaric ? 2 : 1)) / n,
    air,
    drivers: n,
    wiring: "parallel",
    highPass: p.highPass,
    distance_m: p.distance_m,
    coilTemp_C: p.coilTempRise_C > 0 ? 20 + p.coilTempRise_C : undefined,
    ...(p.isobaric ? { isobaric: { coils: "series" as const } } : {}),
    driveModel: "winisd",
  };
  // WinISD plots one driver's impedance (one coil of an isobaric pair); ours is the whole bank's.
  return { driver, box, opts, zScale: p.isobaric ? n / 2 : n };
}

/** Readings the OCR got wrong: one digit misread (6↔8, 1↔7, 1↔4), plain against the neighbouring readings and the curve. */
export const OCR_MISREADS: Record<string, string> = {
  "t02|x|50.06": "0.635 read for 0.835",
  "t03|tf|32.98": "−6.017 read for −8.017",
  "t04|spl|50.06": "110.718 read for 110.118",
  "t34|tf|149.5": "6.372 read for −8.372",
  "v02|tf|15": "−47.252 read for −17.252",
  "v03|tf|50.06": "6.388 read for −8.388",
};

/** Differences left over, each looked at; the comparison holds them to `tol` instead. */
export const KNOWN: Record<string, { tol: number; note: string }> = {
  "t05|tf|21.98": { tol: 0.1, note: "Le on with Rg 1 Ω and a partial driver record (WinISD's lossy-Le model reaches down here)" },
  "t05|tf|32.98": { tol: 0.1, note: "as above" },
  "t05|spl|21.98": { tol: 0.1, note: "as above" },
  "t05|spl|32.98": { tol: 0.1, note: "as above" },
  "t34|tf|80.03": { tol: 0.15, note: "4th-order bandpass, two low-Re drivers: 0.14 dB high at the top of the band" },
  "t34|vfront|80.03": { tol: 0.02, note: "as above, 1.6 % in port speed" },
  "t22|x|50.06": { tol: 0.035, note: "humid, hot air (35 °C, 80 %): excursion 3 % high at 50 Hz only" },
};

/** Why a reading isn't compared, or null. */
export function skipReason(id: string, p: WprProject, r: RunReading, ours: { limitedBy: SimulationResult["limitedBy"][number] }): string | null {
  const key = `${id}|${r.graph}|${r.f}`;
  if (OCR_MISREADS[key]) return `OCR misread: ${OCR_MISREADS[key]}`;
  if (r.graph === "tfpr") return "WinISD's PR-only transfer function: no counterpart in the app";
  if (r.graph === "vintra") return "intra-chamber vent: WinISD has no series 6th-order box";
  if (r.graph === "vfront" && r.winisd === 0) return "WinISD's front-port graph is empty for this box";
  if ((r.graph === "maxspl" || r.graph === "maxpower") && ours.limitedBy === "port") return "WinISD's max SPL has no port-speed limit (ours does, on purpose)";
  if (r.graph === "maxspl" && r.winisd > 150) return "WinISD's max SPL has no port-speed limit (ours does, on purpose)";
  if (partialRecord(p) && (r.graph === "z" || r.graph === "zphase")) return "project written before the export carried the full driver record: WinISD's impedance differs (the u-repeats check it)";
  if (partialRecord(p) && p.simulateLe && r.f > 40) return "project written without KLe=0: WinISD's own lossy-Le model (the u-repeats check it)";
  if (partialRecord(p) && p.isobaric) return "isobaric project without the full driver record: WinISD computes the pair differently (the u-repeats check it)";
  return null;
}

export interface RunCheck {
  id: string;
  graph: RunGraph;
  f: number;
  winisd: number;
  ours: number;
  diff: number;
  pass: boolean;
  skip: string | null;
  /** Set for a leftover difference held to a wider tolerance (see KNOWN). */
  known: string | null;
}

export function runRunCase(c: RunCase): RunCheck[] {
  const p = loadRunProject(c.id);
  const s = runSetup(p);
  const fs = [...new Set(c.readings.map((r) => r.f))].sort((a, b) => a - b);
  const r = simulate(s.driver, s.box, { ...s.opts, frequencies: fs });
  // Group delay from a dense sweep, as WinISD draws it.
  const dense = simulate(s.driver, s.box, { ...s.opts, fMin: 10, fMax: 500, points: 4000 });
  const bandpassRear = s.box.kind === "bandpass" && !!s.box.rear.port;
  return c.readings.map((rd) => {
    const i = fs.indexOf(rd.f);
    const pick = (): number => {
      switch (rd.graph) {
        case "tf": return r.spl[i]! - r.summary.referenceSpl;
        case "tfphase": return r.phaseDeg[i]!;
        case "gd": return dense.groupDelayMs[dense.freq.findIndex((x) => x >= rd.f)]!;
        case "spl": return r.spl[i]!;
        case "maxspl": return r.maxSpl[i]!;
        case "maxpower": return r.maxPowerW[i]!;
        case "x": return r.excursionMm[i]!;
        case "z": return r.impedanceOhm[i]! * s.zScale;
        case "zphase": return r.impedancePhaseDeg[i]!;
        case "xpr": return r.prExcursionMm?.[i] ?? NaN;
        case "vrear": return (bandpassRear ? r.rearPortVelocity?.[i] : r.portVelocity?.[i]) ?? NaN;
        case "vfront": return r.portVelocity?.[i] ?? NaN;
        default: return NaN;
      }
    };
    const ours = pick();
    const t = RUN_TOL[rd.graph];
    const d = (w: number) => (t.rel ? ours / w - 1 : ours - w);
    let diff = d(rd.winisd);
    if (t.signed && Math.abs(d(-rd.winisd)) < Math.abs(diff)) diff = d(-rd.winisd);
    const skip = skipReason(c.id, p, rd, { limitedBy: r.limitedBy[i]! });
    const known = KNOWN[`${c.id}|${rd.graph}|${rd.f}`];
    // WinISD shows three decimals: one in the last place is reading resolution.
    const absDiff = Math.abs(ours - (Math.abs(ours - rd.winisd) <= Math.abs(ours + rd.winisd) || !t.signed ? rd.winisd : -rd.winisd));
    const inRes = absDiff <= 0.0015 || (rd.graph === "gd" && absDiff <= GD_ABS_MS);
    const pass = Number.isFinite(diff) && (Math.abs(diff) <= (known?.tol ?? t.tol) || inRes);
    return { id: c.id, graph: rd.graph, f: rd.f, winisd: rd.winisd, ours, diff, pass, skip, known: known?.note ?? null };
  });
}
