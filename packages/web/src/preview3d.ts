import {
  buildBoxCutPanels,
  buildWedgePanels,
  cylinderMesh,
  frustumMesh,
  lineFits,
  lineUp,
  panelSetMesh,
  sphereMesh,
  taperColumn,
  wedgeGeometry,
  type TaperWall,
  type BoxHole,
  type BoxMesh,
  type HoleSpec,
  type MeshPart,
  type PanelHole,
} from "@sbg/engine";
import { cutoutFromSd, linkedDesign, prTotal, wedgeDimsOf } from "./sim.ts";
import type { AppState } from "./state.ts";
import { INSIDE_FROM } from "./render3d.ts";

/** Space left round holes and between them (mm), as the cut list leaves. */
const MARGIN = 15;

interface Item {
  kind: PanelHole["kind"];
  diameter: number;
  slot?: { width: number; height: number };
}

/**
 * The holes the build sheet knows for the calculator's box: the drivers (the cutout entered, or
 * one from the cone area), the linked design's passive radiators and its ports.
 */
export function holeItems(s: AppState): { drivers: Item[]; others: Item[] } {
  const v = s.volume;
  const d = linkedDesign(s);
  const cutout = v.driverCutout_mm > 0 ? v.driverCutout_mm : s.ts.sd_cm2 ? cutoutFromSd(s.ts.sd_cm2) : 0;
  const drivers: Item[] = cutout > 0 ? Array.from({ length: Math.max(1, s.drivers) }, () => ({ kind: "driver" as const, diameter: cutout })) : [];
  const others: Item[] = [];
  if (d?.kind === "pr") {
    const pr = v.prCutout_mm > 0 ? v.prCutout_mm : cutoutFromSd(d.params.sd_cm2);
    for (let k = 0; k < prTotal(d); k++) others.push({ kind: "pr", diameter: pr });
  }
  if (d?.kind === "vented") {
    for (let k = 0; k < d.count; k++) {
      others.push(
        d.shape === "slot"
          ? { kind: "port", diameter: d.slotHeight_cm * 10, slot: { width: d.slotWidth_cm * 10, height: d.slotHeight_cm * 10 } }
          : { kind: "port", diameter: (d.diameter_cm + 2 * (d.flare_cm ?? 0)) * 10 + 2 * v.portWall_mm },
      );
    }
  }
  return { drivers, others };
}

/** An item's size along a line of holes running across (true) or up the face. */
const along = (h: Item, across: boolean) => (h.slot ? (across ? h.slot.width : h.slot.height) : h.diameter);

/** Holes in a line along the longer of a face's two inside runs (u across, v up), offsets from its middle. */
function lineOn(items: Item[], across: number, up: number): HoleSpec[] {
  const wide = across >= up;
  const offs = lineUp(items.map((h) => along(h, wide)), wide ? across : up, MARGIN);
  return items.map((h, k) => ({ kind: h.kind, diameter: h.diameter, ...(h.slot ? { slot: h.slot } : {}), ...(wide ? { u: offs[k]! } : { v: offs[k]! }) }));
}

/** Whether a line of holes fits a face (the cut list's rule). */
const fits = (items: Item[], across: number, up: number) => {
  const wide = across >= up;
  const room = wide ? across : up;
  const cross = wide ? up : across;
  return items.reduce((s, h) => s + along(h, wide) + MARGIN, MARGIN) <= room && items.every((h) => along(h, !wide) + 2 * MARGIN <= cross);
};

/**
 * The 3D mesh of the box in the volume calculator, built as its build sheet says (a box: front
 * and back full size, sides inside; a wedge: the sides cover everything) with its holes; for a
 * tube, a sphere or a tapered box, the pieces it is usually made from. Throws a RangeError
 * (with a message to show) when the shape can't be built as entered.
 */
