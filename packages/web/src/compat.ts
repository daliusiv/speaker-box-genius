import type { Settings } from "./state.ts";

/**
 * Simulation conventions that differ between WinISD and Hornresp, set together by the
 * Settings presets. Units, the amplifier, box losses, coil temperature and the chuffing line
 * aren't conventions (they describe your build), so presets leave them alone. Hornresp's
 * values are the ones the validation against its exports uses (packages/engine/validation).
 */
export type CompatKey = "air" | "inductance" | "thermalLimit" | "leakage" | "coneLoad" | "portModel" | "portCompression" | "lineSpl";
export type CompatPreset = "default" | "winisd" | "hornresp";

export const COMPAT: Record<CompatPreset, { label: string; values: Pick<Settings, CompatKey> }> = {
  default: {
    label: "Default",
    values: { air: "standard", inductance: true, thermalLimit: "nominal", leakage: "radiates", coneLoad: "mass", portModel: "lumped", portCompression: false, lineSpl: "on-axis" },
  },
  winisd: {
    label: "WinISD",
    values: { air: "winisd", inductance: false, thermalLimit: "nominal", leakage: "radiates", coneLoad: "mass", portModel: "lumped", portCompression: false, lineSpl: "on-axis" },
  },
  hornresp: {
    label: "Hornresp",
    values: { air: "hornresp", inductance: true, thermalLimit: "real", leakage: "absorbed", coneLoad: "piston", portModel: "pipe", portCompression: false, lineSpl: "power" },
  },
};

/** Which preset the settings match, or null ("Custom") when they match none. */
export function compatOf(s: Settings): CompatPreset | null {
  for (const [id, p] of Object.entries(COMPAT) as [CompatPreset, (typeof COMPAT)[CompatPreset]][]) {
    if ((Object.keys(p.values) as CompatKey[]).every((k) => s[k] === p.values[k])) return id;
  }
  return null;
}

/** The settings with a preset's conventions applied (everything else kept). */
export const withCompat = (s: Settings, id: CompatPreset): Settings => ({ ...s, ...COMPAT[id].values });

/** Names of the settings, as Settings shows them. */
export const COMPAT_NAMES: Record<CompatKey, string> = {
  air: "Air",
  inductance: "Coil inductance",
  thermalLimit: "Power rating vs",
  leakage: "Leaked air",
  coneLoad: "Cone air load",
  portModel: "Ports",
  portCompression: "Port compression",
  lineSpl: "SPL",
};

/** The preset the settings are closest to, and the settings that differ from it. */
export function nearestCompat(s: Settings): { id: CompatPreset; differ: CompatKey[] } {
  let best: { id: CompatPreset; differ: CompatKey[] } | null = null;
  for (const [id, p] of Object.entries(COMPAT) as [CompatPreset, (typeof COMPAT)[CompatPreset]][]) {
    const differ = (Object.keys(p.values) as CompatKey[]).filter((k) => s[k] !== p.values[k]);
    if (!best || differ.length < best.differ.length) best = { id, differ };
  }
  return best!;
}
