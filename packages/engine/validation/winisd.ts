/**
 * The WinISD comparison cases: real WinISD 0.7.0.950 projects (test/fixtures/*.wpr) and the
 * values read from WinISD itself, each with the tolerance it's held to. The engine tests
 * (test/winisd.test.ts) and the validation report (report.ts) both run from this list, so the
 * published numbers are always the ones the tests check.
 *
 * To add a case: save the WinISD project into test/fixtures, read values off WinISD's cursor
 * (or graphs), add an entry below, then run `pnpm validation:report`.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseWpr, type WprProject as WinIsdProject } from "../src/wdr.ts";
import { simulate, type SimulationOptions, type SimulationResult } from "../src/simulate.ts";
import { prFb, type DriverInput, type EnclosureInput } from "../src/model.ts";


const FIXTURES = join(import.meta.dirname, "..", "test", "fixtures");
export const WINISD_VERSION = "WinISD 0.7.0.950";

export type Quantity =
  | "tf" // transfer function, dB relative to the passband
  | "spl" // dB SPL at 1 m
  | "x" // cone excursion, mm
  | "xpr" // passive radiator excursion, mm
  | "vport" // (front) port air velocity, m/s peak
  | "vrear" // bandpass rear port air velocity, m/s peak
  | "z" // electrical impedance, Ω
  | "gd" // group delay, ms
  | "maxSpl" // maximum SPL, dB
  | "maxPower" // maximum input power, W
  | "fb" // box tuning, Hz
  | "fbRear" // bandpass rear chamber tuning, Hz
  | "fc" // sealed (or bandpass rear) resonance, Hz
  | "f3" // −3 dB frequency, Hz
  | "qtc"
  | "prFb" // passive radiator box tuning from the PR model, Hz
  | "xDipF" // frequency of the cone excursion dip near Fb, Hz
  | "xBumpF"; // frequency of the cone excursion bump above Fb, Hz

export const QUANTITY: Record<Quantity, { label: string; unit: string; rel: boolean }> = {
  tf: { label: "Transfer function", unit: "dB", rel: false },
  spl: { label: "SPL", unit: "dB", rel: false },
  x: { label: "Cone excursion", unit: "mm", rel: true },
  xpr: { label: "PR excursion", unit: "mm", rel: true },
  vport: { label: "Port air velocity", unit: "m/s", rel: true },
  vrear: { label: "Rear port air velocity", unit: "m/s", rel: true },
  z: { label: "Impedance", unit: "Ω", rel: true },
  gd: { label: "Group delay", unit: "ms", rel: true },
  maxSpl: { label: "Maximum SPL", unit: "dB", rel: false },
  maxPower: { label: "Maximum power", unit: "W", rel: true },
  fb: { label: "Tuning (Fb)", unit: "Hz", rel: false },
  fbRear: { label: "Rear tuning", unit: "Hz", rel: false },
  fc: { label: "Box resonance (Fc)", unit: "Hz", rel: false },
  f3: { label: "F3", unit: "Hz", rel: false },
  qtc: { label: "Qtc", unit: "", rel: false },
  prFb: { label: "Tuning (Fb)", unit: "Hz", rel: false },
  xDipF: { label: "Cone excursion dip", unit: "Hz", rel: false },
  xBumpF: { label: "Cone excursion bump", unit: "Hz", rel: false },
};

export interface Check {
  what: Quantity;
  /** Frequency the value was read at (Hz); 0 for single-number values such as Fb. */
  f: number;
  /** WinISD's value. */
  winisd: number;
  /** Allowed difference: in the unit (dB, Hz…), or as a fraction for relative quantities. */
  tol: number;
  /** Read off WinISD's graph rather than its cursor read-out (so only to reading accuracy). */
  graph?: boolean;
  /** For maxSpl/maxPower: which limit WinISD reports there. */
  limit?: SimulationResult["limitedBy"][number];
  note?: string;
}

export interface Setup {
  driver: DriverInput;
  box: EnclosureInput;
  opts: SimulationOptions;
  /** WinISD plots one driver's impedance; multiply ours by this to compare. */
  zScale?: number;
}

export interface WinIsdCase {
  id: string;
  title: string;
  fixture: string;
  /** One line on the box and the drive. */
  setupText: string;
  setup: (p: WinIsdProject) => Setup;
  checks: Check[];
  /** Known differences and how they were investigated (Markdown). */
  notes?: string;
}

