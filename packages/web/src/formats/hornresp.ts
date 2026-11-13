import { toHornresp } from "../hornresp.ts";
import { hornrespBoxKind, toHornrespBox } from "../hornrespBox.ts";
import { builtVbOf, driverInputOf, simOptionsOf, solveDriver, ventDistanceOf } from "../sim.ts";
import { stuffFactor } from "../stuffing.ts";
import { safeName, type ExportFormat, type OutFile } from "./types.ts";

export const hornrespFormat: ExportFormat = {
  id: "hornresp",
  group: "sim",
  label: "Hornresp record",
  ext: ".txt",
  icon: "file",
  help: "One record per box or line, for Hornresp's File → Import. Sealed, ported and passive radiator boxes, lines and horns; a port's distance from the cone is its Acoustic Path Length.",
  scope: "designs",
  supports: (d) => d.kind === "line" || hornrespBoxKind(d) || "Bandpass boxes are set up in Hornresp's wizard",
  run({ state }, ids) {
    const solved = solveDriver(state);
    if (solved.missing.length > 0) return "Enter enough driver parameters to simulate first.";
    const driver = driverInputOf(state, solved);
    const sim = simOptionsOf(state, true);
    const power = sim.power ?? 1;
    const eg = sim.convention === "volts" ? power : Math.sqrt(power * driver.re);
    const files: OutFile[] = [];
    const notes = new Set<string>();
    for (const d of state.designs.filter((x) => ids.includes(x.id))) {
      const common = { eg, drivers: state.drivers, wiring: sim.wiring, pmax: driver.pe_w ?? undefined, xmax_mm: driver.xmax_mm ?? undefined, sim };
      const out =
        d.kind === "line"
          ? toHornresp(d, driver, { ...common, name: d.name })
          : hornrespBoxKind(d)
            ? toHornrespBox(d, driver, { ...common, vb_l: builtVbOf(state, d) * stuffFactor(d), distance_cm: ventDistanceOf(d, state.volume), stuffed: stuffFactor(d) !== 1 })
            : "Bandpass boxes are set up in Hornresp's wizard.";
      if (typeof out === "string") return `${d.name}: ${out}`;
      out.warnings.forEach((n) => notes.add(n));
      files.push({ name: `${safeName(`${state.driverName} ${d.name}`)}.txt`, data: out.text, type: "text/plain" });
    }
    return files.length ? { files, notes: [...notes] } : "Pick at least one box.";
  },
};
