import { writeWdr } from "@sbg/engine";
import { solveDriver } from "../sim.ts";
import type { AppState } from "../state.ts";
import { wprExportable, wprFor } from "../wprExport.ts";
import { safeName, type ExportFormat, type OutFile } from "./types.ts";

export const wprFormat: ExportFormat = {
  id: "wpr",
  group: "sim",
  label: "WinISD project",
  ext: ".wpr",
  icon: "chart",
  help: "One project per box, with the driver and the settings that change its result. Sealed, ported, PR and ported bandpass boxes.",
  scope: "designs",
  supports: (d) => wprExportable(d) || "WinISD can't open this box type",
  run({ state }, ids) {
    const files: OutFile[] = [];
    const notes = new Set<string>();
    for (const d of state.designs.filter((x) => ids.includes(x.id))) {
      const out = wprFor(state, d);
      if (typeof out === "string") return out;
      out.notes.forEach((n) => notes.add(n));
      files.push({ name: `${safeName(`${state.driverName} ${d.name}`)}.wpr`, data: out.text, type: "text/plain" });
    }
    return files.length ? { files, notes: [...notes] } : "Pick at least one box.";
  },
};

/** The driver as a WinISD driver file, or why not. */
export function wdrFile(state: AppState): OutFile | string {
  const solved = solveDriver(state);
  if (solved.missing.length > 0) return "Enter enough parameters to simulate before exporting.";
  const name = state.driverName.trim();
  const brand = state.driverBrand && name.startsWith(state.driverBrand) ? state.driverBrand : "";
  const text = writeWdr({
    brand,
    model: name.slice(brand.length).trim() || name,
    nominal_ohms: state.nominal_ohms,
    ts: solved.values,
    le_mh: state.le_mh,
    xmax_mm: state.xmax_mm,
    pe_w: state.pe_w,
    displacement_l: state.volume.driverDisp_l,
  });
  return { name: `${safeName(state.driverName, "driver")}.wdr`, data: text, type: "text/plain" };
}

export const wdrFormat: ExportFormat = {
  id: "wdr",
  group: "sim",
  label: "WinISD driver",
  ext: ".wdr",
  icon: "speaker",
  help: "The driver's parameters for WinISD's driver library (no box).",
  scope: "workspace",
  run({ state }) {
    const f = wdrFile(state);
    return typeof f === "string" ? f : { files: [f] };
  },
};
