import type { ChartId } from "./App.tsx";

/** A chart a desktop slot can show: the response or any of the tabbed charts. */
export type ChartKey = ChartId | "response";

/** Names and units in the chart menus, grouped as the menu lists them. */
export const CHART_GROUPS: readonly { heading: string; charts: readonly { key: ChartKey; name: string; unit: string }[] }[] = [
  {
    heading: "Response and limits",
    charts: [
      { key: "response", name: "Response", unit: "dB" },
      { key: "excursion", name: "Cone excursion", unit: "mm" },
      { key: "pr", name: "PR excursion", unit: "mm" },
      { key: "port", name: "Port speed", unit: "m/s" },
      { key: "maxspl", name: "Max SPL", unit: "dB" },
      { key: "power", name: "Power & heat", unit: "%" },
    ],
  },
  { heading: "Electrical", charts: [{ key: "impedance", name: "Impedance", unit: "Ω" }, { key: "za", name: "Line load (Za)", unit: "Ω" }] },
  { heading: "Box", charts: [{ key: "pressure", name: "Box pressure", unit: "Pa" }, { key: "air", name: "Air distortion", unit: "%" }] },
  { heading: "Time", charts: [{ key: "delay", name: "Group delay", unit: "ms" }, { key: "transient", name: "Impulse / step", unit: "" }] },
];

const ALL_KEYS: readonly ChartKey[] = CHART_GROUPS.flatMap((g) => g.charts.map((c) => c.key));

/** Slots on a wide desktop: two rows of two. One per row shows the first three. */
export const SLOT_COUNT = 4;

/** The charts the slots start with; a third slot picked before (the old "More charts" tab) is kept. */
export function defaultSlots(legacyPick?: string | null): ChartKey[] {
  const third: ChartKey = legacyPick && ALL_KEYS.includes(legacyPick as ChartKey) && legacyPick !== "excursion" ? (legacyPick as ChartKey) : "maxspl";
  return ["response", "excursion", third, third === "impedance" ? "maxspl" : "impedance"];
}

/** Saved slots read back: four known charts, else null. */
export function parseSlots(text: string | null): ChartKey[] | null {
  if (!text) return null;
  try {
    const v: unknown = JSON.parse(text);
    if (!Array.isArray(v) || v.length !== SLOT_COUNT || !v.every((k) => ALL_KEYS.includes(k as ChartKey))) return null;
    return v as ChartKey[];
  } catch {
    return null;
  }
}

/**
 * What each slot shows: its chosen chart if this project has it and no slot before it shows it
 * too, else the first chart this project has that no slot shows yet (in menu order).
 */
export function resolveSlots(slots: readonly ChartKey[], available: ReadonlySet<ChartKey>): ChartKey[] {
  const out: ChartKey[] = [];
  for (const k of slots) out.push(available.has(k) && !out.includes(k) ? k : (ALL_KEYS.find((x) => available.has(x) && !out.includes(x) && !slots.includes(x)) ?? ALL_KEYS.find((x) => available.has(x) && !out.includes(x)) ?? k));
  return out;
}

/** Slot `i` shows `key`; a slot already showing it gets slot i's chart instead (the two swap). */
export function pickSlot(slots: readonly ChartKey[], shown: readonly ChartKey[], i: number, key: ChartKey): ChartKey[] {
  const next = [...shown, ...slots.slice(shown.length)];
  const j = shown.indexOf(key);
  if (j >= 0 && j !== i) next[j] = next[i]!;
  next[i] = key;
  return next;
}

/** Where slot `j` sits, for "Shown top left: picking it swaps". */
export const slotPlace = (j: number, perRow: 1 | 2) =>
  perRow === 2 ? (["top left", "top right", "bottom left", "bottom right"][j] ?? "") : (["first", "second", "third"][j] ?? "");
