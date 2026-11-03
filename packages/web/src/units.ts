import { createContext, useContext } from "react";

/**
 * Display units. Everything is stored in metric (L, cm, mm) so share links
 * are the same whichever units the viewer prefers; only inputs and read-outs convert.
 */
export type UnitSystem = "metric" | "imperial";
export type Quantity = "vol" | "len" | "mm";

const TABLE: Record<UnitSystem, Record<Quantity, { unit: string; k: number; digits: number }>> = {
  metric: {
    vol: { unit: "L", k: 1, digits: 1 },
    len: { unit: "cm", k: 1, digits: 1 },
    mm: { unit: "mm", k: 1, digits: 0 },
  },
  imperial: {
    vol: { unit: "ft³", k: 1 / 28.316846592, digits: 2 },
    len: { unit: "in", k: 1 / 2.54, digits: 2 },
    mm: { unit: "in", k: 1 / 25.4, digits: 3 },
  },
};

export const UnitsContext = createContext<UnitSystem>("metric");

export function unitOf(system: UnitSystem, q: Quantity) {
  return TABLE[system][q];
}

/** Format a metric value in the chosen system, e.g. fmtQ(40, "vol", "imperial") → "1.41 ft³". */
export function fmtQ(value: number, q: Quantity, system: UnitSystem, digits?: number): string {
  const u = TABLE[system][q];
  return `${(value * u.k).toFixed(digits ?? u.digits)} ${u.unit}`;
}

export function useUnits() {
  const system = useContext(UnitsContext);
  return {
    system,
    unit: (q: Quantity) => TABLE[system][q],
    fmt: (value: number, q: Quantity, digits?: number) => fmtQ(value, q, system, digits),
  };
}
