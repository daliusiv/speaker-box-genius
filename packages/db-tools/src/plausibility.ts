/**
 * Plausibility checks: values that pass the schema's ranges but look wrong for this
 * particular driver, such as a peak-to-peak Xmax entered as one-way, or a nominal size
 * that doesn't match the cone area. They don't fail CI. They go on a review list
 * (`pnpm db:review`), and the app and the driver pages flag the affected values until
 * someone checks them against the datasheet.
 *
 * When a flagged value turns out to be right, add a `plausibility_note` to the record
 * saying so (e.g. "Xmax 19 mm confirmed on the datasheet: a long-throw 3-inch design");
 * that clears the flag.
 *
 * Thresholds come from the database itself (Nov 2026, 1,567 drivers and PRs with Xmax and
 * Sd): Xmax / effective cone diameter is 0.004–0.11 for drivers (long-throw 4–8 inch
 * drivers sit at the top) and up to 0.17 for passive radiators.
 */
import type { Driver, PassiveRadiator } from "../../schema/src/index.ts";

export type FlagCode = "xmax-high" | "xmax-low" | "size-sd";

export interface Flag {
  code: FlagCode;
  message: string;
}

/** Xmax / effective cone diameter above this is very likely peak-to-peak or a typo. */
export const XMAX_RATIO_HIGH = { driver: 0.15, pr: 0.25 } as const;
/** Below this, for a bass driver: likely a typo, inches, or the voice-coil overhang. */
export const XMAX_RATIO_LOW = 0.004;
/** Effective cone diameter / nominal size outside this range: wrong size or wrong Sd units. */
export const SIZE_RATIO = [0.5, 1.2] as const;

const BASS_TYPES = new Set(["woofer", "subwoofer", "midbass", "car-audio"]);

/** Effective cone diameter (mm) from Sd (cm²). */
export const coneDiameterMm = (sd_cm2: number) => 2 * Math.sqrt(sd_cm2 / Math.PI) * 10;

const f1 = (v: number) => (Math.round(v * 10) / 10).toString();

function check(kind: "driver" | "pr", xmax: number | undefined, sd: number, size_in: number | undefined, type: string): Flag[] {
  const flags: Flag[] = [];
  const dia = coneDiameterMm(sd);
  if (xmax !== undefined && dia > 0) {
    const r = xmax / dia;
    if (r > XMAX_RATIO_HIGH[kind]) {
      flags.push({
        code: "xmax-high",
        message:
          `Xmax ${f1(xmax)} mm is very large for a ${f1(dia)} mm cone (${(r * 100).toFixed(0)} % of its diameter). ` +
          `If the datasheet gives it peak-to-peak, the one-way value is ${f1(xmax / 2)} mm.`,
      });
    } else if (kind === "driver" && BASS_TYPES.has(type) && r < XMAX_RATIO_LOW) {
      flags.push({
        code: "xmax-low",
        message: `Xmax ${f1(xmax)} mm is very small for a ${f1(dia)} mm bass driver. Check it isn't in inches or the coil overhang.`,
      });
    }
  }
  if (size_in !== undefined && dia > 0) {
    const q = dia / 25.4 / size_in;
    if (q < SIZE_RATIO[0] || q > SIZE_RATIO[1]) {
      flags.push({
        code: "size-sd",
        message: `Sd ${f1(sd)} cm² means a ${f1(dia / 25.4)}-inch effective cone, which doesn't match the ${size_in}-inch size. Check Sd and the size.`,
      });
    }
  }
  return flags;
}

export function driverFlags(d: Driver): Flag[] {
  if (d.plausibility_note) return [];
  return check("driver", d.ts.xmax_mm, d.ts.sd_cm2, d.size_in, d.type);
}

export function passiveRadiatorFlags(p: PassiveRadiator): Flag[] {
  if (p.plausibility_note) return [];
  return check("pr", p.params.xmax_mm, p.params.sd_cm2, p.size_in, "passive-radiator");
}

/** True when a flag puts the Xmax itself in doubt (the design assistant leaves those drivers out). */
export const doubtsXmax = (codes: readonly string[] | undefined) => !!codes?.some((c) => c === "xmax-high" || c === "xmax-low");