export function meshForState(s: AppState): PreviewMesh {
  const v = s.volume;
  // A wall of 0 means inside dimensions were entered: draw a thin wall rather than nothing.
  const wall = Math.max(1, v.wall_mm);
  const { drivers, others } = holeItems(s);
  const notes: string[] = [];
  // A line of holes that doesn't fit is still drawn (spread evenly), with a note.
  const line = (items: Item[], across: number, up: number, where: string) => {
    if (items.length && !fits(items, across, up)) notes.push(`${listName(items)} on the ${where}: drawn overlapping.`);
    return lineOn(items, across, up);
  };
  const done = (m: BoxMesh): PreviewMesh => ({ ...m, notes });
  switch (v.shape) {
    case "box": {
      const W = v.width_cm * 10, H = v.height_cm * 10, D = v.depth_cm * 10;
      const iw = W - 2 * wall, ih = H - 2 * wall;
      // Everything on the baffle that fits there; the rest on the back (as the cut list says).
      const front = [...drivers];
      const back: Item[] = [];
      for (const group of groupsOf(others)) (fits([...front, ...group], iw, ih) ? front : back).push(...group);
      const place = (items: Item[], on: "baffle" | "back"): BoxHole[] =>
        line(items, iw, ih, on === "back" ? "back" : "baffle").map((h) => ({ kind: h.kind, diameter: h.diameter, ...(h.slot ? { slot: h.slot } : {}), on, y: H / 2 + (h.v ?? 0), z: W / 2 + (on === "back" ? -1 : 1) * (h.u ?? 0) }));
      return done(panelSetMesh(buildBoxCutPanels({ width: W, height: H, depth: D, wall, holes: [...place(front, "baffle"), ...place(back, "back")] })));
    }
    case "wedge": {
      const d = { ...wedgeDimsOf(v), wall };
      const g = wedgeGeometry(d);
      const run = v.slope === "front" ? g.insideSlant : g.insideHeight;
      const items = [...drivers, ...others];
      const specs = line(items, g.insideWidth, run, "baffle");
      // One driver alone: where the calculator puts it (Driver at), else the middle.
      const at0 = items.length === 1 && v.driverAt_mm !== null ? v.driverAt_mm : run / 2;
      return done(
        panelSetMesh(
          buildWedgePanels({
            ...d,
            slope: v.slope,
            joinery: v.joinery,
            holes: specs.map((h) => ({ kind: h.kind, diameter: h.diameter, ...(h.slot ? { slot: h.slot } : {}), at: at0 + (h.v ?? 0), z: d.width / 2 + (h.u ?? 0) })),
          }),
        ),
      );
    }
    case "cylinder": {
      const D = v.diameter_cm * 10;
      const inner = D - 2 * wall;
      const items = [...drivers, ...others];
      if (items.length && !lineFits(items.map((h) => along(h, true)), inner, MARGIN)) notes.push(`${listName(items)} on the top cap: drawn overlapping.`);
      return done(cylinderMesh({ diameter: D, length: v.height_cm * 10, wall, capWall: Math.max(1, v.capWall_mm ?? v.wall_mm), holes: lineOn(items, inner, 0) }));
    }
    case "sphere": {
      const D = v.diameter_cm * 10;
      const items = [...drivers, ...others];
      // Round the front: about a quarter of the way round each side.
      const room = (Math.PI * D) / 2.5;
      if (items.length && !lineFits(items.map((h) => along(h, true)), room, MARGIN)) notes.push(`${listName(items)} on the front: drawn overlapping.`);
      return done(sphereMesh({ diameter: D, wall, holes: lineOn(items, room, 0) }));
    }
    case "frustum": {
      const W1 = v.width_cm * 10, W2 = v.topWidth_cm * 10, D1 = v.depth_cm * 10, D2 = v.topDepth_cm * 10, H = v.height_cm * 10;
      return done(frustumMesh({ bottomWidth: W1, bottomDepth: D1, topWidth: W2, topDepth: D2, height: H, wall, holes: taperHoles(drivers, others, W1, W2, D1, D2, H, wall, notes) }));
    }
  }
}

/** A drawn box, with what couldn't be placed as built ("The 2 passive radiators don't fit…"). */
export type PreviewMesh = BoxMesh & { notes: string[] };

const KIND_NAME: Record<PanelHole["kind"], [string, string]> = {
  driver: ["driver", "drivers"],
  pr: ["passive radiator", "passive radiators"],
  port: ["port", "ports"],
};
/** "The driver doesn't fit" / "The 2 passive radiators don't fit" / "The driver and 2 passive radiators don't fit". */
function listName(items: Item[]): string {
  const parts = groupsOf(items).map((g) => (g.length === 1 ? `the ${KIND_NAME[g[0]!.kind][0]}` : `${g.length} ${KIND_NAME[g[0]!.kind][1]}`));
  const text = parts.length > 1 ? `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}` : parts[0]!;
  const one = items.length === 1;
  return `${text[0]!.toUpperCase()}${text.slice(1)}${one ? " doesn't" : " don't"} fit`;
}

/**
 * Holes on a tapered box: the drivers on the front; each other group (all the PRs, all the ports)
 * on the front with them if it fits, else the back, then a side. Each wall takes one column up
 * its slant, checked against the wall's width where each hole sits.
 */
