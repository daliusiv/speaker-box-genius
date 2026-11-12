/**
 * Cut list for a rectangular box: the six panels, the holes in the baffle, the port to
 * cut, suggested braces, and how the panels lay out on stock sheets.
 *
 * Joinery is the usual butt-joint scheme for glued MDF/plywood boxes: front (baffle) and
 * back cover the full outside width × height; top and bottom fit between them; the sides
 * fit between all four. Every outside dimension then comes out exactly as given.
 * All lengths in mm.
 */

import { buildWedgePanels, type PanelInput, type SolidPanel } from "./panels.ts";
import { wedgeAngles, wedgeGeometry, wedgeIssues } from "./wedge.ts";

export interface Panel {
  name: string;
  qty: number;
  /** Longer side first. */
  a: number;
  b: number;
  /** How to cut its edges, when they are not all square ("front edge bevelled 21.5°…"). */
  note?: string;
}

export interface Hole {
  name: string;
  qty: number;
  /** Round hole diameter… */
  diameter?: number;
  /** …or a rectangular opening. */
  width?: number;
  height?: number;
  where: string;
}

export interface Brace {
  name: string;
  qty: number;
  /** Outside size of the brace (fits the inside of the box), longer side first. */
  a: number;
  b: number;
  /** Width of the frame left around the window. */
  frame: number;
}

export interface CutListInput {
  /** Outside size. */
  width: number;
  height: number;
  depth: number;
  wall: number;
  drivers?: { count: number; cutout: number };
  prs?: { count: number; cutout: number };
  /** Round port tubes (outside diameter of the tube = hole) or a slot opening. */
  ports?: { count: number; length: number; holeDiameter?: number; slot?: { width: number; height: number } };
}

export interface CutList {
  panels: Panel[];
  holes: Hole[];
  braces: Brace[];
  inside: { width: number; height: number; depth: number };
  /** Total panel area (m²), braces included. */
  area_m2: number;
  /** Things to check, in plain words. */
  warnings: string[];
}

/** Longest unsupported span (mm) before a brace is suggested, for a wall of this thickness. */
export const maxSpanFor = (wall: number) => Math.max(250, Math.round(wall * 20));

/** Space to leave around holes on the baffle and between them (mm). */
const MARGIN = 15;