const ts = (p: WinIsdProject, le = p.simulateLe ? p.driver.le_mh : 0): DriverInput => {
  const t = p.driver.ts;
  return { fs: t.fs!, qms: t.qms!, qes: t.qes!, vas_l: t.vas_l!, re: t.re!, sd_cm2: t.sd_cm2!, le_mh: le, xmax_mm: p.driver.xmax_mm, pe_w: p.driver.pe_w };
};
/** endCorrection: "project" uses the .wpr's value; a number overrides it; undefined uses the app default. */
const vented = (p: WinIsdProject, endCorrection?: number | "project"): EnclosureInput => ({
  kind: "vented",
  vb_l: p.box.vb_l,
  port: { shape: "round", diameter_cm: p.port!.diameter_cm, length_cm: p.port!.length_cm },
  portCount: p.port!.count,
  ...(endCorrection === "project" ? { endCorrection: p.port!.endCorrection } : endCorrection !== undefined ? { endCorrection } : {}),
  ql: p.box.ql,
  qa: p.box.qa,
  qp: p.box.qp,
});
const prBox = (p: WinIsdProject): EnclosureInput => ({
  kind: "passive-radiator",
  vb_l: p.box.vb_l,
  pr: p.pr!.params,
  prCount: p.pr!.count,
  addedMass_g: p.pr!.addedMass_g,
  ql: p.box.ql,
  qa: p.box.qa,
});
/** WinISD's drive: its watts go into the coil and Rg together (see SimulationOptions.driveModel). */
const drive = (p: WinIsdProject): SimulationOptions => ({ power: p.power, rg: p.rg, air: p.air, driveModel: "winisd" });

