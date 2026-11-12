/**
 * SPICE validation: run netlists through mna.py (batch, one process) or ngspice, and turn the raw
 * node voltages and currents into the engine's outputs.
 */
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Probes } from "./netlist.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
export const MNA_PY = join(HERE, "mna.py");

export type C = [number, number];
export interface RawResult {
  freq: number[];
  v: Record<string, C[]>;
  i: Record<string, C[]>;
  residual?: number;
}

/** Solve every netlist file in one python3 process. */
export function runMna(paths: string[], all = false): Record<string, RawResult> {
  const args = [MNA_PY, ...(all ? ["--all"] : []), ...paths];
  const out = execFileSync("python3", args, { encoding: "utf8", maxBuffer: 1 << 30 });
  return JSON.parse(out) as Record<string, RawResult>;
}

/** Netlist text → mna.py result, through a temporary file. */
export function runMnaText(texts: string[], all = false): RawResult[] {
  const dir = mkdtempSync(join(tmpdir(), "sbg-spice-"));
  try {
    const paths = texts.map((t, k) => {
      const p = join(dir, `c${k}.cir`);
      writeFileSync(p, t);
      return p;
    });
    const res = runMna(paths, all);
    return paths.map((p) => res[p]!);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** Through a wrapper deck that includes the netlist and writes the probes with wrdata (real, imaginary pairs). Needs `ngspice` on the PATH. */
/**
 * Run one plain netlist in ngspice (batch mode). By default every frequency is its own analysis
 * ("reset" + ".ac lin 1 f f"), so ngspice factorises the matrix afresh at each point: in one
 * sweep it reuses the first pivot order, and on a few stiff circuits that lost accuracy at single
 * points (Sparse 1.3, the default here: 12 % at one point of a bandpass box; KLU: 3.6 %), while
 * each point alone agreed with mna.py to 1e-13. `sweep: true` runs the netlist's own .ac line.
 */
export function runNgspice(
  cirPath: string,
  probes: Probes,
  extra: { options?: string[]; log?: (s: string) => void; sweep?: boolean; freqs?: number[] } = {},
): RawResult {
  const dir = mkdtempSync(join(tmpdir(), "sbg-ngspice-"));
  try {
    const v = [probes.terminals, probes.pressure, probes.excursion, probes.portSpeed, probes.rearPortSpeed, probes.boxPressure, probes.frontPressure, ...probes.prExcursion].filter((x): x is string => !!x);
    const i = [probes.coilSense, probes.cone, probes.port, probes.leak, ...probes.prs].filter((x): x is string => !!x);
    const vecs = [...v.map((n) => `v(${n})`), ...i.map((s) => `i(${s.toLowerCase()})`)];
    const out = join(dir, "out.txt");
    const deck = [
      "* wrapper",
      `.include ${cirPath}`,
      ...(extra.options ?? []),
      ".control",
      "set wr_singlescale",
      ...(extra.sweep || !extra.freqs ? ["set wr_vecnames"] : []),
      "set numdgt=15",
      "option numdgt=15",
      ...(extra.sweep || !extra.freqs
        ? ["run", `wrdata ${out} ${vecs.join(" ")}`]
        : ["set appendwrite", ...extra.freqs.flatMap((f) => ["reset", `ac lin 1 ${f} ${f}`, `wrdata ${out} ${vecs.join(" ")}`])]),
      ".endc",
      ".end",
    ].join("\n");
    const deckPath = join(dir, "run.cir");
    writeFileSync(deckPath, deck);
    const run = spawnSync("ngspice", ["-b", deckPath], { encoding: "utf8" });
    if (run.status !== 0) throw new Error(`ngspice failed (${run.status}): ${run.stderr}`);
    extra.log?.(`${run.stdout}\n${run.stderr}`);
    const lines = readFileSync(out, "utf8").trim().split("\n");
    const res: RawResult = { freq: [], v: {}, i: {} };
    for (const n of v) res.v[n.toLowerCase()] = [];
    for (const s of i) res.i[s.toLowerCase()] = [];
    // Read numbers with a pattern, not by splitting on spaces: at 15 digits wrdata's columns can
    // touch when a value is negative ("1.2e-01-5.6e-02"), which shifted a row's columns.
    const NUM = /[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/g;
    for (const line of extra.sweep || !extra.freqs ? lines.slice(1) : lines) {
      const t = (line.match(NUM) ?? []).map(Number);
      if (t.length !== 1 + 2 * vecs.length) throw new Error(`ngspice wrdata row has ${t.length} numbers, expected ${1 + 2 * vecs.length}: ${line}`);
      res.freq.push(t[0]!);
      // With wr_singlescale: frequency, then re/im per vector.
      vecs.forEach((name, k) => {
        const z: C = [t[1 + 2 * k]!, t[2 + 2 * k]!];
        if (name.startsWith("v(")) res.v[name.slice(2, -1)]!.push(z);
        else res.i[name.slice(2, -1)]!.push(z);
      });
    }
    return res;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const cabs = (z: C) => Math.hypot(z[0], z[1]);
const carg = (z: C) => Math.atan2(z[1], z[0]);
const cdiv = (a: C, b: C): C => {
  const d = b[0] * b[0] + b[1] * b[1];
  return [(a[0] * b[0] + a[1] * b[1]) / d, (a[1] * b[0] - a[0] * b[1]) / d];
};

/** The engine's outputs, from a raw solution. */
export interface Outputs {
  freq: number[];
  spl: number[];
  phaseDeg: number[];
  groupDelayMs: number[];
  impedanceOhm: number[];
  impedancePhaseDeg: number[];
  excursionMm: number[];
  portVelocity: number[] | null;
  boxPressurePa: number[] | null;
  rearPortVelocity: number[] | null;
  frontChamberPressurePa: number[] | null;
  /** Excursion of one PR (mm), per group. */
  prGroupsMm: number[][];
}

/** Wrap to (−180, 180]. */
export const wrapDeg = (a: number) => ((((a + 180) % 360) + 360) % 360) - 180;

/** Group delay (ms) by the engine's own method: unwrap, then central differences (one-sided at the ends). */
export function groupDelay(freq: number[], phaseRad: number[]): number[] {
  const u = phaseRad.slice();
  for (let k = 1; k < u.length; k++) {
    let d = u[k]! - u[k - 1]!;
    while (d > Math.PI) d -= 2 * Math.PI;
    while (d < -Math.PI) d += 2 * Math.PI;
    u[k] = u[k - 1]! + d;
  }
  const n = u.length;
  return u.map((_, k) => {
    const a = Math.max(0, k - 1);
    const b = Math.min(n - 1, k + 1);
    return (-(u[b]! - u[a]!) / (2 * Math.PI * (freq[b]! - freq[a]!))) * 1000;
  });
}

export function outputs(raw: RawResult, probes: Probes): Outputs {
  const v = (n: string) => raw.v[n.toLowerCase()]!;
  const i = (s: string) => raw.i[s.toLowerCase()]!;
  const p = v(probes.pressure);
  // Ledger #14, #25: the cone's flow is counted into the box, so the reported phase is turned round (not for bandpass).
  const phaseRad = p.map((z) => carg(z) + (probes.phaseFlip ? Math.PI : 0));
  const z = v(probes.terminals).map((vv, k) => cdiv(vv, i(probes.coilSense)[k]!));
  return {
    freq: raw.freq,
    spl: p.map((zz) => 20 * Math.log10(cabs(zz) / 2e-5)),
    phaseDeg: phaseRad.map((a) => wrapDeg((a * 180) / Math.PI)),
    groupDelayMs: groupDelay(raw.freq, phaseRad),
    impedanceOhm: z.map(cabs),
    impedancePhaseDeg: z.map((zz) => (carg(zz) * 180) / Math.PI),
    excursionMm: v(probes.excursion).map((zz) => Math.SQRT2 * cabs(zz) * 1000),
    portVelocity: probes.portSpeed ? v(probes.portSpeed).map((zz) => Math.SQRT2 * cabs(zz)) : null,
    boxPressurePa: probes.boxPressure ? v(probes.boxPressure).map((zz) => Math.SQRT2 * cabs(zz)) : null,
    rearPortVelocity: probes.rearPortSpeed ? v(probes.rearPortSpeed).map((zz) => Math.SQRT2 * cabs(zz)) : null,
    frontChamberPressurePa: probes.frontPressure ? v(probes.frontPressure).map((zz) => Math.SQRT2 * cabs(zz)) : null,
    prGroupsMm: probes.prExcursion.map((n) => v(n).map((zz) => Math.SQRT2 * cabs(zz) * 1000)),
  };
}