export function cutList(i: CutListInput): CutList {
  const t = i.wall;
  const inside = { width: i.width - 2 * t, height: i.height - 2 * t, depth: i.depth - 2 * t };
  const warnings: string[] = [];
  const sorted = (name: string, qty: number, x: number, y: number): Panel => ({ name, qty, a: Math.max(x, y), b: Math.min(x, y) });

  const panels: Panel[] = [
    sorted("Front (baffle)", 1, i.width, i.height),
    sorted("Back", 1, i.width, i.height),
    sorted("Top and bottom", 2, i.width, inside.depth),
    sorted("Sides", 2, inside.height, inside.depth),
  ];
  if (inside.width <= 0 || inside.height <= 0 || inside.depth <= 0) {
    warnings.push("The walls are thicker than half the box: check the outside size and wall thickness.");
  }

  // Holes. Everything goes on the baffle unless it doesn't fit; then PRs and ports move to the back.
  const holes: Hole[] = [];
  const baffle: { name: string; size: number }[] = [];
  if (i.drivers && i.drivers.count > 0 && i.drivers.cutout > 0) {
    holes.push({ name: "Driver cutout", qty: i.drivers.count, diameter: i.drivers.cutout, where: "Front" });
    for (let k = 0; k < i.drivers.count; k++) baffle.push({ name: "driver", size: i.drivers.cutout });
  }
  const others: { hole: Hole; size: number }[] = [];
  if (i.prs && i.prs.count > 0 && i.prs.cutout > 0) {
    others.push({ hole: { name: "Passive radiator cutout", qty: i.prs.count, diameter: i.prs.cutout, where: "Front" }, size: i.prs.cutout });
  }
  if (i.ports && i.ports.count > 0) {
    if (i.ports.slot) {
      const s = i.ports.slot;
      // A slot port is usually built against a box wall: one extra wall makes the channel.
      if (i.ports.length > 0) panels.push(sorted("Slot port wall", i.ports.count, i.ports.length, s.width));
      others.push({ hole: { name: "Slot port opening", qty: i.ports.count, width: s.width, height: s.height, where: "Front" }, size: Math.min(s.width, s.height) });
    } else if (i.ports.holeDiameter) {
      others.push({ hole: { name: "Port hole (tube's outside diameter)", qty: i.ports.count, diameter: i.ports.holeDiameter, where: "Front" }, size: i.ports.holeDiameter });
    }
  }
  // Lay round holes in a line along the baffle's longer inside dimension.
  const along = Math.max(inside.width, inside.height);
  const across = Math.min(inside.width, inside.height);
  const used = (list: number[]) => list.reduce((s, d) => s + d + MARGIN, MARGIN);
  const driverSizes = baffle.map((h) => h.size);
  for (const d of driverSizes) {
    if (d + 2 * MARGIN > across) warnings.push(`A ${Math.round(d)} mm driver cutout is wider than the baffle allows (${Math.round(across)} mm inside): make the box wider.`);
  }
  let onBaffle = [...driverSizes];
  for (const o of others) {
    const extra = Array(o.hole.qty).fill(o.size) as number[];
    if (used([...onBaffle, ...extra]) <= along && o.size + 2 * MARGIN <= across) {
      onBaffle = [...onBaffle, ...extra];
    } else {
      o.hole.where = "Back or sides";
      const backFits = o.size + 2 * MARGIN <= across && used(extra) <= along;
      if (!backFits) warnings.push(`The ${o.hole.name.toLowerCase()}s don't fit on one face: spread them over the back and sides, or make the box bigger.`);
    }
    holes.push(o.hole);
  }
  if (used(driverSizes) > along) warnings.push("The drivers don't fit on the baffle side by side: make the box taller or wider.");

  // Port tubes and their clearance from the back wall (about one diameter is the usual minimum).
  if (i.ports && i.ports.count > 0 && i.ports.length > 0) {
    const clearance = i.ports.slot ? Math.min(i.ports.slot.width, i.ports.slot.height) : (i.ports.holeDiameter ?? 0);
    if (i.ports.length > inside.depth - clearance / 2) {
      warnings.push(
        `The port (${Math.round(i.ports.length)} mm) needs more room than the ${Math.round(inside.depth)} mm inside depth: bend it, run it along a side, or use a slot port.`,
      );
    }
  }

  // Braces: one window brace per span longer than the limit, across the longest inside dimension.
  const braces: Brace[] = [];
  const limit = maxSpanFor(t);
  const dims = [
    { len: inside.width, cross: [inside.height, inside.depth], name: "width" },
    { len: inside.height, cross: [inside.width, inside.depth], name: "height" },
    { len: inside.depth, cross: [inside.width, inside.height], name: "depth" },
  ].sort((x, y) => y.len - x.len);
  const longest = dims[0]!;
  const count = Math.max(0, Math.ceil(longest.len / limit) - 1);
  if (count > 0 && longest.cross[0]! > 0 && longest.cross[1]! > 0) {
    const frame = Math.max(30, Math.round(t * 2.5));
    braces.push({ name: `Window brace (across the ${longest.name})`, qty: count, a: Math.max(...longest.cross), b: Math.min(...longest.cross), frame });
  }

  const area =
    panels.reduce((s, p) => s + p.qty * p.a * p.b, 0) + braces.reduce((s, b) => s + b.qty * b.a * b.b, 0);
  return { panels, holes, braces, inside, area_m2: area / 1e6, warnings };
}

/** The cut-list note for a panel's bevelled or mitred edges ("" when all square). */
export function bevelNote(p: SolidPanel): string {
  if (!p.bevels?.length) return "";
  const parts = p.bevels.map((b) => `${b.edge} edge ${b.angle.toFixed(1)}°, long point ${b.longPoint === "outer" ? "outside" : "inside"}`);
  const par = p.bevels.length === 2 && p.bevels[0]!.longPoint !== p.bevels[1]!.longPoint && Math.abs(p.bevels[0]!.angle - p.bevels[1]!.angle) < 1e-6;
  return `${parts.join("; ")}${par ? " (parallel: a parallelogram in section)" : ""}; size is the longer face`;
}

/**
 * Cut list for a car wedge (one sloped panel), or a box built the same way: the sides cover
 * the whole outside, the other four panels fit between them. Panels come from the panel table
 * (buildWedgePanels) with their bevel or miter notes; holes, braces and warnings as for a box
 * of the same inside, with the baffle's face as long as the sloped panel's (braces are sized
 * for the mean inside depth).
 */