export const WINISD_CASES: WinIsdCase[] = [
  {
    id: "ported",
    title: "Ported box",
    fixture: "dsa215.wpr",
    setupText: "18.02 L, 10.2 × 70.64 cm port, Fb 41.67 Hz",
    setup: (p) => ({ driver: ts(p), box: vented(p, "project"), opts: drive(p) }),
    checks: [
      { what: "fb", f: 0, winisd: 41.673, tol: 0.001 },
      { what: "tf", f: 20.09, winisd: -25.034, tol: 0.01 },
      { what: "tf", f: 40, winisd: -5.783, tol: 0.01 },
      { what: "tf", f: 80.63, winisd: -0.143, tol: 0.01 },
      { what: "x", f: 20, winisd: 20.3, tol: 0.3 / 20.3, graph: true },
      { what: "x", f: 100, winisd: 3.7, tol: 0.3 / 3.7, graph: true },
      { what: "vport", f: 20, winisd: 8.5, tol: 0.3 / 8.5, graph: true },
      { what: "vport", f: 34.5, winisd: 10.45, tol: 0.3 / 10.45, graph: true },
    ],
  },
  {
    id: "sealed",
    title: "Sealed box",
    fixture: "dsa215-closed.wpr",
    setupText: "10.4 L, Qtc 0.71",
    setup: (p) => ({ driver: ts(p), box: { kind: "sealed", vb_l: p.box.vb_l, ql: p.box.ql, qa: p.box.qa }, opts: drive(p) }),
    checks: [
      { what: "tf", f: 20.28, winisd: -23.679, tol: 0.02 },
      { what: "tf", f: 40, winisd: -12.113, tol: 0.02 },
      { what: "tf", f: 80.38, winisd: -2.86, tol: 0.02 },
      { what: "f3", f: 0, winisd: 79.03, tol: 0.15, note: "WinISD's “Fsc” field is the −3 dB frequency" },
      { what: "qtc", f: 0, winisd: 0.709, tol: 0.005 },
    ],
  },
  {
    id: "ported-100w",
    title: "Ported box at 100 W: every graph (Test 1)",
    fixture: "dsa215.wpr",
    setupText: "The ported box at 100.08 W (24.3 V), read from each graph's cursor",
    setup: (p) => ({ driver: ts(p), box: vented(p, 0.732), opts: drive(p) }),
    checks: [
      { what: "spl", f: 20.03, winisd: 82.822, tol: 0.06 },
      { what: "spl", f: 40.13, winisd: 102.235, tol: 0.06 },
      { what: "spl", f: 80.63, winisd: 107.808, tol: 0.06 },
      { what: "x", f: 20.16, winisd: 20.311, tol: 0.006 },
      { what: "x", f: 60.32, winisd: 5.93, tol: 0.006 },
      { what: "vport", f: 20.03, winisd: 8.616, tol: 0.006 },
      { what: "vport", f: 35.14, winisd: 10.406, tol: 0.006 },
      { what: "z", f: 20.22, winisd: 28.769, tol: 0.01 },
      { what: "z", f: 42.29, winisd: 6.886, tol: 0.01 },
      { what: "z", f: 100.39, winisd: 11.729, tol: 0.01 },
      { what: "gd", f: 30.67, winisd: 11.268, tol: 0.005 },
      { what: "gd", f: 60.32, winisd: 6.584, tol: 0.005 },
      { what: "maxSpl", f: 20.16, winisd: 71.664, tol: 0.06, limit: "xmax" },
      { what: "maxSpl", f: 40.13, winisd: 101.262, tol: 0.06, limit: "thermal" },
      { what: "maxPower", f: 19.79, winisd: 7.062, tol: 0.01 },
      { what: "maxPower", f: 40.25, winisd: 80, tol: 1e-6, note: "thermal limit = Pe" },
    ],
    notes:
      "The shapes match; the absolute level sits a uniform ~0.04 dB (0.5 %) above WinISD and the impedance peaks are up to 0.8 % higher. " +
      "This project's driver record is not self-consistent (its Bl, Mms and Cms give Fs 35.18 Hz, not 35), and simulating from those values instead of " +
      "Fs/Qes/Qms/Vas moves the level by about as much again. Projects written with a consistent record match to 0.01 dB (see the full WinISD run below). " +
      "The remaining offset is far below anything measurable.",
  },
  {
    id: "ported-hpf",
    title: "Ported box with a high-pass filter (Test 3)",
    fixture: "dsa215-hpf.wpr",
    setupText: "The ported box with a 2nd-order Butterworth high-pass at 25 Hz (read from the project's filters)",
    setup: (p) => ({ driver: ts(p), box: vented(p, 0.732), opts: { ...drive(p), highPass: p.highPass } }),
    checks: [
      { what: "tf", f: 15.12, winisd: -43.222, tol: 0.03 },
      { what: "tf", f: 25.41, winisd: -20.808, tol: 0.03 },
      { what: "tf", f: 40.13, winisd: -6.326, tol: 0.03 },
      { what: "x", f: 15.22, winisd: 8.894, tol: 0.006 },
      { what: "x", f: 20.22, winisd: 11.081, tol: 0.006 },
      { what: "x", f: 40.13, winisd: 1.959, tol: 0.006 },
      { what: "maxSpl", f: 19.6, winisd: 70.559, tol: 0.03, limit: "xmax" },
    ],
  },
  {
    id: "ported-le",
    title: "Ported box with voice-coil inductance (Test 4)",
    fixture: "dsa215-le.wpr",
    setupText: "The ported box with “Simulate voice coil inductance” on, Le 1 mH",
    setup: (p) => ({ driver: ts(p, p.driver.le_mh), box: vented(p, 0.732), opts: drive(p) }),
    checks: [
      { what: "tf", f: 99.77, winisd: 0.243, tol: 0.02 },
      { what: "tf", f: 201.71, winisd: 0.516, tol: 0.02 },
      { what: "tf", f: 500, winisd: -0.39, tol: 0.02 },
      { what: "z", f: 99.77, winisd: 11.452, tol: 0.01 },
      { what: "z", f: 199.85, winisd: 6.394, tol: 0.01 },
      { what: "z", f: 500, winisd: 6.303, tol: 0.01 },
    ],
    notes: "WinISD models Le as a plain series inductor, as this comparison does. The app's optional L2R2 model goes further (see below).",
  },
  {
    id: "two-drivers",
    title: "Two drivers in parallel (Test 5)",
    fixture: "dsa215-2drivers.wpr",
    setupText: "Two DSA215-8 in parallel in the ported box at 100 W",
    setup: (p) => ({
      driver: ts(p),
      box: vented(p, 0.732),
      opts: { ...drive(p), rg: p.rg / p.drivers, drivers: p.drivers, wiring: "parallel" },
      zScale: p.drivers,
    }),
    checks: [
      { what: "tf", f: 20.09, winisd: -25.716, tol: 0.02 },
      { what: "tf", f: 40.13, winisd: -10.897, tol: 0.02 },
      { what: "tf", f: 80.38, winisd: -0.44, tol: 0.02 },
      { what: "x", f: 19.91, winisd: 13.521, tol: 0.006 },
      { what: "vport", f: 35.68, winisd: 8.554, tol: 0.006 },
      { what: "z", f: 19.91, winisd: 16.451, tol: 0.01 },
      { what: "z", f: 100.39, winisd: 18.553, tol: 0.01 },
    ],
    notes:
      "WinISD applies the amplifier resistance Rg to each driver separately and plots one driver's impedance. " +
      "The app shares Rg between the drivers and shows the impedance the amplifier sees, so the comparison divides Rg by the number of drivers and multiplies the impedance by it.",
  },
  {
    id: "ported-ql7",
    title: "Ported box with leakage Ql 7 (Test 6)",
    fixture: "dsa215-ql7.wpr",
    setupText: "The ported box with Ql 7 instead of WinISD's default 10",
    setup: (p) => ({ driver: ts(p), box: vented(p, 0.732), opts: drive(p) }),
    checks: [
      { what: "tf", f: 19.91, winisd: -25.422, tol: 0.01 },
      { what: "tf", f: 40.25, winisd: -6.154, tol: 0.01 },
      { what: "tf", f: 80.38, winisd: -0.275, tol: 0.01 },
      { what: "z", f: 20.03, winisd: 27.68, tol: 0.01 },
      { what: "z", f: 41.13, winisd: 7.193, tol: 0.01 },
      { what: "z", f: 100.7, winisd: 11.662, tol: 0.01 },
    ],
  },
  {
    id: "bandpass-4",
    title: "4th-order bandpass (Test 7)",
    fixture: "dsa215-bp4.wpr",
    setupText: "15 L sealed rear, 20 L front tuned to 50 Hz, 7.5 cm port",
    setup: (p) => {
      const bp = p.bandpass!;
      return {
        driver: ts(p),
        box: {
          kind: "bandpass",
          rear: { vb_l: bp.rear.vb_l, ql: bp.rear.ql, qa: bp.rear.qa },
          front: { vb_l: bp.front.vb_l, port: { shape: "round", diameter_cm: bp.front.port.diameter_cm, length_cm: bp.front.port.length_cm }, ql: bp.front.ql, qa: bp.front.qa, qp: bp.front.qp },
          qicl: bp.qicl,
        },
        opts: drive(p),
      };
    },
    checks: [
      { what: "fb", f: 0, winisd: 50, tol: 0.001, note: "front tuning" },
      { what: "fc", f: 0, winisd: 65.4166, tol: 0.001, note: "rear chamber resonance (Frc)" },
      { what: "tf", f: 30.67, winisd: -9.702, tol: 0.015 },
      { what: "tf", f: 49.65, winisd: -1.758, tol: 0.015 },
      { what: "tf", f: 80.88, winisd: -7.529, tol: 0.015 },
      { what: "tf", f: 120.45, winisd: -14.039, tol: 0.015 },
      { what: "x", f: 30.39, winisd: 10.017, tol: 0.006 },
      { what: "vport", f: 49.81, winisd: 21.993, tol: 0.006 },
      { what: "z", f: 30.11, winisd: 11.046, tol: 0.01 },
      { what: "z", f: 60.5, winisd: 8.526, tol: 0.01 },
    ],
    notes: "WinISD includes leakage between the chambers (Qiclfr = 100); so does the app.",
  },
  {
    id: "bandpass-6",
    title: "6th-order bandpass (Test 8)",
    fixture: "dsa215-bp6.wpr",
    setupText: "20 L rear tuned to 35 Hz, 15 L front tuned to 70 Hz, both ported to the outside",
    setup: (p) => {
      const bp = p.bandpass!;
      const port = (w: { diameter_cm: number; length_cm: number }) => ({ shape: "round" as const, diameter_cm: w.diameter_cm, length_cm: w.length_cm });
      return {
        driver: ts(p),
        box: {
          kind: "bandpass",
          rear: { vb_l: bp.rear.vb_l, port: port(bp.rear.port!), ql: bp.rear.ql, qa: bp.rear.qa, qp: bp.rear.qp },
          front: { vb_l: bp.front.vb_l, port: port(bp.front.port), ql: bp.front.ql, qa: bp.front.qa, qp: bp.front.qp },
          qicl: bp.qicl,
        },
        opts: drive(p),
      };
    },
    checks: [
      { what: "fb", f: 0, winisd: 70, tol: 1e-6, note: "front tuning" },
      { what: "fbRear", f: 0, winisd: 35, tol: 1e-6 },
      { what: "tf", f: 30.58, winisd: -11.089, tol: 0.01 },
      { what: "tf", f: 50.27, winisd: 0.935, tol: 0.01 },
      { what: "tf", f: 81.13, winisd: 0.476, tol: 0.01 },
      { what: "tf", f: 120.82, winisd: -7.857, tol: 0.01 },
      { what: "x", f: 30.2, winisd: 5.369, tol: 0.006 },
      { what: "vrear", f: 35.25, winisd: 16.516, tol: 0.006 },
      { what: "vrear", f: 70.38, winisd: 0.904, tol: 0.006 },
      { what: "vport", f: 35.25, winisd: 2.68, tol: 0.008 },
      { what: "vport", f: 69.73, winisd: 22.982, tol: 0.008 },
      { what: "z", f: 30.48, winisd: 7.265, tol: 0.01 },
      { what: "z", f: 60.13, winisd: 8.832, tol: 0.01 },
    ],
    notes: "This case pins the inter-chamber leak's reference to the driver (R = Q / (ωs·Cas)).",
  },
  {
    id: "iso-sealed",
    title: "Isobaric pairs in a sealed box (Test 9)",
    fixture: "dsa215-iso-sealed.wpr",
    setupText: "Two isobaric pairs (coils in series) in the 10.4 L sealed box, at WinISD's power",
    setup: (p) => ({
      driver: ts(p),
      box: { kind: "sealed", vb_l: p.box.vb_l, ql: p.box.ql, qa: p.box.qa },
      opts: {
        power: p.power,
        driveModel: "winisd",
        rg: (2 * p.rg) / p.drivers,
        drivers: p.drivers,
        isobaric: { coils: "series" },
        air: p.air,
      },
    }),
    checks: [
      { what: "tf", f: 29.83, winisd: -17.028, tol: 0.02 },
      { what: "tf", f: 60.69, winisd: -5.881, tol: 0.02 },
      { what: "tf", f: 100.39, winisd: -1.407, tol: 0.02 },
      { what: "x", f: 29.92, winisd: 2.559, tol: 0.006 },
      { what: "z", f: 100.39, winisd: 13.91, tol: 0.01 },
    ],
    notes:
      "WinISD wires the two coils of a pair in series, applies Rg to each coil, and sets the voltage as if the pairs were single drivers, V = √(P·Re/Nd), " +
      "which puts only about half its stated power into the coils. The app does the same with Settings → Watts “Into coil + cable (like WinISD)”, which opening a WinISD project sets, so the same watts give the same results.",
  },
  {
    id: "iso-ported",
    title: "Isobaric pairs in a ported box (Test 10)",
    fixture: "dsa215-iso-ported.wpr",
    setupText: "Two isobaric pairs in the 18 L ported box, same conventions as Test 9",
    setup: (p) => ({
      driver: ts(p),
      box: vented(p),
      opts: {
        power: p.power,
        driveModel: "winisd",
        rg: (2 * p.rg) / p.drivers,
        drivers: p.drivers,
        isobaric: { coils: "series" },
        air: p.air,
      },
    }),
    checks: [
      { what: "tf", f: 20.09, winisd: -25.034, tol: 0.015 },
      { what: "tf", f: 40.88, winisd: -5.328, tol: 0.015 },
      { what: "tf", f: 79.64, winisd: -0.152, tol: 0.015 },
      { what: "vport", f: 35.03, winisd: 7.357, tol: 0.006 },
      { what: "x", f: 20.09, winisd: 7.4, tol: 0.05, graph: true },
      { what: "z", f: 19.91, winisd: 28.545, tol: 0.01 },
      { what: "z", f: 101.01, winisd: 11.602, tol: 0.01 },
    ],
  },
  {
    id: "dvc-series",
    title: "Dual voice coil driver, coils in series (Test 11)",
    fixture: "dsa215-dvc-series.wpr",
    setupText: "The DSA215-8 as a DVC driver wired in series (Re 23.6 Ω, Bl 21.2) in the ported box",
    setup: (p) => ({ driver: ts(p), box: vented(p), opts: drive(p) }),
    checks: [
      { what: "tf", f: 19.97, winisd: -25.312, tol: 0.01 },
      { what: "tf", f: 39.76, winisd: -5.932, tol: 0.01 },
      { what: "tf", f: 80.63, winisd: -0.225, tol: 0.01 },
      { what: "x", f: 20, winisd: 20.4, tol: 0.03, graph: true },
      { what: "z", f: 19.97, winisd: 114.441, tol: 0.01 },
      { what: "z", f: 100.08, winisd: 47.177, tol: 0.01 },
    ],
    notes: "WinISD stores the driver as wired (Re 23.6 Ω and Bl 21.2 from 5.9 Ω / 10.6 entered for the coils in parallel), then simulates it like any single-coil driver.",
  },
  {
    id: "pr-18l",
    title: "Passive radiator, 18 L",
    fixture: "dsa215-dsa270pr.wpr",
    setupText: "1 × DSA270-PR with 50 g added in 18 L (Fb 45.90 Hz)",
    setup: (p) => ({ driver: ts(p), box: prBox(p), opts: drive(p) }),
    checks: [
      { what: "prFb", f: 0, winisd: 45.897, tol: 0.001 },
      { what: "tf", f: 20.09, winisd: -38.84, tol: 0.15 },
      { what: "tf", f: 40, winisd: -7.79, tol: 0.15 },
      { what: "tf", f: 61.25, winisd: -0.315, tol: 0.15 },
    ],
    notes:
      "Box tuning matches exactly, so radiator mass and stiffness are modelled the same way. The remaining difference is **damping near the tuning frequency**: " +
      "WinISD shows less loss there than the standard lumped loss model (the same model that matches its ported and sealed boxes to 0.01 dB). " +
      "Moving the loss reference frequencies, scaling the radiator's Qms and removing individual losses were all tried; none reproduces both WinISD PR boxes, " +
      "so WinISD evidently treats passive-radiator losses differently internally. Real box leakage varies far more than this (Ql 5–20 is typical).",
  },
  {
    id: "pr-50l",
    title: "Passive radiator, 50 L",
    fixture: "dsa215-dsa270pr-50l.wpr",
    setupText: "1 × DSA270-PR, no added mass, in 50 L (Fb 38.67 Hz): a high-Q tuning with a dip above it",
    setup: (p) => ({ driver: ts(p), box: prBox(p), opts: drive(p) }),
    checks: [
      { what: "prFb", f: 0, winisd: 38.671, tol: 0.001 },
      { what: "tf", f: 25.33, winisd: -25.974, tol: 0.1 },
      { what: "tf", f: 40.13, winisd: -1.213, tol: 0.55, note: "the tuning peak: see the known difference" },
      { what: "tf", f: 80.13, winisd: -1.741, tol: 0.05, note: "the dip" },
      { what: "tf", f: 120.08, winisd: -1.082, tol: 0.05 },
    ],
    notes: "Right at the tuning peak WinISD shows less damping than the standard loss model (−1.21 against −1.70 dB): the same passive-radiator damping difference as the 18 L box.",
  },
  {
    id: "pr-excursion",
    title: "Passive radiator excursion at 100 W (Test 2)",
    fixture: "dsa215-dsa270pr-test2.wpr",
    setupText: "The 18 L + 50 g PR box at 100.1 W: cone and PR excursion graphs",
    setup: (p) => ({ driver: ts(p), box: prBox(p), opts: drive(p) }),
    checks: [
      { what: "xpr", f: 10, winisd: 13.445, tol: 0.01 },
      { what: "xpr", f: 20.16, winisd: 12.134, tol: 0.01 },
      { what: "xpr", f: 40.5, winisd: 9.274, tol: 0.025 },
      { what: "x", f: 20.03, winisd: 19.373, tol: 0.01 },
      { what: "x", f: 40.5, winisd: 4.646, tol: 0.01 },
      { what: "x", f: 65.36, winisd: 5.695, tol: 0.015, note: "the bump" },
      { what: "x", f: 46.11, winisd: 2.183, tol: 0.07, note: "the dip at Fb" },
      { what: "xDipF", f: 0, winisd: 46.11, tol: 0.15 },
      { what: "xBumpF", f: 0, winisd: 65.36, tol: 0.3 },
    ],
    notes:
      "Away from the tuning the agreement matches the ported box (0.35–0.5 %). Close to Fb, WinISD's lighter PR damping shows up again: " +
      "a slightly deeper cone dip and a little more PR travel. The dip and bump frequencies agree within 0.05 Hz.",
  },
];

