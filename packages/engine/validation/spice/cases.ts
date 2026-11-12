/**
 * SPICE validation: a stratified, seeded generator of NEW candidate cases.
 *
 *   node --experimental-strip-types packages/engine/validation/spice/cases.ts <kind> <count> [seed]
 *
 * writes test/fixtures/spice/inputs/g-<kind>-<NNN>.json for kind sealed | vented | passive-radiator |
 * bp4 | bp6p | bp6s (bandpass: 4th order, 6th order parallel, 6th order series) | chain (a sealed or
 * ported box with a random high-pass, EQ stages and passive parts),
 * skipping ids that already exist. Committed inputs are never rewritten: database edits can't move
 * them. Every number a case needs (driver, PR, box, options, air) is resolved into the file.
 *
 * Strata (cycled, so every cell gets cases): Qts 0.15–0.25 / 0.25–0.4 / 0.4–0.6 / 0.6–0.8, and
 * Vb/Vas 0.3–0.6 / 0.6–1 / 1–2 / 2–4; tuned boxes also Fb/Fs 0.7–0.9 / 0.9–1.1 / 1.1–1.4; bandpass
 * boxes split the volume 30–70 % rear, tune the front 0.9–2.5 × Fs and a 6th order's rear 0.55–1 × Fs.
 * Drivers: Fs 15–120 Hz, Re 2–8 Ω, from the database.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { DriverInput, PassiveRadiatorInput, PortInput } from "../../src/model.ts";
import { airCompliance, DEFAULT_END_CORRECTION, prElements, type CaseAir, type CaseBox, type CaseOptions, type SpiceCase } from "./elements.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "../../../..");
const INPUTS = join(HERE, "../../test/fixtures/spice/inputs");
const TAU = 2 * Math.PI;

/** mulberry32: small, fast, deterministic. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface DbDriver {
  id: string;
  ts: DriverInput;
  qts: number;
}
function loadDrivers(): DbDriver[] {
  const out: DbDriver[] = [];
  const dir = join(ROOT, "drivers");
  for (const brand of readdirSync(dir).sort()) {
    const bdir = join(dir, brand);
    if (!existsSync(bdir) || brand.includes(".")) continue;
    for (const f of readdirSync(bdir).sort()) {
      if (!f.endsWith(".json") || f.startsWith("_")) continue;
      const t = JSON.parse(readFileSync(join(bdir, f), "utf8")).ts ?? {};
      if (!(t.fs > 0 && t.qms > 0 && t.qes > 0 && t.vas_l > 0 && t.re > 0 && t.sd_cm2 > 0)) continue;
      if (t.fs < 15 || t.fs > 120 || t.re < 2 || t.re > 8) continue;
      const ts: DriverInput = { fs: t.fs, qms: t.qms, qes: t.qes, vas_l: t.vas_l, re: t.re, sd_cm2: t.sd_cm2 };
      if (t.le_mh > 0) ts.le_mh = t.le_mh;
      out.push({ id: `${brand}/${f.replace(/\.json$/, "")}`, ts, qts: (t.qms * t.qes) / (t.qms + t.qes) });
    }
  }
  return out;
}
interface DbPr {
  id: string;
  pr: PassiveRadiatorInput;
}
function loadPrs(): DbPr[] {
  const out: DbPr[] = [];
  const dir = join(ROOT, "passive-radiators");
  for (const brand of readdirSync(dir).sort()) {
    if (brand.includes(".")) continue;
    for (const f of readdirSync(join(dir, brand)).sort()) {
      if (!f.endsWith(".json") || f.startsWith("_")) continue;
      const p = JSON.parse(readFileSync(join(dir, brand, f), "utf8")).params ?? {};
      if (!(p.mms_g > 0 && p.sd_cm2 > 0 && (p.cms_mm_per_n > 0 || p.vas_l > 0 || p.fs > 0))) continue;
      const pr: PassiveRadiatorInput = { mms_g: p.mms_g, sd_cm2: p.sd_cm2 };
      if (p.cms_mm_per_n > 0) pr.cms_mm_per_n = p.cms_mm_per_n;
      else if (p.vas_l > 0) pr.vas_l = p.vas_l;
      else pr.fs = p.fs;
      if (p.qms > 0) pr.qms = p.qms;
      out.push({ id: `${brand}/${f.replace(/\.json$/, "")}`, pr });
    }
  }
  return out;
}

const QTS = [[0.15, 0.25], [0.25, 0.4], [0.4, 0.6], [0.6, 0.8]] as const;
const RATIO = [[0.3, 0.6], [0.6, 1], [1, 2], [2, 4]] as const;
const TUNE = [[0.7, 0.9], [0.9, 1.1], [1.1, 1.4]] as const;
/** Air: standard, WinISD's, and 835 hPa / 25 °C / 40 % (resolved numbers). */
const AIRS: CaseAir[] = [
  { rho: 1.204, c: 343.2 },
  { rho: 1.20095217714682, c: 343.684120962152 },
  { rho: 0.970025563706117, c: 346.99403473723254 },
];

