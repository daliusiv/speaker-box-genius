/**
 * The published summary of the SPICE check (docs/validation/spice.json, shown on /validation/):
 * per output, the worst and mean engine-vs-circuit difference by frequency region over every case,
 * plus three cases' curves. Written by `pnpm spice:report`; spice.test.ts checks it's current.
 *
 * It's a file of its own, not part of results.json: its numbers are differences of 1e-7 and
 * smaller, whose last digits can move between Node and Python builds, so the test compares it
 * loosely (sameSpiceReport) where results.json is compared byte for byte.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { simulate } from "../src/simulate.ts";
import { compare, TOL, type Region, type Stat } from "./spice/compare.ts";
import type { SpiceCase } from "./spice/elements.ts";
import { cirPath, loadCases } from "./spice/fixtures.ts";
import { buildNetlist } from "./spice/netlist.ts";
import { outputs, runMna, type RawResult } from "./spice/run.ts";

export const SPICE_REPORT_FILE = join(import.meta.dirname, "..", "..", "..", "docs", "validation", "spice.json");

/** Cases whose curves the page draws: engine line, circuit points. */
export const SHOWCASE: { id: string; output: "spl" | "impedance" }[] = [
  { id: "v01", output: "impedance" },
  { id: "b03", output: "spl" },
  { id: "g-chain-003", output: "spl" },
];

/** How each output's difference is measured, for the page. */
export const OUTPUT_UNITS: Record<string, { unit: "dB" | "°" | "rel" | "gd"; tol: string }> = {
  "SPL (dB)": { unit: "dB", tol: `${TOL.splP95} dB (95 %), ${TOL.splWorst} dB worst` },
  "SPL phase (°)": { unit: "°", tol: `${TOL.phase}°` },
  "Group delay (ms)": { unit: "gd", tol: `${TOL.gdMs} ms or ${TOL.gdRel * 100} %` },
  Impedance: { unit: "rel", tol: `${TOL.z * 100} %` },
  "Impedance phase (°)": { unit: "°", tol: `${TOL.phase}°` },
  Excursion: { unit: "rel", tol: `${TOL.rel * 100} %` },
  "Port air speed": { unit: "rel", tol: `${TOL.rel * 100} %` },
  "PR excursion": { unit: "rel", tol: `${TOL.rel * 100} %` },
  "Box pressure": { unit: "rel", tol: `${TOL.rel * 100} %` },
  "Rear port air speed": { unit: "rel", tol: `${TOL.rel * 100} %` },
  "Front chamber pressure": { unit: "rel", tol: `${TOL.rel * 100} %` },
};

export interface SpiceOutputSummary {
  output: string;
  comparisons: number;
  points: number;
  worst: number;
  worstCase: string;
  worstHz: number;
  regions: Record<Region, { worst: number; mean: number; points: number }>;
  pass: boolean;
}

export interface SpiceReport {
  cases: number;
  compared: number;
  kinds: Record<string, number>;
  outputs: SpiceOutputSummary[];
  showcase: { id: string; title: string; output: "spl" | "impedance"; unit: string; points: [number, number, number][] }[];
}

const sig = (x: number, n = 2) => (x === 0 ? 0 : Number(x.toPrecision(n)));
const key = (output: string) => (/^PR \d+ excursion$/.test(output) ? "PR excursion" : output);
const engineFor = (c: SpiceCase, freq: number[]) =>
  simulate(c.driver, c.box as Parameters<typeof simulate>[1], { ...c.opts, air: c.air, frequencies: freq });

/**
 * Every case through mna.py and the engine. `raw` lets a caller that already ran mna.py reuse it;
 * `each` sees every case's comparison (the test lists failures from it).
 */
