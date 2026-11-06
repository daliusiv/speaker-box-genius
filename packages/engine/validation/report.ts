/**
 * The validation report: every WinISD and Hornresp comparison, with our values, the
 * differences and the curves to plot. site/build.ts turns it into the /validation/ page.
 *
 *   pnpm validation:report      rewrites docs/validation/results.json
 *
 * The file holds no dates or commit ids, so it only changes when a result does; a test
 * (test/validation-report.test.ts) fails when it's out of date.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { simulate } from "../src/simulate.ts";
import { WINISD_CASES, WINISD_VERSION, QUANTITY, runCase, type Quantity, type Setup } from "./winisd.ts";
import {
  HORNRESP_BOX_F_MAX,
  HORNRESP_BOX_NOTES,
  HORNRESP_BOX_TOL,
  HORNRESP_F_MAX,
  HORNRESP_NOTES,
  HORNRESP_TITLES,
  HORNRESP_TOL,
  HORNRESP_VERSION,
  MAXSPL_TOL,
  hornrespBoxIds,
  hornrespIds,
  runHornresp,
  runHornrespBox,
  type HornrespBoxRun,
  type HornrespRun,
  type MaxSplRun,
} from "./hornresp.ts";

/** Hornresp's Maximum SPL against ours, where it was exported. */
export interface MaxSplReport {
  ampVolts?: number;
  stats: MaxSplRun["stats"];
  pass: boolean;
  /** [frequency, Hornresp, ours] */
  spl: [number, number, number][];
}

export const REPORT_FILE = join(import.meta.dirname, "..", "..", "..", "docs", "validation", "results.json");

/** Rounds for a stable, readable file. */
const r = (x: number, digits = 4) => (Number.isFinite(x) ? Number(x.toFixed(digits)) : null);

/** Quantities drawn as curves (the others are single numbers). */
const CURVES: Partial<Record<Quantity, (s: Setup, res: ReturnType<typeof simulate>) => Float64Array | number[]>> = {
  tf: (_, res) => Array.from(res.spl, (v) => v - res.summary.referenceSpl),
  spl: (_, res) => res.spl,
  x: (_, res) => res.excursionMm,
  xpr: (_, res) => res.prExcursionMm!,
  vport: (_, res) => res.portVelocity!,
  vrear: (_, res) => res.rearPortVelocity!,
  z: (s, res) => Array.from(res.impedanceOhm, (v) => v * (s.zScale ?? 1)),
  gd: (_, res) => res.groupDelayMs,
  maxSpl: (_, res) => res.maxSpl,
  maxPower: (_, res) => res.maxPowerW,
};

export interface ReportCheck {
  /** See Report.quantities for its label and unit. */
  what: Quantity;
  f: number;
  winisd: number;
  ours: number | null;
  diff: number | null;
  tol: number;
  graph?: boolean;
  limit?: string;
  note?: string;
  pass: boolean;
}

export interface Curve {
  what: Quantity;
  /** Our curve: [frequency, value] pairs. */
  ours: [number, number | null][];
  /** WinISD's read-outs. */
  points: [number, number][];
}

export interface WinIsdCaseReport {
  id: string;
  title: string;
  fixture: string;
  setup: string;
  notes?: string;
  pass: boolean;
  checks: ReportCheck[];
  curves: Curve[];
}

export interface HornrespCaseReport {
  id: string;
  title: string;
  setup: string;
  pass: boolean;
  stats: HornrespRun["stats"];
  /** Which parts are within tolerance. */
  parts: HornrespRun["pass"];
  /** [frequency, Hornresp, ours] */
  spl: [number, number, number][];
  ze: [number, number, number][];
  xd: [number, number, number][];
  maxSpl?: MaxSplReport[];
}

export interface HornrespBoxCaseReport {
  id: string;
  title: string;
  setup: string;
  pass: boolean;
  stats: HornrespBoxRun["stats"];
  parts: HornrespBoxRun["pass"];
  /** This case's limits (the defaults unless case.json widens them). */
  tol: typeof HORNRESP_BOX_TOL;
  /** The port model and drivers it was run with. */
  options: string;
  /** Impedance compared up to here (Hz), for coil-model cases. */
  zeFMax?: number;
  /** [frequency, Hornresp, ours]; spl is empty where only the outputs were exported one by one. */
  spl: [number, number, number][];
  ze: [number, number, number][];
  xd: [number, number, number][];
  cone?: [number, number, number][];
  vent?: [number, number, number][];
  maxSpl?: MaxSplReport[];
}

