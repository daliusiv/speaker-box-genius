/**
 * The box volume page's per-shape parts: which size fields each shape uses (with the app's
 * names and help, in its order) and its small labelled outline. Shared by the site build (the
 * page as first served, a box) and the page script (which swaps them when the shape changes).
 */
import type { ShapeKind } from "../state.ts";

/** A size field: its link key (the input is `bv-<key>`), label and help for this shape. */
export interface SizeField {
  key: "w" | "h" | "d" | "dia" | "len" | "tw" | "td" | "bw" | "bd" | "lip" | "wall" | "cap" | "sw";
  label: string;
  help: string;
}

const WALLS: SizeField = { key: "wall", label: "Walls", help: "Wall thickness (e.g. 18 mm MDF). Taken off every side to get the inside volume." };

export const SHAPE_FIELDS: Record<ShapeKind, SizeField[]> = {
  box: [
    { key: "w", label: "Width", help: "Outside width of the box." },
    { key: "h", label: "Height", help: "Outside height of the box." },
    { key: "d", label: "Depth", help: "Outside depth of the box (front to back)." },
    WALLS,
  ],
  wedge: [
    { key: "w", label: "Width", help: "Outside width, side to side (across the car)." },
    { key: "h", label: "Height", help: "Outside height, at the back (the upright panel)." },
    { key: "td", label: "Top depth", help: "Outside depth along the top: the short one." },
    { key: "bd", label: "Bottom depth", help: "Outside depth along the bottom, back to the foot of the slope: the long one." },
    { key: "lip", label: "Lip height", help: "Height of the upright part of the sloped face, below the slope. 0 = sloped all the way down (the usual car wedge)." },
    WALLS,
    { key: "sw", label: "Sloped panel", help: "Thickness of the sloped panel, square to its face: the walls' unless you change it (two layers for a double baffle)." },
  ],
  cylinder: [
    { key: "dia", label: "Diameter (outside)", help: "Outside diameter of the tube. Concrete-form tubes (Sonotube) are sold by their inside diameter: add twice the wall." },
    { key: "len", label: "Length (outside)", help: "Outside length, end cap to end cap." },
    { key: "wall", label: "Walls", help: "Thickness of the tube's wall. Taken off all round to get the inside volume." },
    { key: "cap", label: "End caps", help: "Thickness of each end cap (often thicker than the tube, e.g. two layers of 18 mm MDF). Taken off both ends. The walls' unless you change it." },
  ],
  sphere: [{ key: "dia", label: "Diameter (outside)", help: "Outside diameter of the sphere." }, { ...WALLS, help: "Shell thickness. Taken off all round to get the inside volume." }],
  frustum: [
    { key: "bw", label: "Bottom W", help: "Outside width at the bottom of the tapered box." },
    { key: "bd", label: "Bottom D", help: "Outside depth at the bottom of the tapered box." },
    { key: "tw", label: "Top W", help: "Outside width at the top (0 = a point, like a pyramid)." },
    { key: "td", label: "Top D", help: "Outside depth at the top. For a wedge sloped on one face only (a car wedge), use the Car wedge shape: it is exact." },
    { key: "h", label: "Height", help: "Outside height of the tapered box." },
    WALLS,
  ],
};

/** Every size field's key, in the page's markup order. */
export const SIZE_KEYS: SizeField["key"][] = ["w", "h", "d", "dia", "len", "bw", "bd", "tw", "td", "lip", "wall", "cap", "sw"];

/** Length fields in cm; the rest (walls, caps, sloped panel) in mm. */
export const MM_KEYS = new Set<SizeField["key"]>(["wall", "cap", "sw"]);

export const SHAPE_NAMES: Record<ShapeKind, string> = { box: "Box", wedge: "Car wedge", cylinder: "Cylinder", sphere: "Sphere", frustum: "Tapered" };

/** What "its volume following this …" calls the shape. */
export const SHAPE_NOUN: Record<ShapeKind, string> = { box: "box", wedge: "wedge", cylinder: "tube", sphere: "sphere", frustum: "tapered box" };

const text = (x: number, y: number, s: string, anchor = "start") => `<text x="${x}" y="${y}"${anchor !== "start" ? ` text-anchor="${anchor}"` : ""}>${s}</text>`;

/** The static outline of each shape (an aria-hidden SVG; its caption says what it shows). */
export const OUTLINES: Record<ShapeKind, string> = {
  box: `<svg viewBox="0 0 160 140" aria-hidden="true"><path class="o" d="M20 45 L100 45 L100 125 L20 125 Z M20 45 L55 15 L135 15 L100 45 M100 125 L135 95 L135 15"/>${text(60, 138, "W", "middle")}${text(8, 90, "H")}${text(124, 118, "D")}</svg>`,
  wedge: `<svg viewBox="0 0 160 140" aria-hidden="true"><path class="o" d="M30 20 L70 20 L140 120 L140 128 L30 128 Z"/><path class="g" d="M118 98 L140 98"/>${text(50, 14, "Top D", "middle")}${text(85, 140, "Bottom D", "middle")}${text(8, 80, "H")}${text(146, 118, "Lip")}</svg>`,
  cylinder: `<svg viewBox="0 0 160 140" aria-hidden="true"><ellipse class="o" cx="80" cy="22" rx="40" ry="11"/><path class="o" d="M40 22 L40 115 M120 22 L120 115 M40 115 A40 11 0 0 0 120 115"/>${text(80, 27, "Ø", "middle")}${text(132, 74, "L")}</svg>`,
  sphere: `<svg viewBox="0 0 160 140" aria-hidden="true"><circle class="o" cx="80" cy="70" r="52"/><ellipse class="g" cx="80" cy="70" rx="52" ry="14"/>${text(80, 64, "Ø", "middle")}</svg>`,
  frustum: `<svg viewBox="0 0 160 140" aria-hidden="true"><path class="o" d="M15 110 L105 110 L145 85 L55 85 Z M45 40 L95 40 L115 28 L65 28 Z M15 110 L45 40 M105 110 L95 40 M145 85 L115 28"/>${text(60, 128, "Bottom W", "middle")}${text(60, 22, "Top W", "middle")}${text(4, 78, "H")}</svg>`,
};

/** The outline's caption; the car wedge's names its slope. */
export function outlineCaption(shape: ShapeKind, slope_deg: number | null = null): string {
  switch (shape) {
    case "box":
      return "Outside sizes. Walls come off every side.";
    case "wedge":
      return slope_deg !== null && Number.isFinite(slope_deg)
        ? `One sloped panel. Slope ${slope_deg.toFixed(1)}° from the bottom; the lip stands upright under it.`
        : "One sloped panel; the lip stands upright under it.";
    case "cylinder":
      return "A tube with two end caps. Sonotube is sold by its inside diameter: add twice the wall.";
    case "sphere":
      return "A ball: the shell comes off all round.";
    case "frustum":
      return "Sloped on all four sides, the walls square to each face.";
  }
}
