/**
 * Whole-database sweep: every driver in the database through every box type, plus textbook
 * checks of the engine against closed-form results (Small's sealed and vented box transfer
 * functions, and two drivers in twice the volume).
 *
 * This fails only on app bugs: a crash, a blank (NaN/∞) curve, or a tuning the engine got
 * wrong. It never fails on a driver's specs being odd or inconsistent; that is the job of
 * the consistency checks in load.ts (`pnpm validate:db`).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadDatabase } from "../src/load.ts";
import {
  keeleAlignment,
  portLengthForFb,
  prAddedMassForFb,
  qb3Alignment,
  sealedVolumeForAlignment,
  simulate,
  type DriverInput,
  type EnclosureInput,
  type PortInput,
  type SimulationResult,
} from "../../engine/src/index.ts";

const db = loadDatabase();

type Ts = DriverInput & { qts?: number; xmax_mm?: number; pe_w?: number; mms_g?: number; bl?: number };

const drivers = db.drivers
  .map((e) => ({ id: e.id, ts: (e.data as { ts?: Ts }).ts }))
  .filter((d): d is { id: string; ts: Ts } => {
    const t = d.ts;
    return !!t && [t.fs, t.qms, t.qes, t.vas_l, t.re, t.sd_cm2].every((v) => Number.isFinite(v) && v > 0);
  });

const LOSSLESS = { ql: Infinity, qa: Infinity, qp: Infinity } as const;

/** Every curve the charts draw, checked for NaN and ∞. Returns the first bad one's name. */
function firstBadCurve(r: SimulationResult): string | null {
  const curves: [string, ArrayLike<number> | null | undefined][] = [
    ["spl", r.spl],
    ["phase", r.phaseDeg],
    ["group delay", r.groupDelayMs],
    ["excursion", r.excursionMm],
    ["impedance", r.impedanceOhm],
    ["impedance phase", r.impedancePhaseDeg],
    ["PR excursion", r.prExcursionMm],
    ["port velocity", r.portVelocity],
    ["rear port velocity", r.rearPortVelocity],
    ["box pressure", r.boxPressurePa],
    ["front chamber pressure", r.frontChamberPressurePa],
  ];
  for (const [name, c] of curves) {
    if (!c) continue;
    for (let i = 0; i < c.length; i++) if (!Number.isFinite(c[i])) return `${name} at ${r.freq[i]!.toFixed(1)} Hz is ${c[i]}`;
  }
  // Max power and max SPL are left blank (∞ and NaN) only where no limit applies: a driver
  // with no Xmax or power rating, say.
  for (let i = 0; i < r.freq.length; i++) {
    if (r.limitedBy[i] === "none") continue;
    for (const [name, c] of [["max power", r.maxPowerW], ["max SPL", r.maxSpl]] as const) {
      if (!Number.isFinite(c[i])) return `${name} at ${r.freq[i]!.toFixed(1)} Hz is ${c[i]} (limited by ${r.limitedBy[i]})`;
    }
  }
  if (!Number.isFinite(r.summary.referenceSpl)) return `reference SPL is ${r.summary.referenceSpl}`;
  return null;
}

/** A round port that reaches `fb` in `vb_l`, at least 2 cm long: shrinks the diameter if it has to. */
function portFor(vb_l: number, fb: number, sd_cm2: number): PortInput {
  let diameter_cm = Math.max(2, Math.sqrt(sd_cm2) * 0.6);
  for (let i = 0; i < 20; i++) {
    const length_cm = portLengthForFb(vb_l, { shape: "round", diameter_cm, length_cm: 10 }, fb);
    if (length_cm >= 2) return { shape: "round", diameter_cm, length_cm };
    diameter_cm *= 0.8;
  }
  return { shape: "round", diameter_cm, length_cm: 2 };
}

/** The vented tuning the app would suggest: QB3 if the driver allows, Keele, else Vb = Vas at Fs. */
function ventedTuning(t: Ts): { vb_l: number; fb: number } {
  const a = qb3Alignment(t) ?? keeleAlignment(t);
  return a ? { vb_l: a.vb_l, fb: a.fb } : { vb_l: t.vas_l, fb: t.fs };
}

/**
 * Where a vented or PR box is really tuned: the impedance dip between its two peaks, found on a
 * fine sweep with no voice-coil inductance (which would nudge the dip). Of the dips in the
 * sweep, the one nearest the intended tuning.
 */