export const loadProject = (fixture: string) => parseWpr(readFileSync(join(FIXTURES, fixture), "utf8"));

/** Our value for one check. */
export function evaluate(c: Check, s: Setup, p: WinIsdProject): number {
  const at = (f: number) => simulate(s.driver, s.box, { ...s.opts, fMin: f, fMax: f, points: 1 });
  const dense = (fMin: number, fMax: number, points: number) => simulate(s.driver, s.box, { ...s.opts, fMin, fMax, points });
  switch (c.what) {
    case "tf": {
      const r = at(c.f);
      return r.spl[0]! - r.summary.referenceSpl;
    }
    case "spl":
      return at(c.f).spl[0]!;
    case "x":
      return at(c.f).excursionMm[0]!;
    case "xpr":
      return at(c.f).prExcursionMm![0]!;
    case "vport":
      return at(c.f).portVelocity![0]!;
    case "vrear":
      return at(c.f).rearPortVelocity![0]!;
    case "z":
      return at(c.f).impedanceOhm[0]! * (s.zScale ?? 1);
    case "gd": {
      const d = dense(10, 500, 4000);
      return d.groupDelayMs[d.freq.findIndex((x) => x >= c.f)]!;
    }
    case "maxSpl":
      return at(c.f).maxSpl[0]!;
    case "maxPower":
      return at(c.f).maxPowerW[0]!;
    case "fb":
      return at(50).summary.fb!;
    case "fbRear":
      return at(50).summary.fbRear!;
    case "fc":
      return at(50).summary.fc!;
    case "f3":
      return dense(10, 500, 4000).summary.f3!;
    case "qtc":
      return dense(10, 500, 4000).summary.qtc!;
    case "prFb":
      return prFb(p.box.vb_l, p.pr!.params, p.pr!.count, p.pr!.addedMass_g, p.air);
    case "xDipF":
    case "xBumpF": {
      const d = dense(30, 120, 2000);
      let dip = 0;
      let bump = 0;
      d.freq.forEach((f, i) => {
        if (f < 60 && d.excursionMm[i]! < d.excursionMm[dip]!) dip = i;
        if (f > 55 && (d.freq[bump]! <= 55 || d.excursionMm[i]! > d.excursionMm[bump]!)) bump = i;
      });
      return d.freq[c.what === "xDipF" ? dip : bump]!;
    }
  }
}

/** Which limit sets the maximum at a check's frequency (for maxSpl/maxPower checks). */
export const limitAt = (s: Setup, f: number) => simulate(s.driver, s.box, { ...s.opts, fMin: f, fMax: f, points: 1 }).limitedBy[0]!;

export interface CheckResult extends Check {
  ours: number;
  /** ours − WinISD, in the unit (absolute quantities) or as a fraction (relative ones). */
  diff: number;
  pass: boolean;
  limitOk: boolean;
}

export function runCase(k: WinIsdCase): { project: WinIsdProject; setup: Setup; results: CheckResult[] } {
  const project = loadProject(k.fixture);
  const setup = k.setup(project);
  const results = k.checks.map((c) => {
    const ours = evaluate(c, setup, project);
    const rel = QUANTITY[c.what].rel;
    const diff = rel ? ours / c.winisd - 1 : ours - c.winisd;
    const limitOk = c.limit === undefined || limitAt(setup, c.f) === c.limit;
    return { ...c, ours, diff, pass: Math.abs(diff) <= c.tol && limitOk, limitOk };
  });
  return { project, setup, results };
}