export interface Report {
  /** Label and unit of each quantity; for relative ones (rel) a check's diff and tol are fractions. */
  quantities: typeof QUANTITY;
  winisd: { version: string; driver: string; cases: WinIsdCaseReport[] };
  hornresp: {
    version: string;
    driver: string;
    fMax: number;
    tol: typeof HORNRESP_TOL;
    maxSplTol: typeof MAXSPL_TOL;
    notes: string;
    cases: HornrespCaseReport[];
    boxes: { fMax: number; tol: typeof HORNRESP_BOX_TOL; notes: string; cases: HornrespBoxCaseReport[] };
  };
}

function winisdCase(k: (typeof WINISD_CASES)[number]): WinIsdCaseReport {
  const { setup, results } = runCase(k);
  const checks: ReportCheck[] = results.map((c) => ({
    what: c.what,
    f: c.f,
    winisd: c.winisd,
    ours: r(c.ours),
    diff: r(c.diff, 5),
    tol: r(c.tol, 5)!,
    ...(c.graph ? { graph: true } : {}),
    ...(c.limit ? { limit: c.limit } : {}),
    ...(c.note ? { note: c.note } : {}),
    pass: c.pass,
  }));

  // One curve per plotted quantity, spanning its read-outs.
  const curves: Curve[] = [];
  for (const what of [...new Set(results.map((c) => c.what))]) {
    const curve = CURVES[what];
    if (!curve) continue;
    const pts = results.filter((c) => c.what === what);
    const fs = pts.map((c) => c.f);
    const fMin = Math.min(10, ...fs.map((f) => f / 1.5));
    const fMax = Math.max(200, ...fs.map((f) => f * 1.5));
    const res = simulate(setup.driver, setup.box, { ...setup.opts, fMin, fMax, points: 120 });
    const y = curve(setup, res);
    curves.push({
      what,
      ours: Array.from(res.freq, (f, i) => [r(f, 3)!, r(y[i]!, 4)] as [number, number | null]),
      points: pts.map((c) => [c.f, c.winisd]),
    });
  }
  return { id: k.id, title: k.title, fixture: k.fixture, setup: k.setupText, ...(k.notes ? { notes: k.notes } : {}), pass: checks.every((c) => c.pass), checks, curves };
}

function hornrespCase(id: string): HornrespCaseReport {
  const run = runHornresp(id);
  const t = HORNRESP_TITLES[id] ?? { title: id, text: "" };
  // Every other point is plenty for the charts.
  const thin = (xs: { f: number; ref: number; ours: number }[], digits: number) =>
    xs.filter((_, i) => i % 2 === 0 || i === xs.length - 1).map((p) => [r(p.f, 2)!, r(p.ref, digits)!, r(p.ours, digits)!] as [number, number, number]);
  const s = run.stats;
  return {
    id,
    title: t.title,
    setup: t.text,
    pass: Object.values(run.pass).every((p) => p !== false) && run.maxSpl.every((m) => m.pass),
    stats: Object.fromEntries(Object.entries(s).map(([k, v]) => [k, r(v as number)!])) as HornrespRun["stats"],
    parts: run.pass,
    spl: thin(run.spl, 2),
    ze: thin(run.ze, 3),
    xd: thin(run.xd, 4),
    ...(run.maxSpl.length ? { maxSpl: maxSplReports(run.maxSpl) } : {}),
  };
}

const maxSplReports = (runs: MaxSplRun[]): MaxSplReport[] | undefined =>
  runs.length === 0
    ? undefined
    : runs.map((m) => ({
        ...(m.ampVolts ? { ampVolts: m.ampVolts } : {}),
        stats: Object.fromEntries(Object.entries(m.stats).map(([k, v]) => [k, r(v)!])) as MaxSplRun["stats"],
        pass: m.pass,
        spl: thinPairs(m.spl, 2),
      }));