function measuredTuning(t: Ts, box: EnclosureInput, fb: number): number {
  const r = simulate({ ...t, le_mh: 0 }, box, { fMin: fb / 3, fMax: fb * 3, points: 300 });
  const z = r.impedanceOhm;
  let best = NaN;
  for (let i = 1; i < z.length - 1; i++) {
    if (z[i]! <= z[i - 1]! && z[i]! <= z[i + 1]! && !(Math.abs(Math.log(r.freq[i]! / fb)) >= Math.abs(Math.log(best / fb)))) best = r.freq[i]!;
  }
  return best;
}

/**
 * The boxes each driver is run through, with the tuning a vented or PR box should land on and
 * how close (as a fraction) its impedance dip must be. A PR's own losses (Qms 10) nudge its dip.
 */
function boxesFor(t: Ts): { name: string; box: EnclosureInput; fb?: number; tol?: number }[] {
  const vsealed = sealedVolumeForAlignment(t, 0.707) ?? t.vas_l;
  const v = ventedTuning(t);
  // A PR 1.5× the driver's area, with a compliance of its own (Vas = 2·Vb) and 60 % of the
  // moving mass the tuning needs; added mass makes up the rest.
  const base = { sd_cm2: t.sd_cm2 * 1.5, vas_l: v.vb_l * 2, qms: 10, xmax_mm: 15 };
  const needed = prAddedMassForFb(v.vb_l, { ...base, mms_g: 1 }, v.fb);
  const pr = { ...base, mms_g: Math.max(1, 1 + needed * 0.6) };
  const added = prAddedMassForFb(v.vb_l, pr, v.fb);
  const front = Math.max(1, v.vb_l * 0.5);
  return [
    { name: "sealed", box: { kind: "sealed", vb_l: vsealed } },
    { name: "vented", box: { kind: "vented", vb_l: v.vb_l, port: portFor(v.vb_l, v.fb, t.sd_cm2), ...LOSSLESS }, fb: v.fb, tol: 0.02 },
    {
      name: "passive radiator",
      box: { kind: "passive-radiator", vb_l: v.vb_l, pr, addedMass_g: Math.max(0, added), ...LOSSLESS },
      fb: added >= 0 ? v.fb : undefined,
      tol: 0.05,
    },
    {
      name: "bandpass 4th order",
      box: { kind: "bandpass", rear: { vb_l: vsealed }, front: { vb_l: front, port: portFor(front, v.fb * 1.6, t.sd_cm2) } },
    },
  ];
}

test(`every database driver simulates cleanly in every box type (${drivers.length} drivers)`, () => {
  assert.ok(drivers.length > 1000, `only ${drivers.length} drivers with full specs`);
  const failures: string[] = [];
  for (const { id, ts } of drivers) {
    for (const { name, box, fb, tol = 0.02 } of boxesFor(ts)) {
      let r: SimulationResult;
      try {
        r = simulate(ts, box, { fMin: 5, fMax: 2000, points: 100, power: ts.pe_w ?? 1 });
      } catch (e) {
        failures.push(`${id} ${name}: threw ${(e as Error).message}`);
        continue;
      }
      const bad = firstBadCurve(r);
      if (bad) failures.push(`${id} ${name}: ${bad}`);
      else if (fb !== undefined) {
        // The box is tuned where we asked: the impedance dip sits at Fb (lossless box).
        const dip = measuredTuning(ts, box, fb);
        if (Math.abs(dip / fb - 1) > tol) failures.push(`${id} ${name}: tuned to ${fb.toFixed(1)} Hz but the impedance dip is at ${dip.toFixed(1)} Hz`);
      }
    }
  }
  assert.deepEqual(failures.slice(0, 20), [], `${failures.length} failures`);
});

// ---------------------------------------------------------------------------
// Textbook checks: lossless boxes with no voice-coil inductance, against closed-form results.
// ---------------------------------------------------------------------------

const qtsOf = (t: Ts) => (t.qms * t.qes) / (t.qms + t.qes);
const dB = (x: number) => 20 * Math.log10(x);
/** Largest gap (dB) between the engine's response, relative to its passband, and `ideal` (dB). */
function worstGap(r: SimulationResult, ideal: (f: number) => number): number {
  let w = 0;
  for (let i = 0; i < r.freq.length; i++) w = Math.max(w, Math.abs(r.spl[i]! - r.summary.referenceSpl - ideal(r.freq[i]!)));
  return w;
}

