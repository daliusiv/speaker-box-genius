/**
 * Baffle FRD: a driver's half-space curve (.frd) put on the baffle from Signal → Baffle step,
 * saved back as an .frd for a crossover tool. The maths is in the engine (frd.ts, baffle.ts);
 * this file reads the file, names the downloads and checks the driver fits on the baffle.
 */
import { applyBaffle, baffleFrdHeader, baffleOnlyCurve, baffleTrustedTo, frdGrid, parseCurve, writeFrd, type Baffle, type Curve, type FrdCurve } from "@sbg/engine";
import type { OutFile } from "./formats/types.ts";

/** A loaded driver curve: its file name and points (phase when the file has a third column). */
export interface FrdFile {
  name: string;
  curve: Curve;
}

/** Cone diameter (mm) of a piston with this Sd (cm²), to one decimal. */
export function coneFromSd(sd_cm2: number | undefined): number {
  if (!(sd_cm2! > 0)) return 0;
  return Math.round(2 * Math.sqrt(sd_cm2! / Math.PI) * 100) / 10;
}

/** Sd (cm²) of a cone this many mm across. */
export const sdFromCone = (mm: number) => Math.PI * (mm / 20) ** 2;

/** Read an .frd / .txt response: frequency, dB and (if every line has it) phase. Impedance files are refused. */
export function readFrd(name: string, text: string): FrdFile {
  if (/\.zma$/i.test(name) || /\bohms?\b|Z\s*\(\s*ohm/i.test(text.slice(0, 2000)))
    throw new Error("This is an impedance file: load a frequency response (.frd) instead");
  return { name, curve: parseCurve(text, "spl", 10, { phase: true }) };
}

/** Why the cone can't sit there (an error to show, exports blocked), or null when it fits. */
export function fitProblem(b: Baffle, coneMm: number, outside: boolean): string | null {
  if (outside) return "The driver is off the baffle: check its position in Baffle step.";
  if (!(coneMm > 0)) return "Type the cone diameter.";
  const r = coneMm / 2000;
  if (2 * r > Math.min(b.width, b.height)) return "The cone is wider than the baffle.";
  if (b.x < r || b.x > b.width - r || b.y < r || b.y > b.height - r) return "The cone runs over the baffle's edge: move the driver in from the edge.";
  return null;
}

const cm = (m: number) => Number((m * 100).toPrecision(4)).toString();
const stem = (name: string) => name.replace(/\.[^.]+$/, "");

/** "L16RN on baffle 25x40.frd" */
export function frdFileName(source: string, b: Baffle): string {
  return `${stem(source)} on baffle ${cm(b.width)}x${cm(b.height)}.frd`;
}

/** "baffle 25x40 132 mm.frd" */
export function baffleOnlyFileName(b: Baffle, coneMm: number): string {
  return `baffle ${cm(b.width)}x${cm(b.height)} ${Number(coneMm.toPrecision(4))} mm.frd`;
}

/** The baffle this tool uses: the Baffle step's, with the cone typed here. */
export const withCone = (b: Baffle, coneMm: number): Baffle => ({ ...b, sd_cm2: sdFromCone(coneMm) });

/** The driver curve on the baffle. */
export const onBaffle = (f: FrdFile, b: Baffle): FrdCurve => applyBaffle(f.curve, b);

/** The baffle alone, on the file's frequencies or the 1/48-octave grid. */
export const baffleOnly = (b: Baffle, f: FrdFile | null): FrdCurve => baffleOnlyCurve(f ? f.curve.f : frdGrid(), b);

/** The driver curve on the baffle, as a file. */
export function frdDownload(b: Baffle, coneMm: number, f: FrdFile): OutFile {
  const bb = withCone(b, coneMm);
  const curve = onBaffle(f, bb);
  return { name: frdFileName(f.name, b), data: writeFrd(curve, baffleFrdHeader(bb, f.name, curve.phaseKind)), type: "text/plain" };
}

/** The baffle alone as a file (from ⋯), on the loaded file's frequencies when there is one. */
export function baffleOnlyDownload(b: Baffle, coneMm: number, f: FrdFile | null): OutFile {
  const bb = withCone(b, coneMm);
  const curve = baffleOnly(bb, f);
  return { name: baffleOnlyFileName(b, coneMm), data: writeFrd(curve, baffleFrdHeader(bb, null, curve.phaseKind)), type: "text/plain" };
}

export { baffleTrustedTo };