type Kind = "sealed" | "vented" | "passive-radiator" | "bp4" | "bp6p" | "bp6s" | "chain";
export const KINDS: Kind[] = ["sealed", "vented", "passive-radiator", "bp4", "bp6p", "bp6s", "chain"];
/** Bandpass front-chamber tuning (× Fs) and a 6th order's rear tuning. */
const TUNE_BP = [[0.9, 1.3], [1.3, 1.8], [1.8, 2.5]] as const;
const TUNE_REAR = [0.55, 1.0] as const;

export function generate(kind: Kind, count: number, seed: number, startIndex = 0): SpiceCase[] {
  const rand = rng(seed);
  const pick = <T>(a: readonly T[]) => a[Math.floor(rand() * a.length)]!;
  const between = (lo: number, hi: number) => lo + (hi - lo) * rand();
  const drivers = loadDrivers();
  const prs = loadPrs();
  /** A port (or two) tuning a chamber of compliance `cab` to `fb`; null if it won't fit. */
  const makePort = (fb: number, cab: number, sd: number, air: CaseAir) => {
    const portCount = rand() < 0.75 ? 1 : 2;
    const area = (between(0.05, 0.3) * sd) / portCount;
    const deq = 2 * Math.sqrt(area / Math.PI);
    const leff = (portCount * area) / (air.rho * (TAU * fb) ** 2 * cab);
    const length = leff - kPort * deq;
    if (!(length > 0.01 && length < 2)) return null;
    let port: PortInput;
    if (rand() < 0.3) {
      const h = Math.sqrt(area / between(2, 10));
      port = { shape: "slot", width_cm: round((area / h) * 100), height_cm: round(h * 100), length_cm: round(length * 100) };
    } else port = { shape: "round", diameter_cm: round(deq * 100), length_cm: round(length * 100) };
    return { port, ...(portCount > 1 ? { portCount } : {}) };
  };
  /** PRs (one kind, mass added) tuning a chamber to `fb`; null if none fits. */
  const makePrs = (fb: number, cab: number, sd: number, air: CaseAir) => {
    const prCount = pick([1, 1, 2, 2, 4]);
    const cands = prs.filter((p) => (prCount * p.pr.sd_cm2) / 1e4 >= 0.8 * sd && p.pr.sd_cm2 / 1e4 <= 2.5 * sd);
    if (cands.length === 0) return null;
    const p = pick(cands);
    const m = prElements(p.pr, 0, air);
    const k = 1 / m.cmp + (prCount * m.sd * m.sd) / cab;
    const added = (k / (TAU * fb) ** 2 - m.mmp) * 1000;
    if (!(added >= 0 && added <= 6 * p.pr.mms_g)) return null;
    return { id: p.id, pr: p.pr, count: prCount, addedMass_g: round(added) };
  };
  let kPort = DEFAULT_END_CORRECTION;
  const out: SpiceCase[] = [];
  let attempts = 0;
  for (let i = startIndex; out.length < count; i++) {
    if (++attempts > count * 200) throw new Error("generator: too many rejected draws");
    const cell = i % (QTS.length * RATIO.length);
    const [q0, q1] = QTS[cell % QTS.length]!;
    const [r0, r1] = RATIO[Math.floor(cell / QTS.length)]!;
    const pool = drivers.filter((d) => d.qts >= q0 && d.qts < q1);
    if (pool.length === 0) continue;
    const drv = pick(pool);
    const air = pick(AIRS);
    const vb_l = Math.min(1000, Math.max(0.5, between(r0, r1) * drv.ts.vas_l));
    const cab = airCompliance(vb_l, air);
    const lossChoice = rand();
    const losses =
      lossChoice < 0.4 ? {} : lossChoice < 0.55 ? { ql: null, qa: null } : { ql: Math.round(between(3, 30)), qa: rand() < 0.3 ? null : Math.round(between(10, 120)) };
    const sd = drv.ts.sd_cm2 / 1e4;
    let box: CaseBox;
    let tuneNote = "";
    // "chain": a sealed or ported box with a signal chain (high-pass, EQ, passive parts).
    const boxKind: Kind = kind === "chain" ? (rand() < 0.5 ? "sealed" : "vented") : kind;
    kPort = rand() < 0.7 ? DEFAULT_END_CORRECTION : pick([0.613, 0.85]);
    const ec = kPort !== DEFAULT_END_CORRECTION ? { endCorrection: kPort } : {};
    const qp = () => (rand() < 0.4 ? { qp: rand() < 0.3 ? null : Math.round(between(20, 150)) } : {});
    if (boxKind === "sealed") box = { kind: "sealed", vb_l: round(vb_l), ...losses };
    else if (boxKind === "vented" || boxKind === "passive-radiator") {
      const [h0, h1] = TUNE[i % TUNE.length]!;
      const fb = between(h0, h1) * drv.ts.fs;
      tuneNote = `, Fb ${fb.toFixed(1)} Hz`;
      if (boxKind === "vented") {
        const pt = makePort(fb, cab, sd, air);
        if (!pt) continue;
        box = { kind: "vented", vb_l: round(vb_l), ...pt, ...ec, ...losses, ...qp() };
      } else {
        const g = makePrs(fb, cab, sd, air);
        if (!g) continue;
        tuneNote += `, ${g.count} × ${g.id}`;
        const extra = rand() < 0.15 ? pick(prs.filter((x) => x.id !== g.id)) : null;
        box = {
          kind: "passive-radiator",
          vb_l: round(vb_l),
          pr: g.pr,
          ...(g.count > 1 ? { prCount: g.count } : {}),
          addedMass_g: g.addedMass_g,
          ...(extra ? { extraPrs: [{ pr: extra.pr, count: 1 }] } : {}),
          ...losses,
        };
        if (extra) tuneNote += ` + 1 × ${extra.id}`;
      }
    } else {
      // Bandpass: the total volume split between the chambers; the front tuned above Fs.
      const rearShare = between(0.3, 0.7);
      const vr = round(vb_l * rearShare);
      const vf = round(vb_l * (1 - rearShare));
      const [h0, h1] = TUNE_BP[i % TUNE_BP.length]!;
      const fFront = between(h0, h1) * drv.ts.fs;
      const usePr = rand() < 0.2;
      const chLoss = () => {
        const c = rand();
        return c < 0.4 ? {} : c < 0.55 ? { ql: null, qa: null } : { ql: Math.round(between(3, 30)), qa: rand() < 0.3 ? null : Math.round(between(10, 120)) };
      };
      const opening = (f: number, cabCh: number, pr: boolean) => {
        if (pr) {
          const g = makePrs(f, cabCh, sd, air);
          return g ? { prs: [{ pr: g.pr, count: g.count, addedMass_g: g.addedMass_g }], note: `${g.count} × ${g.id}` } : null;
        }
        const pt = makePort(f, cabCh, sd, air);
        return pt ? { ...pt, ...qp(), note: "port" } : null;
      };
      const front = opening(fFront, airCompliance(vf, air), usePr);
      if (!front) continue;
      let rear: object | null = {};
      let rearNote = "closed";
      if (kind !== "bp4") {
        const fRear = between(TUNE_REAR[0], TUNE_REAR[1]) * drv.ts.fs;
        const r = opening(fRear, airCompliance(vr, air), kind === "bp6p" && rand() < 0.2);
        if (!r) continue;
        rear = r;
        rearNote = `${r.note} at ${fRear.toFixed(1)} Hz`;
      }
      const strip = (o: { note?: string }) => {
        const { note: _n, ...rest } = o;
        void _n;
        return rest;
      };
      const qiclChoice = rand();
      box = {
        kind: "bandpass",
        rear: { vb_l: vr, ...strip(rear as { note?: string }), ...chLoss() },
        front: { vb_l: vf, ...strip(front), ...chLoss() },
        ...(kind === "bp6s" ? { rearPortTo: "front" as const } : {}),
        ...ec,
        ...(qiclChoice < 0.4 ? {} : qiclChoice < 0.6 ? { qicl: null } : { qicl: Math.round(between(20, 200)) }),
      } as CaseBox;
      tuneNote = `, rear ${vr} L ${rearNote}, front ${vf} L ${front.note} at ${fFront.toFixed(1)} Hz`;
    }
    const opts: CaseOptions = {};
    const o = rand();
    if (o < 0.15) opts.isobaric = { coils: pick(["series", "parallel"] as const) };
    else if (o < 0.35) {
      opts.drivers = pick([2, 2, 3, 4]);
      opts.wiring = pick(["parallel", "series"] as const);
    }
    opts.rg = pick([0, 0.1, 0.1, 0.5]);
    if (rand() < 0.2) opts.coilTemp_C = Math.round(between(40, 150));
    if (rand() < 0.25) opts.driveModel = "winisd";
    if (rand() < 0.2) {
      opts.convention = "volts";
      opts.power = 2.83;
    } else opts.power = pick([1, 1, 10, 100]);
    if (rand() < 0.1) opts.space = "full";
    if (rand() < 0.1) opts.distance_m = 2;
    if (kind === "chain") {
      const fs = drv.ts.fs;
      if (rand() < 0.7) {
        const lr = rand() < 0.3;
        opts.highPass = lr
          ? { type: "linkwitz-riley", order: pick([2, 4]), freq: round(between(0.4, 1) * fs) }
          : { type: "butterworth", order: pick([1, 2, 3, 4]), freq: round(between(0.4, 1) * fs) };
      }
      const eq: NonNullable<CaseOptions["eq"]> = [];
      const nEq = pick([0, 1, 1, 2, 3]);
      for (let k = 0; k < nEq; k++) {
        const t = pick(["peak", "lowshelf", "highshelf", "linkwitz"] as const);
        if (t === "linkwitz") eq.push({ type: "linkwitz", f0: round(between(1, 2) * fs), q0: round(between(0.5, 1.2)), fp: round(between(0.5, 1) * fs), qp: round(between(0.5, 0.8)) });
        else eq.push({ type: t, freq: round(between(20, 300)), gain_db: round(between(-9, 9)), q: round(between(0.5, 4)) });
      }
      if (eq.length) opts.eq = eq;
      if (rand() < 0.6) {
        const part = () => {
          const b: { r?: number; l_mH?: number; c_uF?: number; join?: "series" | "parallel" } = {};
          if (rand() < 0.6) b.r = round(between(0.2, 12));
          if (rand() < 0.5) b.l_mH = round(between(0.3, 8));
          if (rand() < 0.4) b.c_uF = round(between(10, 1000));
          if (rand() < 0.3) b.join = "parallel";
          return b;
        };
        opts.passive = { branches: [part(), part(), part(), part()].map((b) => (rand() < 0.5 ? b : {})) };
      }
      tuneNote += `${opts.highPass ? `, HP ${opts.highPass.type} ${opts.highPass.order}` : ""}${eq.length ? `, ${eq.length} EQ` : ""}${opts.passive ? ", passive parts" : ""}`;
    }
    const id = `g-${kind === "passive-radiator" ? "pr" : kind}-${String(startIndex + out.length + 1).padStart(3, "0")}`;
    const title = `${kind === "chain" ? `chain (${boxKind})` : kind}, ${drv.id} (Qts ${drv.qts.toFixed(2)}), ${round(vb_l)} L${tuneNote}`;
    out.push({ id, title, driver: drv.ts, box, opts, air, sweep: { perDecade: 50, fMin: 5, fMax: 2000 } });
  }
  return out;
}

function round(x: number) {
  return Number(x.toPrecision(4));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [kind, n, seed] = process.argv.slice(2);
  if (!kind || !KINDS.includes(kind as Kind)) throw new Error(`kind: ${KINDS.join(" | ")}`);
  mkdirSync(INPUTS, { recursive: true });
  let written = 0;
  for (const c of generate(kind as Kind, Number(n ?? 60), Number(seed ?? 20261110))) {
    const p = join(INPUTS, `${c.id}.json`);
    if (existsSync(p)) continue;
    writeFileSync(p, JSON.stringify(c, null, 2) + "\n");
    written++;
  }
  console.log(`wrote ${written} new ${kind} cases`);
}
