/**
 * A driver's frequency response (.frd) put on a baffle: the half-space curve a datasheet or a
 * ground-plane / infinite-baffle measurement gives, times the baffle's edge-diffraction transfer
 * (baffle.ts), and written back out as an .frd for a crossover tool (VituixCAD, XSim, …).
 *
 * The input is taken as a half-space (2π) curve. A curve measured on a test baffle already has
 * some of that baffle's diffraction in it; that isn't taken out.
 */

import { baffleTransfer, baffleTrustedTo, type Baffle } from "./baffle.ts";
import type { Curve } from "./measured.ts";

/** A curve with phase, saying where the phase came from. */
export interface FrdCurve extends Curve {
  phase: number[];
  /** "measured": the file's phase plus the baffle's; "diffraction-only": the file had none, so only the baffle's. */
  phaseKind: "measured" | "diffraction-only";
}

const deg = (re: number, im: number) => (Math.atan2(im, re) * 180) / Math.PI;

/** Wrap an angle into (−180, 180] degrees, as measurement tools write it. */
function wrap(d: number): number {
  let x = ((d + 180) % 360 + 360) % 360 - 180;
  if (x === -180) x = 180;
  return x;
}

/**
 * The curve on this baffle: dB + 20·log10|H|, phase + arg H (or arg H alone when the curve has
 * no phase). Same frequencies as the input; nothing is extrapolated.
 */
export function applyBaffle(curve: Curve, b: Baffle): FrdCurve {
  const { re, im } = baffleTransfer(curve.f, b);
  const v = curve.v.map((x, i) => x + 10 * Math.log10(re[i]! * re[i]! + im[i]! * im[i]!));
  const has = curve.phase !== undefined && curve.phase.length === curve.f.length;
  const phase = curve.f.map((_, i) => wrap((has ? curve.phase![i]! : 0) + deg(re[i]!, im[i]!)));
  return { f: [...curve.f], v, phase, phaseKind: has ? "measured" : "diffraction-only" };
}

/** Frequencies 1/48 octave apart from 10 Hz to 20 kHz (the baffle-only file when no curve is loaded). */
export function frdGrid(): number[] {
  const out: number[] = [];
  const n = Math.round(48 * Math.log2(20000 / 10));
  for (let i = 0; i <= n; i++) out.push(10 * 2 ** (i / 48));
  return out;
}

/** The baffle alone (dB = 20·log10|H|, phase = arg H), to stack on a driver curve elsewhere. */
export function baffleOnlyCurve(freqs: readonly number[], b: Baffle): FrdCurve {
  return { ...applyBaffle({ f: [...freqs], v: freqs.map(() => 0) }, b), phaseKind: "diffraction-only" };
}

const sig = (x: number) => Number(x.toPrecision(5)).toString();

/** What the file header says about the baffle, the cone and how far the result can be trusted. */
export function baffleFrdHeader(b: Baffle, source: string | null, phaseKind: FrdCurve["phaseKind"]): string[] {
  const cm = (m: number) => sig(m * 100);
  const cone = b.sd_cm2! > 0 ? `${sig(2 * Math.sqrt(b.sd_cm2! / Math.PI) * 10)} mm` : "point source";
  return [
    `Baffle ${cm(b.width)} x ${cm(b.height)} cm, driver ${cm(b.x)} cm from left, ${cm(b.y)} cm from top`,
    `Cone ${cone}, listening distance ${sig(b.distance ?? 1)} m on axis`,
    source ? `Driver curve: ${source} (taken as half space)` : "Baffle only (relative to half space)",
    phaseKind === "measured" ? "Phase: the file's phase plus the baffle's" : "Phase: diffraction only (use minimum phase for the driver)",
    `Approximate above ${Math.round(baffleTrustedTo(b))} Hz (cone beaming not modelled)`,
  ];
}

/** An .frd file: "*" comment lines, then frequency, dB and phase (degrees), tab-separated, CRLF. */
export function writeFrd(curve: FrdCurve, header: readonly string[]): string {
  const lines = [...header.map((h) => `* ${h}`), "* Freq(Hz)\tSPL(dB)\tPhase(degrees)"];
  for (let i = 0; i < curve.f.length; i++) lines.push(`${sig(curve.f[i]!)}\t${sig(curve.v[i]!)}\t${sig(curve.phase[i]!)}`);
  return lines.join("\r\n") + "\r\n";
}
