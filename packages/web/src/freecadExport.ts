import {
  baffleHolesOf,
  buildBoxPanels,
  buildWedgePanels,
  freecadMacro,
  freecadShapeMacro,
  layoutBaffleHoles,
  type CutList,
  type PanelInput,
} from "@sbg/engine";
import { shapeOf, wedgeDimsOf } from "./sim.ts";
import type { AppState } from "./state.ts";

/** A name safe for a file. */
export const macroFileName = (name: string) => `${name.replace(/[^\w.-]+/g, " ").trim() || "speaker-box"}.FCMacro`;

/**
 * The volume calculator's enclosure as a FreeCAD macro. Boxes and car wedges come panel by panel
 * (with the cut list's round baffle holes), cylinders, spheres and tapered boxes as primitives.
 * A message instead when the shape can't be modelled as entered.
 */
export function freecadFor(v: AppState["volume"], cut: CutList | null, name: string): { text: string; fileName: string } | string {
  try {
    if (v.shape === "box" || v.shape === "wedge") {
      const p: PanelInput =
        v.shape === "wedge"
          ? { ...wedgeDimsOf(v), slope: v.slope, joinery: v.joinery }
          : { width: v.width_cm * 10, height: v.height_cm * 10, topDepth: v.depth_cm * 10, bottomDepth: v.depth_cm * 10, wall: v.wall_mm };
      const { holes, skipped } = cut ? baffleHolesOf(cut) : { holes: [], skipped: [] };
      const input = { ...p, holes: layoutBaffleHoles(p, holes) };
      const set =
        v.shape === "wedge"
          ? buildWedgePanels(input)
          : buildBoxPanels({ width: p.width, height: p.height, depth: p.bottomDepth, wall: p.wall, holes: input.holes });
      const notes = [
        ...(v.shape === "box" ? ["Built like the car wedge: the sides cover the outside (the cut list puts the front and back over everything instead); same inside."] : []),
        ...(holes.length ? ["Holes are laid out evenly on the baffle: move them to suit before cutting."] : []),
        ...skipped.map((s) => s.charAt(0).toUpperCase() + s.slice(1) + "."),
      ];
      return { text: freecadMacro(set, { name, notes }), fileName: macroFileName(name) };
    }
    const shape = shapeOf(v);
    if (shape.kind === "box" || shape.kind === "wedge") return "Not a shape FreeCAD export covers.";
    return { text: freecadShapeMacro(shape, v.wall_mm, { name }), fileName: macroFileName(name) };
  } catch (e) {
    return `Can't model this shape as entered: ${(e as Error).message}`;
  }
}

/** Save the macro as a file. */
export function downloadMacro(m: { text: string; fileName: string }) {
  const url = URL.createObjectURL(new Blob([m.text], { type: "text/x-python" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = m.fileName;
  a.click();
  URL.revokeObjectURL(url);
}