function taperHoles(drivers: Item[], others: Item[], W1: number, W2: number, D1: number, D2: number, H: number, t: number, notes: string[]): HoleSpec[] {
  // Usable inside size of each wall: its outside width less a wall each side, its slant less a wall each end.
  const face = (b: number, top: number, run: number) => ({ bottom: b - 2 * t, top: Math.max(0, top - 2 * t), slant: Math.hypot(H, run) - 2 * t });
  const walls: Record<TaperWall, ReturnType<typeof face>> = {
    front: face(W1, W2, (D1 - D2) / 2),
    back: face(W1, W2, (D1 - D2) / 2),
    left: face(D1, D2, (W1 - W2) / 2),
    right: face(D1, D2, (W1 - W2) / 2),
  };
  // Up the slant a slot takes its height; across, its width.
  const column = (items: Item[], w: TaperWall): number[] | null => {
    const f = walls[w];
    const up = items.map((h) => (h.slot ? h.slot.height : h.diameter));
    const vs = taperColumn(up, f.bottom, f.top, f.slant, MARGIN);
    if (!vs) return null;
    const width = (y: number) => f.bottom + ((f.top - f.bottom) * (y + f.slant / 2)) / f.slant;
    return items.every((h, k) => !h.slot || Math.min(width(vs[k]! - up[k]! / 2), width(vs[k]! + up[k]! / 2)) >= h.slot.width + 2 * MARGIN) ? vs : null;
  };
  const on: Record<TaperWall, Item[]> = { front: [...drivers], back: [], left: [], right: [] };
  if (drivers.length && !column(drivers, "front")) notes.push(`${listName(drivers)} on the front wall: drawn overlapping.`);
  for (const g of groupsOf(others)) {
    const w = (["front", "back", "left", "right"] as const).find((x) => column([...on[x], ...g], x));
    if (w) on[w].push(...g);
    else {
      on.back.push(...g);
      notes.push(`${listName(g)} on any wall: drawn overlapping on the back.`);
    }
  }
  return (Object.keys(on) as TaperWall[]).flatMap((w) => {
    const items = on[w];
    const vs = column(items, w) ?? lineUp(items.map((h) => (h.slot ? h.slot.height : h.diameter)), walls[w].slant, MARGIN);
    return items.map((h, k) => ({ kind: h.kind, diameter: h.diameter, ...(h.slot ? { slot: h.slot } : {}), v: vs[k]!, on: w }));
  });
}

/** Items of one kind together (all the PRs, all the ports), so a group moves as one. */
function groupsOf(items: Item[]): Item[][] {
  const out: Item[][] = [];
  for (const h of items) {
    const g = out.find((x) => x[0]!.kind === h.kind);
    if (g) g.push(h);
    else out.push([h]);
  }
  return out;
}

const SHAPE_NAME: Record<AppState["volume"]["shape"], string> = {
  box: "box",
  wedge: "car wedge",
  cylinder: "tube",
  sphere: "sphere",
  frustum: "tapered box",
};

/** "3D view of the car wedge: 6 pieces (…)." for screen readers. */
export function sceneSummary(shape: AppState["volume"]["shape"], parts: MeshPart[]): string {
  const names: string[] = [];
  for (const p of parts) {
    const n = p.name.toLowerCase();
    if (!names.includes(n)) names.push(n);
  }
  const holes = parts.reduce((s, p) => s + p.holes.length, 0);
  return `3D view of the ${SHAPE_NAME[shape]}: ${parts.length} pieces (${names.join(", ")})${holes ? `, ${holes} ${holes === 1 ? "hole" : "holes"} for drivers and ports` : ""}.`;
}

const HOLE_NAME: Record<PanelHole["kind"], [string, string]> = {
  driver: ["driver cutout", "driver cutouts"],
  pr: ["passive radiator cutout", "passive radiator cutouts"],
  port: ["port hole", "port holes"],
};

/** What a piece is and what to cut it to, in the reader's units ("Side: cut 450 × 414, 18 thick"). */
export function partLabel(p: MeshPart, mm: (x: number) => string): string {
  let size = "";
  if (p.role === "cap") size = `⌀ ${mm(p.diameter!)} disc, ${mm(p.thickness!)} thick`;
  else if (p.role === "tube") size = `⌀ ${mm(p.diameter!)} outside, ${mm(p.length!)} long, ${mm(p.thickness!)} wall`;
  else if (p.role === "shell") size = `half of a ⌀ ${mm(p.diameter!)} sphere, ${mm(p.thickness!)} wall`;
  else if (p.blank) size = `cut ${mm(p.blank.a)} × ${mm(p.blank.b)}${p.thickness ? `, ${mm(p.thickness)} thick` : ""}`;
  const counts = new Map<PanelHole["kind"], number>();
  for (const h of p.holes) counts.set(h.kind, (counts.get(h.kind) ?? 0) + 1);
  const holes = [...counts].map(([k, n]) => `${n} ${HOLE_NAME[k][n === 1 ? 0 : 1]}`);
  return `${p.name}: ${size}${holes.length ? `; ${holes.join(", ")}` : ""}`;
}

/** Ticking "Show the inside" with the box assembled takes it half apart, so the tick does something. */
export const explodeForInside = (on: boolean, explode: number): number => (on && explode <= INSIDE_FROM ? 0.5 : explode);