export function wedgeCutList(i: PanelInput & Pick<CutListInput, "drivers" | "prs" | "ports">): CutList {
  const set = buildWedgePanels(i);
  const g = wedgeGeometry(i);
  const T = i.wall;
  const front = (i.slope ?? "front") === "front";
  const baffleIn = front ? g.insideSlant : g.insideHeight;
  const meanDepth = (g.insideTopDepth + g.insideBottomDepth) / 2;
  const box = cutList({
    width: i.width,
    height: baffleIn + 2 * T,
    depth: meanDepth + 2 * T,
    wall: T,
    drivers: i.drivers,
    prs: i.prs,
    ports: i.ports,
  });
  const panels: Panel[] = [];
  for (const p of set.panels) {
    const note = bevelNote(p);
    const same = panels.find((x) => x.name === p.name && x.a === p.blank.a && x.b === p.blank.b && (x.note ?? "") === note);
    if (same) same.qty++;
    else panels.push({ name: p.name, qty: 1, a: p.blank.a, b: p.blank.b, ...(note ? { note } : {}) });
  }
  for (const p of panels) if (p.name === "Side" && p.qty > 1) p.name = "Sides";
  // Slot port walls from the box cut list.
  panels.push(...box.panels.filter((p) => p.name === "Slot port wall"));
  const holes = box.holes.map((h) => (h.where === "Front" ? { ...h, where: front ? "Baffle (sloped)" : "Baffle" } : h));
  const a = wedgeAngles(i);
  const warnings = [
    ...wedgeIssues(i, { joinery: i.joinery, slope: i.slope }).filter((x) => x.level !== "info").map((x) => x.message),
    ...box.warnings.filter((w) => !w.startsWith("The walls are thicker")),
  ];
  if ((i.joinery ?? "butt") === "miter" && Math.max(...a.miter.bottom) > 45) {
    warnings.push(`The bottom miter needs a ${Math.max(...a.miter.bottom).toFixed(1)}° saw tilt: past most saws' 45°.`);
  }
  const area = panels.reduce((s, p) => s + p.qty * p.a * p.b, 0) + box.braces.reduce((s, b) => s + b.qty * b.a * b.b, 0);
  return {
    panels,
    holes,
    braces: box.braces,
    inside: { width: g.insideWidth, height: g.insideHeight, depth: meanDepth },
    area_m2: area / 1e6,
    warnings,
  };
}

/** Volume (litres) that window braces take: the frame around each window, at wall thickness. */
export function braceVolume(braces: Brace[], wall: number): number {
  return braces.reduce((s, b) => {
    const window = Math.max(0, b.a - 2 * b.frame) * Math.max(0, b.b - 2 * b.frame);
    return s + (b.qty * (b.a * b.b - window) * wall) / 1e6;
  }, 0);
}

// ---------------------------------------------------------------------------
// Sheet layout
// ---------------------------------------------------------------------------

export interface Placed {
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Layout {
  sheets: Placed[][];
  /** Pieces larger than a sheet. */
  tooBig: string[];
  /** Share of the sheets used (0–1). */
  used: number;
}

/**
 * Lay pieces on sheets: largest first, in rows (shelves), turning a piece when that fits
 * better. Simple, and close to how panels are actually ripped and cross-cut.
 */
export function layoutSheets(pieces: { name: string; a: number; b: number }[], sheetW: number, sheetH: number, kerf: number): Layout {
  const list = [...pieces].sort((p, q) => Math.max(q.a, q.b) - Math.max(p.a, p.b) || q.a * q.b - p.a * p.b);
  const sheets: { shelves: { y: number; h: number; x: number }[]; placed: Placed[] }[] = [];
  const tooBig: string[] = [];
  const fits = (w: number, h: number) => w <= sheetW && h <= sheetH;

  for (const p of list) {
    // Orientations: lying along the sheet first.
    const opts = [
      { w: Math.max(p.a, p.b), h: Math.min(p.a, p.b) },
      { w: Math.min(p.a, p.b), h: Math.max(p.a, p.b) },
    ].filter((o) => fits(o.w, o.h));
    if (opts.length === 0) {
      tooBig.push(p.name);
      continue;
    }
    let done = false;
    for (const s of sheets) {
      // Into an existing shelf.
      for (const sh of s.shelves) {
        const o = opts.find((o) => o.h <= sh.h && sh.x + o.w <= sheetW);
        if (o) {
          s.placed.push({ name: p.name, x: sh.x, y: sh.y, w: o.w, h: o.h });
          sh.x += o.w + kerf;
          done = true;
          break;
        }
      }
      if (done) break;
      // A new shelf on this sheet.
      const top = s.shelves.reduce((y, sh) => Math.max(y, sh.y + sh.h + kerf), 0);
      const o = opts.find((o) => top + o.h <= sheetH);
      if (o) {
        s.shelves.push({ y: top, h: o.h, x: o.w + kerf });
        s.placed.push({ name: p.name, x: 0, y: top, w: o.w, h: o.h });
        done = true;
        break;
      }
    }
    if (!done) {
      const o = opts[0]!;
      sheets.push({ shelves: [{ y: 0, h: o.h, x: o.w + kerf }], placed: [{ name: p.name, x: 0, y: 0, w: o.w, h: o.h }] });
    }
  }
  const area = sheets.reduce((s, sh) => s + sh.placed.reduce((a, p) => a + p.w * p.h, 0), 0);
  return { sheets: sheets.map((s) => s.placed), tooBig, used: sheets.length ? area / (sheets.length * sheetW * sheetH) : 0 };
}

/** Expand a cut list into individual pieces (panels and braces) for the layout. */
export function piecesOf(c: CutList): { name: string; a: number; b: number }[] {
  const out: { name: string; a: number; b: number }[] = [];
  for (const p of [...c.panels, ...c.braces]) {
    const short = p.name.replace(/ \(.*\)$/, "").replace(/ and bottom$/, "/bottom");
    for (let k = 0; k < p.qty; k++) out.push({ name: p.qty > 1 ? `${short} ${k + 1}` : short, a: p.a, b: p.b });
  }
  return out;
}
