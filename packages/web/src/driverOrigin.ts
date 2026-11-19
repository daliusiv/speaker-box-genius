import type { TsValues } from "@sbg/engine";
import type { LoadedDriver } from "./library.ts";
import type { AppState, PrParams } from "./state.ts";
import { fromDatabase } from "./driverName.ts";
import { driverExtras } from "./importReport.ts";

/**
 * A driver loaded from the database keeps its id in the project (`driverOrigin`), so its
 * published values can be shown and restored after a reload or from a shared link. These
 * helpers compare a driver's fields with the database's and put them back.
 */

/** The fields a driver slot has (the main driver's, or the comparison driver's). */
export type DriverFields = Pick<AppState, "driverName" | "driverOrigin" | "nominal_ohms" | "ts" | "le_mh" | "l2_mh" | "r2_ohm" | "semi" | "fdd" | "xmax_mm" | "pe_w" | "dvc">;

/** What the app needs of a database driver while it's in use: its name, published values and specs link. */
export interface DriverSource {
  id: string;
  name: string;
  ts: TsValues;
  url?: string;
  via?: "driver-base";
}

/** Database drivers fetched this session, by id; null while loading or when it couldn't be loaded. */
export type LoadedDrivers = Readonly<Record<string, LoadedDriver | null>>;

/** The database driver a slot's values came from, once it has been fetched. */
export function sourceFor(id: string | undefined, loaded: LoadedDrivers): DriverSource | null {
  const d = id ? loaded[id] : undefined;
  return d && id ? { id, name: d.name, ts: d.ts, ...d.source } : null;
}

/**
 * The fields a reset restores: what loading the driver set (as `withDriver`), except the
 * volume calculator's displacement, cutout and depth (often changed on purpose), the number of
 * drivers and how they and the coils are wired.
 */
/**
 * `borrow`: the comparison driver, which has no Xmax or Pe field of its own, keeps the ones it
 * borrowed from the main driver when its entry has none (as `compareWith`); the main driver's
 * stay unset.
 */
export function databaseFields(s: DriverFields, d: LoadedDriver, borrow = false): Omit<DriverFields, "driverName" | "driverOrigin"> {
  const x = driverExtras(d, { le: false });
  return {
    nominal_ohms: x.nominal_ohms,
    ts: d.ts,
    le_mh: d.le_mh ?? 0,
    l2_mh: d.l2_mh ?? 0,
    r2_ohm: d.r2_ohm ?? 0,
    semi: undefined,
    fdd: undefined,
    xmax_mm: borrow && d.xmax_mm === undefined ? s.xmax_mm : x.xmax_mm,
    pe_w: borrow && d.pe_w === undefined ? s.pe_w : x.pe_w,
    dvc: d.dvcWiring ? { on: true, entered: d.dvcWiring, wired: s.dvc.wired } : { ...s.dvc, on: false },
  };
}

const close = (a: number, b: number) => a === b || Math.abs(a - b) <= 1e-9 * Math.max(Math.abs(a), Math.abs(b));

/** Equal values; numbers within rounding noise; a missing key equals undefined. */
function same(a: unknown, b: unknown): boolean {
  if (typeof a === "number" && typeof b === "number") return close(a, b);
  if (a && b && typeof a === "object" && typeof b === "object") {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    for (const k of keys) if (!same((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k])) return false;
    return true;
  }
  return a === b;
}

/** Labels of the fields that differ from the database's (empty: unchanged). */
export function changedFields(s: DriverFields, d: LoadedDriver, borrow = false): string[] {
  const want = databaseFields(s, d, borrow);
  const label: Record<keyof typeof want, string> = {
    nominal_ohms: "impedance",
    ts: "T/S",
    le_mh: "Le",
    l2_mh: "coil model",
    r2_ohm: "coil model",
    semi: "coil model",
    fdd: "damping",
    xmax_mm: "Xmax",
    pe_w: "Pe",
    dvc: "coils",
  };
  const out: string[] = [];
  for (const k of Object.keys(want) as (keyof typeof want)[]) {
    if (k === "dvc" ? !same({ on: s.dvc.on, entered: s.dvc.on ? s.dvc.entered : undefined }, { on: want.dvc.on, entered: want.dvc.on ? want.dvc.entered : undefined }) : !same(s[k], want[k])) {
      if (!out.includes(label[k])) out.push(label[k]);
    }
  }
  return out;
}

/** The slot's database driver and what was changed, while the slot is still that driver (its name unchanged or "(edited)"). */
export function modification(s: DriverFields, loaded: LoadedDrivers, borrow = false): { driver: LoadedDriver; changed: string[] } | null {
  const d = s.driverOrigin ? loaded[s.driverOrigin] : undefined;
  if (!d || !fromDatabase(s.driverName, d)) return null;
  return { driver: d, changed: changedFields(s, d, borrow) };
}

/** The slot with the database's values (and name) back. */
export function resetDriver<T extends DriverFields>(s: T, d: LoadedDriver, borrow = false): T {
  return { ...s, ...databaseFields(s, d, borrow), driverName: d.name, driverOrigin: d.id ?? s.driverOrigin };
}

/** Text for the edited line: "T/S was edited", "T/S and Xmax were edited", "T/S, Xmax and Pe were edited". */
export function changedText(changed: string[]): string {
  const list = changed.length > 1 ? `${changed.slice(0, -1).join(", ")} and ${changed[changed.length - 1]}` : (changed[0] ?? "");
  return `${list} ${changed.length > 1 ? "were" : "was"} edited`;
}

/** A PR as the database gives it (loadPrChoice). */
export interface DatabasePr {
  name: string;
  params: PrParams;
}

/** Labels of a PR's parameters that differ from the database's (count and added mass are the box's, not the PR's). */
export function changedPrParams(params: PrParams, rec: DatabasePr): string[] {
  const label: Record<string, string> = { mms_g: "Mmp", sd_cm2: "Sdp", vas_l: "Vap", qms: "Qmp", xmax_mm: "Xmax", xmech: "Xmax" };
  const out: string[] = [];
  const keys = new Set([...Object.keys(params), ...Object.keys(rec.params)]);
  for (const k of keys) {
    const a = (params as unknown as Record<string, unknown>)[k];
    const b = (rec.params as unknown as Record<string, unknown>)[k];
    const l = label[k] ?? k;
    if (!same(a ?? undefined, b ?? undefined) && !out.includes(l)) out.push(l);
  }
  return out;
}

/** A PR group's database PR and what was changed, while the group still has its name. */
export function prModification(g: { prName: string; prId?: string; params: PrParams }, rec: DatabasePr | null | undefined): string[] | null {
  if (!g.prId || !rec || g.prName !== rec.name) return null;
  return changedPrParams(g.params, rec);
}
