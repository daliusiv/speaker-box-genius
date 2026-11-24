/**
 * The MCP tools: thin wrappers over @sbg/headless, which runs the app's own code. Every tool is
 * read-only and works on the user's machine; the only network use is the database source's GETs
 * of the public /db/ files.
 */
import { evaluatePrCandidates, netVolume, rankPrResults, type Shape } from "@sbg/engine";
import {
  buildState,
  closestIds,
  didYouMean,
  driverRecord,
  fromState,
  prCandidates,
  RequestError,
  searchDrivers,
  simRequestSchema,
  simulateRequest,
  simulateState,
  stateFromLink,
  validateRequest,
  driverSchema,
  type Database,
  type DesignSpec,
  type SimRequest,
} from "@sbg/headless";
import { driverInputOf, simOptionsOf, solveDriver, vbOf } from "../../web/src/sim.ts";

export interface ToolContext {
  db: Database;
  site?: string;
}

export class ToolError extends Error {}

type Args = Record<string, unknown>;

export interface Tool {
  name: string;
  title: string;
  description: string;
  inputSchema: Record<string, unknown>;
  run: (args: Args, ctx: ToolContext) => Promise<unknown>;
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

function only(args: Args, allowed: string[], tool: string) {
  for (const k of Object.keys(args)) if (!allowed.includes(k)) throw new ToolError(`${tool}: unknown argument \`${k}\`${didYouMean(k, allowed)}`);
}

/** Simulate a request; ids that aren't in the database come back with close ones to try. */
async function simulateChecked(req: unknown, ctx: ToolContext, notes: string[] = []) {
  const errors = validateRequest(req);
  if (errors.length) throw new ToolError(`The request has ${errors.length === 1 ? "an error" : "errors"}:\n- ${errors.join("\n- ")}`);
  try {
    const r = await simulateRequest(req as SimRequest, { db: ctx.db, prCandidates: () => prCandidates(ctx.db), site: ctx.site });
    r.notes.unshift(...notes);
    return r;
  } catch (e) {
    throw await explain(e, ctx);
  }
}

async function explain(e: unknown, ctx: ToolContext): Promise<Error> {
  if (e instanceof RequestError && e.missing.length) {
    const index = await ctx.db.index();
    const lines = e.missing.map((m) => {
      const near = closestIds(index, m.id, 5, m.kind);
      return `${m.kind === "driver" ? "Driver" : "Passive radiator"} "${m.id}" isn't in the database.${near.length ? ` Close ones: ${near.join(", ")}.` : ""} Search with ${m.kind === "driver" ? "search_drivers" : "find_passive_radiators"}.`;
    });
    return new ToolError(lines.join("\n"));
  }
  if (e instanceof RequestError || e instanceof ToolError) return new ToolError(e.message);
  return e instanceof Error ? e : new Error(String(e));
}

const searchDriversTool: Tool = {
  name: "search_drivers",
  title: "Search drivers",
  description:
    "Search Speaker Box Genius's driver database (about 1,900 woofers, subwoofers and full-range drivers, mostly manufacturer data used with permission) by name and/or filters. Returns ids to use in simulate, suggest_boxes and get_driver.",
  inputSchema: {
    type: "object",
    properties: {
      query: { type: "string", description: 'Brand and/or model, e.g. "dayton rss315" or "SB Acoustics 6.5".' },
      type: { type: "string", description: "Driver type, e.g. woofer, subwoofer, midwoofer, full-range, car-audio." },
      size_in: { type: "number", description: "Nominal size in inches (±0.3)." },
      fs_max: { type: "number", description: "Highest Fs (Hz)." },
      qts_max: { type: "number", description: "Highest Qts." },
      xmax_min: { type: "number", description: "Lowest Xmax (mm)." },
      limit: { type: "integer", minimum: 1, maximum: 25, description: "Default 10." },
    },
    additionalProperties: false,
  },
  async run(args, ctx) {
    only(args, ["query", "type", "size_in", "fs_max", "qts_max", "xmax_min", "limit"], "search_drivers");
    const r = searchDrivers(await ctx.db.index(), args);
    return {
      total: r.total,
      drivers: r.results.map((d) => ({ id: d.id, brand: d.brand, model: d.model, type: d.type, ohms: d.ohms, size_in: d.size_in, fs: d.fs, qts: d.qts, vas_l: d.vas_l, xmax_mm: d.xmax_mm, pe_w: d.pe_w, ...(d.flags ? { check_datasheet: d.flags } : {}) })),
      ...(r.total > r.results.length ? { more: `${r.total - r.results.length} more: narrow the query or raise limit (max 25)` } : {}),
    };
  },
};

const getDriverTool: Tool = {
  name: "get_driver",
  title: "Get a driver",
  description: "A driver's full database record: every published T/S value, physical sizes, where the values came from (with links) and the data's licence.",
  inputSchema: { type: "object", properties: { id: { type: "string", description: 'Database id, "brand/model".' } }, required: ["id"], additionalProperties: false },
  async run(args, ctx) {
    only(args, ["id"], "get_driver");
    if (typeof args.id !== "string") throw new ToolError("get_driver: id is required");
    const rec = await driverRecord(ctx.db, args.id);
    if (!rec) throw await explain(new RequestError("", [{ kind: "driver", id: args.id }]), ctx);
    const index = await ctx.db.index();
    const brand = (index as { brands?: Record<string, { name: string; website?: string; licence?: string }> }).brands?.[args.id.split("/")[0]!];
    return {
      id: args.id,
      ...rec,
      licence: brand?.licence ?? "CC BY-NC-SA 4.0 (Speaker Box Genius contributors); see each source for where the values came from",
      ...(brand?.website ? { brand_website: brand.website } : {}),
    };
  },
};

const simulateTool: Tool = {
  name: "simulate",
  title: "Simulate boxes",
  description:
    "Simulate up to 8 boxes for one driver with Speaker Box Genius's engine (validated against WinISD, Hornresp and SPICE). Returns per box: F3/F6/F10, tuning, Qtc, cone and PR excursion and port air speed against their limits at the drive, the highest safe drive, max SPL and what limits it, sampled curves, and a share link that opens the same design in the app (give it to the user). Defaults match WinISD (1 W, Ql 10).",
  inputSchema: simRequestSchema as unknown as Record<string, unknown>,
  run: (args, ctx) => simulateChecked(args, ctx),
};

const DEFAULT_KINDS = ["sealed", "vented", "pr"] as const;

const suggestBoxesTool: Tool = {
  name: "suggest_boxes",
  title: "Suggest boxes",
  description:
    "Size boxes for a driver as the app's Size all boxes does: sealed at Qtc 0.707, ported and PR at WinISD's flat alignment (QB3), bandpass by its own rule; a port that fits and a database PR chosen by the PR finder. Judged at the driver's power rating unless a drive is given. Returns the same as simulate, plus why a box type was skipped.",
  inputSchema: {
    type: "object",
    properties: {
      driver: driverSchema,
      kinds: { type: "array", items: { type: "string", enum: ["sealed", "vented", "pr", "bandpass"] }, description: "Default sealed, vented, pr." },
      count: { type: "integer", minimum: 1, maximum: 16, description: "Drivers per box (default 1)." },
      drive: (simRequestSchema.properties as Record<string, unknown>).drive,
      settings: (simRequestSchema.properties as Record<string, unknown>).settings,
      output: (simRequestSchema.properties as Record<string, unknown>).output,
    },
    required: ["driver"],
    additionalProperties: false,
  },
  async run(args, ctx) {
    only(args, ["driver", "kinds", "count", "drive", "settings", "output"], "suggest_boxes");
    const kinds = Array.isArray(args.kinds) && args.kinds.length ? args.kinds : DEFAULT_KINDS;
    const pe = isObj(args.driver) && typeof args.driver.pe_w === "number" ? args.driver.pe_w : undefined;
    let rated = pe !== undefined && pe > 0;
    if (!rated && isObj(args.driver) && typeof args.driver.id === "string") {
      const rec = await driverRecord(ctx.db, args.driver.id);
      rated = !!rec?.ts.pe_w;
    }
    const req = {
      driver: args.driver,
      ...(args.count !== undefined ? { count: args.count } : {}),
      drive: args.drive ?? (rated ? "rated" : { watts: 1 }),
      designs: kinds.map((kind) => ({ kind, size: "auto" })) as DesignSpec[],
      ...(args.settings !== undefined ? { settings: args.settings } : {}),
      ...(args.output !== undefined ? { output: args.output } : {}),
    };
    return simulateChecked(req, ctx);
  },
};

const findPrTool: Tool = {
  name: "find_passive_radiators",
  title: "Find passive radiators",
  description:
    "The app's PR finder: every passive radiator in the database (and how many, with how much added mass) that tunes a box of vb_l litres to fb_hz for this driver, best first, with why the others fail (too much added mass, runs out of travel before the woofer, too big for the box). Judged at the driver's power rating unless a drive is given.",
  inputSchema: {
    type: "object",
    properties: {
      driver: driverSchema,
      vb_l: { type: "number", description: "Net box volume (litres)." },
      fb_hz: { type: "number", description: "Tuning to reach with added mass (Hz)." },
      counts: { type: "array", items: { type: "integer", minimum: 1 }, description: "PR counts to try (default 1, 2, 4)." },
      drive: (simRequestSchema.properties as Record<string, unknown>).drive,
      include_failing: { type: "boolean", description: "Also list PRs that don't pass (default false)." },
      limit: { type: "integer", minimum: 1, maximum: 25, description: "Default 10." },
    },
    required: ["driver", "vb_l", "fb_hz"],
    additionalProperties: false,
  },
  async run(args, ctx) {
    only(args, ["driver", "vb_l", "fb_hz", "counts", "drive", "include_failing", "limit"], "find_passive_radiators");
    if (!(typeof args.vb_l === "number" && args.vb_l > 0) || !(typeof args.fb_hz === "number" && args.fb_hz > 0)) throw new ToolError("find_passive_radiators: vb_l and fb_hz must be numbers > 0");
    const req = { driver: args.driver, drive: args.drive ?? { watts: 1 }, designs: [{ kind: "pr", vb_l: args.vb_l, pr: { params: { mms_g: 100, sd_cm2: 300, xmax_mm: 10, vas_l: 50 } } }] } as SimRequest;
    const errors = validateRequest(req);
    if (errors.length) throw new ToolError(`The request has errors:\n- ${errors.join("\n- ")}`);
    let state;
    try {
      ({ state } = await buildState(req, { db: ctx.db }));
    } catch (e) {
      throw await explain(e, ctx);
    }
    if (args.drive === undefined && state.pe_w > 0) state = { ...state, drive: "watts" as const, power: Math.min(10000, Math.round(state.pe_w * state.drivers)) };
    const solved = solveDriver(state);
    const d = state.designs[0]!;
    const counts = Array.isArray(args.counts) && args.counts.length ? (args.counts as number[]) : [1, 2, 4];
    const ranked = rankPrResults(
      [...evaluatePrCandidates(driverInputOf(state, solved), await prCandidates(ctx.db), { vb_l: vbOf(state, d), targetFb: args.fb_hz, sim: simOptionsOf(state), losses: state.settings.losses, counts })].flat(),
    );
    const limit = Math.max(1, Math.min(25, typeof args.limit === "number" ? Math.floor(args.limit) : 10));
    const shown = (args.include_failing ? ranked : ranked.filter((x) => x.ok)).slice(0, limit);
    const r1 = (v: number) => Math.round(v * 10) / 10;
    return {
      driver: state.driverName,
      box: { vb_l: args.vb_l, fb_hz: args.fb_hz },
      judged_at: state.drive === "volts" ? `${state.volts} V` : `${state.power} W`,
      passing: ranked.filter((x) => x.ok).length,
      results: shown.map((x) => ({
        id: x.id,
        name: x.name,
        count: x.count,
        added_mass_g: Math.round(x.addedMass_g),
        mass_ratio: r1(x.massRatio),
        fb_hz: r1(x.fb),
        f3_hz: x.f3 === null ? null : r1(x.f3),
        pr_travel_used_at_woofer_xmax: Math.round(x.prUse * 100) / 100,
        frame_cm: r1(x.od_cm),
        ok: x.ok,
        ...(x.reason ? { why_not: x.reason } : {}),
      })),
      next: 'Simulate one with simulate: designs [{ "kind": "pr", "vb_l": …, "pr": { "id": …, "count": … }, "fb_hz": … }]',
    };
  },
};

const readShareLinkTool: Tool = {
  name: "read_share_link",
  title: "Read a share link",
  description:
    "Open a Speaker Box Genius share link (https://speakerboxgenius.com/#z=… or #s=…, e.g. from a forum post) and return its design as a simulate request (to change and re-run) and its results, the numbers the app shows for it.",
  inputSchema: {
    type: "object",
    properties: { url: { type: "string", description: "The share link, or just the part after #." }, output: (simRequestSchema.properties as Record<string, unknown>).output },
    required: ["url"],
    additionalProperties: false,
  },
  async run(args, ctx) {
    only(args, ["url", "output"], "read_share_link");
    if (typeof args.url !== "string") throw new ToolError("read_share_link: url is required");
    const s = await stateFromLink(args.url);
    if (!s) throw new ToolError("That isn't a Speaker Box Genius share link (it should have #z=… or #s=… after the address), or it's damaged.");
    const off = s.designs.filter((d) => !d.on).map((d) => d.name);
    const shown = { ...s, designs: s.designs.map((d) => ({ ...d, on: true })) };
    const result = await simulateState(shown, isObj(args.output) ? args.output : undefined, off.length ? [`Hidden in the link, shown here: ${off.join(", ")}`] : [], ctx.site);
    return { request: fromState(s), result };
  },
};

const boxVolumeTool: Tool = {
  name: "box_volume",
  title: "Box volume",
  description:
    "The app's volume calculator: internal volume of a box, wedge, tapered box, cylinder or sphere from its outside sizes and wall thickness, minus what's inside it (drivers, PRs, port tubes, bracing, crossover). Use the net volume as vb_l.",
  inputSchema: {
    type: "object",
    properties: {
      shape: {
        type: "object",
        description:
          'Outside sizes (cm). box: {kind:"box", width_cm, height_cm, depth_cm}; wedge (car): {kind:"wedge", width_cm, height_cm, topDepth_cm, bottomDepth_cm, slopeWall_mm?, lip_cm?}; tapered: {kind:"frustum", bottomWidth_cm, bottomDepth_cm, topWidth_cm, topDepth_cm, height_cm}; tube: {kind:"cylinder", diameter_cm, length_cm, capWall_mm?}; {kind:"sphere", diameter_cm}.',
      },
      wall_mm: { type: "number", description: "Wall thickness (mm)." },
      drivers: { type: "object", properties: { count: { type: "integer" }, displacement_l: { type: "number" } } },
      passive_radiators: { type: "object", properties: { count: { type: "integer" }, displacement_l: { type: "number" } } },
      ports: { type: "object", description: "Port tubes or slots inside: {count, length_cm, wall_mm, innerDiameter_cm} or {count, length_cm, wall_mm, slot: {width_cm, height_cm}}." },
      bracing_pct: { type: "number", description: "Bracing as % of the gross volume." },
      other_l: { type: "number", description: "Crossover, plate amp, terminal cup… (litres)." },
    },
    required: ["shape", "wall_mm"],
    additionalProperties: false,
  },
  async run(args) {
    only(args, ["shape", "wall_mm", "drivers", "passive_radiators", "ports", "bracing_pct", "other_l"], "box_volume");
    const shape = args.shape;
    const kinds = ["box", "wedge", "frustum", "cylinder", "sphere"];
    if (!isObj(shape) || !kinds.includes(shape.kind as string)) throw new ToolError(`box_volume: shape.kind is one of ${kinds.join(", ")}`);
    for (const [k, v] of Object.entries(shape)) if (k !== "kind" && !(typeof v === "number" && v >= 0)) throw new ToolError(`box_volume: shape.${k} must be a number ≥ 0`);
    if (!(typeof args.wall_mm === "number" && args.wall_mm >= 0)) throw new ToolError("box_volume: wall_mm must be a number ≥ 0");
    const r = netVolume({
      shape: shape as unknown as Shape,
      wall_mm: args.wall_mm,
      ...(isObj(args.drivers) ? { drivers: args.drivers as { count: number; displacement_l: number } } : {}),
      ...(isObj(args.passive_radiators) ? { passiveRadiators: args.passive_radiators as { count: number; displacement_l: number } } : {}),
      ...(isObj(args.ports) ? { ports: args.ports as never } : {}),
      ...(typeof args.bracing_pct === "number" ? { bracing_pct: args.bracing_pct } : {}),
      ...(typeof args.other_l === "number" ? { other_l: args.other_l } : {}),
    });
    const r2 = (v: number) => Math.round(v * 100) / 100;
    if (!(r.gross_l > 0)) throw new ToolError("box_volume: the walls leave no room inside: check the sizes (cm) and wall thickness (mm)");
    return { gross_l: r2(r.gross_l), deductions: r.deductions.map((d) => ({ ...d, litres: r2(d.litres) })), net_l: r2(r.net_l) };
  },
};

export const TOOLS: Tool[] = [searchDriversTool, getDriverTool, simulateTool, suggestBoxesTool, findPrTool, readShareLinkTool, boxVolumeTool];