test("sealed boxes match Small's 2nd-order high-pass (Fc = Fs·√(1+α), Qtc = Qts·√(1+α)) for every driver", () => {
  const failures: string[] = [];
  for (const { id, ts } of drivers) {
    const vb = sealedVolumeForAlignment(ts, 0.707);
    if (!vb) continue;
    const alpha = ts.vas_l / vb;
    const fc = ts.fs * Math.sqrt(1 + alpha);
    const qtc = qtsOf(ts) * Math.sqrt(1 + alpha);
    const r = simulate({ ...ts, le_mh: 0 }, { kind: "sealed", vb_l: vb, ...LOSSLESS }, { fMin: fc / 4, fMax: fc * 4, points: 40 });
    const gap = worstGap(r, (f) => {
      const x = f / fc;
      return dB((x * x) / Math.hypot(1 - x * x, x / qtc));
    });
    const s = r.summary;
    if (gap > 0.01) failures.push(`${id}: response off by ${gap.toFixed(3)} dB`);
    else if (Math.abs(s.fc! / fc - 1) > 1e-3 || Math.abs(s.qtc! / qtc - 1) > 1e-3) failures.push(`${id}: Fc ${s.fc} Qtc ${s.qtc}, expected ${fc} and ${qtc}`);
    else if (Math.abs(qtc - 0.707) < 0.01 && Math.abs(s.f3! / fc - 1) > 0.01) failures.push(`${id}: Butterworth F3 ${s.f3} ≠ Fc ${fc}`);
  }
  assert.deepEqual(failures.slice(0, 20), [], `${failures.length} failures`);
});

test("vented QB3 boxes match Thiele and Small's 4th-order high-pass for every driver that allows QB3", () => {
  const failures: string[] = [];
  let checked = 0;
  for (const { id, ts } of drivers) {
    const a = qb3Alignment(ts);
    if (!a) continue;
    checked++;
    const box: EnclosureInput = { kind: "vented", vb_l: a.vb_l, port: portFor(a.vb_l, a.fb, ts.sd_cm2), ...LOSSLESS };
    const r = simulate({ ...ts, le_mh: 0 }, box, { fMin: ts.fs / 4, fMax: ts.fs * 4, points: 40 });
    // G(s) = s⁴T⁴ / (s⁴T⁴ + a1·s³T³ + a2·s²T² + a3·sT + 1), T = 1/√(ωs·ωb), with no box losses.
    const h = a.fb / ts.fs;
    const alpha = ts.vas_l / a.vb_l;
    const q = qtsOf(ts);
    const [a1, a2, a3] = [1 / (Math.sqrt(h) * q), (alpha + 1 + h * h) / h, Math.sqrt(h) / q];
    const gap = worstGap(r, (f) => {
      const w = f / Math.sqrt(ts.fs * a.fb);
      return dB(w ** 4 / Math.hypot(w ** 4 - a2 * w * w + 1, a3 * w - a1 * w ** 3));
    });
    if (gap > 0.01) failures.push(`${id}: response off by ${gap.toFixed(3)} dB`);
  }
  assert.ok(checked > 500, `only ${checked} drivers checked`);
  assert.deepEqual(failures.slice(0, 20), [], `${failures.length} failures`);
});

test("two drivers in twice the volume: +6.02 dB in parallel at the same voltage, the same response in series", () => {
  const failures: string[] = [];
  for (const { id, ts } of drivers.filter((_, i) => i % 10 === 0)) {
    const v = ventedTuning(ts);
    const one = { kind: "vented", vb_l: v.vb_l, port: portFor(v.vb_l, v.fb, ts.sd_cm2) } as const;
    const two = { ...one, vb_l: 2 * v.vb_l, portCount: 2 };
    const o = { fMin: 10, fMax: 1000, points: 40, convention: "volts", power: 2.83 } as const;
    const r1 = simulate(ts, one, o);
    const rp = simulate(ts, two, { ...o, drivers: 2, wiring: "parallel" });
    const rs = simulate(ts, two, { ...o, drivers: 2, wiring: "series" });
    let wp = 0, ws = 0, wx = 0;
    for (let i = 0; i < r1.freq.length; i++) {
      wp = Math.max(wp, Math.abs(rp.spl[i]! - r1.spl[i]! - dB(2)));
      ws = Math.max(ws, Math.abs(rs.spl[i]! - r1.spl[i]!));
      // In parallel each driver sees the same voltage, so each cone moves as far as the single one.
      wx = Math.max(wx, Math.abs(rp.excursionMm[i]! / r1.excursionMm[i]! - 1));
    }
    if (wp > 0.01 || ws > 0.01 || wx > 1e-6) failures.push(`${id}: parallel off by ${wp.toFixed(3)} dB, series by ${ws.toFixed(3)} dB, excursion by ${(wx * 100).toFixed(2)} %`);
  }
  assert.deepEqual(failures.slice(0, 20), [], `${failures.length} failures`);
});