const thinPairs = (xs: { f: number; ref: number; ours: number }[], digits: number) =>
  xs.filter((_, i) => i % 2 === 0 || i === xs.length - 1).map((p) => [r(p.f, 2)!, r(p.ref, digits)!, r(p.ours, digits)!] as [number, number, number]);

function hornrespBoxCase(id: string): HornrespBoxCaseReport {
  const run = runHornrespBox(id);
  const c = run.c;
  const options = [c.portModel === "pipe" ? "ports as pipes" : null, c.drivers && c.drivers > 1 ? `${c.drivers} drivers in ${c.wiring ?? "parallel"}` : null].filter(Boolean).join(", ");
  return {
    id,
    title: c.title,
    setup: c.text,
    pass: Object.values(run.pass).every((p) => p !== false) && run.maxSpl.every((m) => m.pass),
    stats: Object.fromEntries(Object.entries(run.stats).map(([k, v]) => [k, r(v as number)!])) as HornrespBoxRun["stats"],
    parts: run.pass,
    tol: run.tol,
    options,
    ...(c.zeFMax ? { zeFMax: c.zeFMax } : {}),
    spl: thinPairs(run.spl, 2),
    ze: thinPairs(run.ze, 3),
    xd: thinPairs(run.xd, 4),
    ...(run.cone ? { cone: thinPairs(run.cone, 2) } : {}),
    ...(run.vent ? { vent: thinPairs(run.vent, 2) } : {}),
    ...(run.maxSpl.length ? { maxSpl: maxSplReports(run.maxSpl) } : {}),
  };
}

export function buildReport(): Report {
  return {
    quantities: QUANTITY,
    winisd: {
      version: WINISD_VERSION,
      driver: "Dayton Audio DSA215-8; 100 W, amplifier resistance 0.1 Ω, losses Ql 10 / Qa 100 / Qp 100 and WinISD's air, unless a case says otherwise",
      cases: WINISD_CASES.map(winisdCase),
    },
    hornresp: {
      version: HORNRESP_VERSION,
      driver: "Dayton Audio DSA215-8 (Le 1 mH) unless a case names another driver, at 2.83 V in half space, Hornresp's air (c 344 m/s, ρ 1.205 kg/m³), SPL from radiated power",
      fMax: HORNRESP_F_MAX,
      tol: HORNRESP_TOL,
      maxSplTol: MAXSPL_TOL,
      notes: HORNRESP_NOTES,
      cases: hornrespIds().map(hornrespCase),
      boxes: { fMax: HORNRESP_BOX_F_MAX, tol: HORNRESP_BOX_TOL, notes: HORNRESP_BOX_NOTES, cases: hornrespBoxIds().map(hornrespBoxCase) },
    },
  };
}

/** Indented JSON with each point, check and other flat object on one line, so diffs show what changed. */
export const reportJson = (rep: Report = buildReport()) =>
  JSON.stringify(rep, null, 1)
    .replace(/\[\s*([^[\]{}]*?)\s*\]/g, (_, inner: string) => `[${inner.split(/,\s*/).join(",")}]`)
    .replace(/\{\s*([^{}[\]]*?)\s*\}/g, (_, inner: string) => `{ ${inner.split(/,\n\s*/).join(", ")} }`) + "\n";

if (process.argv[1] && import.meta.filename === process.argv[1]) {
  mkdirSync(dirname(REPORT_FILE), { recursive: true });
  const rep = buildReport();
  writeFileSync(REPORT_FILE, reportJson(rep));
  const w = rep.winisd.cases, h = [...rep.hornresp.cases, ...rep.hornresp.boxes.cases];
  const failing = [...w.filter((c) => !c.pass).map((c) => `WinISD ${c.id}`), ...h.filter((c) => !c.pass).map((c) => `Hornresp ${c.id}`)];
  console.log(`Wrote ${REPORT_FILE}: ${w.length} WinISD cases (${w.reduce((n, c) => n + c.checks.length, 0)} checks), ${h.length} Hornresp cases.`);
  if (failing.length) console.log(`Outside tolerance: ${failing.join(", ")}`);
}
