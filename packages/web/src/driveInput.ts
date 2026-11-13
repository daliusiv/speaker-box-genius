export type Drive = "watts" | "volts";

/** Limits the drive bar's slider and typed values share. */
export const DRIVE_LIMITS = { watts: { min: 1, max: 10000 }, volts: { min: 0.1, max: 100 } } as const;

/** Round a typed drive the way the slider does: watts to 0.1 W, volts to 3 figures. */
export function roundDrive(drive: Drive, v: number): number {
  const { min, max } = DRIVE_LIMITS[drive];
  const c = Math.min(max, Math.max(min, v));
  return drive === "volts" ? Number(c.toPrecision(3)) : Math.round(c * 10) / 10;
}

/** A typed value ("12,5", "100 W") as a number, or null when it isn't one. */
export function parseDrive(text: string): number | null {
  const v = Number(text.replace(",", ".").replace(/[^\d.]/g, ""));
  return text.trim() !== "" && Number.isFinite(v) && v > 0 ? v : null;
}
