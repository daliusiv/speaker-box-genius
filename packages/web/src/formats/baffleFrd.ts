/**
 * Save & Export → Crossover tools → Driver on baffle: the way into the Driver curve window from
 * Export. It has no download of its own: its button picks the driver's .frd, and the window
 * (with its charts) makes the file, so the curve gets a look before it goes out.
 */
import { baffleGeometry, onlyOpenBaffles } from "../sim.ts";
import type { AppState } from "../state.ts";
import type { ExportFormat } from "./types.ts";

const cm = (x: number) => Number(x.toFixed(1)).toString();

/** Which baffle the window will use, in a line: size and where it comes from, and the driver's place. */
export function baffleLine(s: AppState): string {
  const g = baffleGeometry(s);
  if (!g) return "Baffle: type its size in the window.";
  const from = s.baffle.fromBox && s.volume.shape === "box" ? "the box's front" : "typed in Baffle step";
  return `Baffle: ${cm(g.width * 100)} × ${cm(g.height * 100)} cm, ${from}; driver ${cm(g.x * 100)} cm from left, ${cm(g.y * 100)} cm from top. You can change it in the window.`;
}

export const baffleFrdFormat: ExportFormat = {
  id: "baffle-frd",
  group: "crossover",
  label: "Driver on baffle",
  ext: ".frd",
  icon: "baffle",
  help: "Load a driver's half-space curve (.frd, from the datasheet or a ground-plane measurement) and save it with your baffle's diffraction and phase, for VituixCAD, XSim or another crossover tool.",
  detail: baffleLine,
  scope: "workspace",
  // Open baffles have no baffle step (the dipole model covers the board): only listed with a boxed design on.
  shown: (s) => !onlyOpenBaffles(s),
  action: "Choose a driver curve…",
  pick: { accept: ".frd,.txt,.csv,.dat" },
  run() {
    return "Choose a driver curve first.";
  },
};