export function buildSpiceReport(raw?: Record<string, RawResult>, each?: (c: SpiceCase, stats: Stat[], raw: RawResult) => void): SpiceReport {
  const all = loadCases();
  const cases = all.filter((c) => c.box.kind !== "free-air");
  raw ??= runMna(cases.map((c) => cirPath(c.id)));
  const kinds: Record<string, number> = {};
  const acc = new Map<string, { s: Stat[]; ids: string[] }>();
  const showcase: SpiceReport["showcase"] = [];
  for (const c of cases) {
    const kind = c.id.startsWith("g-") ? c.id.replace(/^g-|-\d+$/g, "") : c.box.kind;
    kinds[kind] = (kinds[kind] ?? 0) + 1;
    const net = buildNetlist(c);
    const sp = outputs(raw[cirPath(c.id)]!, net.probes);
    const eng = engineFor(c, sp.freq);
    const stats = compare(sp, eng, net.fRef);
    each?.(c, stats, raw[cirPath(c.id)]!);
    for (const s of stats) {
      const a = acc.get(key(s.output)) ?? { s: [], ids: [] };
      a.s.push(s);
      a.ids.push(c.id);
      acc.set(key(s.output), a);
    }
    const show = SHOWCASE.find((x) => x.id === c.id);
    if (show) {
      const [e, k, unit] = show.output === "spl" ? [eng.spl, sp.spl, "dB"] : [eng.impedanceOhm, sp.impedanceOhm, "Ω"];
      const step = Math.max(1, Math.round(sp.freq.length / 70));
      const points: [number, number, number][] = [];
      for (let i = 0; i < sp.freq.length; i += step) points.push([sig(sp.freq[i]!, 5), Number(e[i]!.toFixed(3)), Number(k[i]!.toFixed(3))]);
      showcase.push({ id: c.id, title: c.title, output: show.output, unit, points });
    }
  }
  const outs: SpiceOutputSummary[] = [...acc].map(([output, { s, ids }]) => {
    let w = 0;
    for (let i = 1; i < s.length; i++) if (s[i]!.worst > s[w]!.worst) w = i;
    const regions = Object.fromEntries(
      (["below", "around", "above"] as Region[]).map((r) => {
        const n = s.reduce((t, x) => t + x.regions[r].n, 0);
        const sum = s.reduce((t, x) => t + x.regions[r].sum, 0);
        return [r, { worst: sig(Math.max(...s.map((x) => x.regions[r].worst))), mean: sig(n ? sum / n : 0), points: n }];
      }),
    ) as SpiceOutputSummary["regions"];
    return {
      output,
      comparisons: s.length,
      points: regions.below.points + regions.around.points + regions.above.points,
      worst: sig(s[w]!.worst),
      worstCase: ids[w]!,
      worstHz: sig(s[w]!.worstHz, 4),
      regions,
      pass: s.every((x) => x.pass),
    };
  });
  return { cases: all.length, compared: cases.length, kinds, outputs: outs, showcase: SHOWCASE.map((x) => showcase.find((s) => s.id === x.id)!) };
}

export const spiceReportJson = (rep: SpiceReport) =>
  JSON.stringify(rep, null, 1)
    .replace(/\[\s*([^[\]{}]*?)\s*\]/g, (_, inner: string) => `[${inner.split(/,\s*/).join(",")}]`)
    .replace(/\{\s*([^{}[\]]*?)\s*\}/g, (_, inner: string) => `{ ${inner.split(/,\n\s*/).join(", ")} }`) + "\n";

export const readSpiceReport = (file = SPICE_REPORT_FILE) => JSON.parse(readFileSync(file, "utf8")) as SpiceReport;

/**
 * Null when `a` (committed) still describes `b` (fresh): same shape, strings, counts and pass
 * flags; a difference statistic within a factor of 2 (or both under 1e-12); a curve value within
 * 0.002. Otherwise the first path that differs.
 */
export function sameSpiceReport(a: unknown, b: unknown, path = "", curve = false): string | null {
  // Which case and frequency hold the worst value can change with a last-digit difference.
  if (/\.(worstCase|worstHz)$/.test(path)) return null;
  if (typeof a === "number" && typeof b === "number") {
    if (a === b) return null;
    if (/\.(points|comparisons|cases|compared)$|\.kinds\./.test(path)) return path;
    if (curve) return Math.abs(a - b) <= 0.002 ? null : path;
    if (Math.max(Math.abs(a), Math.abs(b)) < 1e-12) return null;
    return a / b <= 2 && b / a <= 2 ? null : path;
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return `${path} (length)`;
    for (let i = 0; i < a.length; i++) {
      const d = sameSpiceReport(a[i], b[i], `${path}[${i}]`, curve || path.endsWith(".points") && path.includes("showcase"));
      if (d) return d;
    }
    return null;
  }
  if (a && b && typeof a === "object" && typeof b === "object") {
    const ka = Object.keys(a), kb = Object.keys(b);
    if (ka.join() !== kb.join()) return `${path} (keys)`;
    for (const k of ka) {
      const d = sameSpiceReport((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k], `${path}.${k}`, curve);
      if (d) return d;
    }
    return null;
  }
  return a === b ? null : path || "(root)";
}

if (process.argv[1] && import.meta.filename === process.argv[1]) {
  mkdirSync(dirname(SPICE_REPORT_FILE), { recursive: true });
  const rep = buildSpiceReport();
  writeFileSync(SPICE_REPORT_FILE, spiceReportJson(rep));
  console.log(`Wrote ${SPICE_REPORT_FILE}: ${rep.compared} cases compared.`);
  for (const o of rep.outputs) console.log(`  ${o.pass ? "ok  " : "FAIL"} ${o.output}: worst ${o.worst} (${o.worstCase} at ${o.worstHz} Hz)`);
}
