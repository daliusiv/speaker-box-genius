import { spiceExportable, spiceFor } from "../spiceExport.ts";
import { safeName, type ExportFormat, type OutFile } from "./types.ts";

export const spiceFormat: ExportFormat = {
  id: "spice",
  group: "sim",
  label: "LTspice netlist",
  ext: ".cir",
  icon: "circuit",
  help: "The circuit the validation tests check the app against, one netlist per box. Its header says what to plot.",
  scope: "designs",
  supports: (d) => spiceExportable(d) || "Lines and horns: use Hornresp",
  run({ state, shareUrl }, ids) {
    const files: OutFile[] = [];
    const notes = new Set<string>();
    for (const d of state.designs.filter((x) => ids.includes(x.id))) {
      const out = spiceFor(state, d, shareUrl);
      if (typeof out === "string") return out;
      out.notes.forEach((n) => notes.add(n));
      files.push({ name: `${safeName(`${state.driverName} ${d.name}`)}.cir`, data: out.text, type: "text/plain" });
    }
    return files.length ? { files, notes: [...notes] } : "Pick at least one box.";
  },
};
