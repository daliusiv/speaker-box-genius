/**
 * SimRequest → the app's AppState. The app's own sections and design fields go through the
 * app's link parser (decodeState), so they're checked and defaulted exactly as a share link's;
 * the friendly parts (driver, drive, fb_hz, port, pr, size "auto") are applied on top with the
 * app's own helpers (presets.ts, sim.ts), as the matching buttons in the app do.
 */
import { estimateDriverDisplacement, evaluatePrCandidates, portLengthForFb, rankPrResults, type PrCandidate, type TsParam, type TsValues } from "@sbg/engine";
import { decodeState, newDesign, type AppState, type DesignKind, type PrDesign, type VentedDesign } from "../../web/src/state.ts";
import { airOf, driverInputOf, endCorrectionOf, portOf, simOptionsOf, solveDriver, vbOf } from "../../web/src/sim.ts";
import { bestVentedPort, prTuning, sizeAllForDriver } from "../../web/src/presets.ts";
import { loadDriverFrom, loadPrFrom, type Database, type LoadedDriver } from "./database.ts";
import { TS_KEYS, type DesignSpec, type DriverSpec, type SimRequest } from "./request.ts";

export class RequestError extends Error {
  /** Database ids that weren't found (the caller may suggest close ones). */
  readonly missing: { kind: "driver" | "pr"; id: string }[];
  constructor(message: string, missing: { kind: "driver" | "pr"; id: string }[] = []) {
    super(message);
    this.missing = missing;
  }
}

export interface BuildOptions {
  /** Where driver and PR ids are looked up. Needed when the request uses ids. */
  db?: Database;
  /** Passive radiators to choose from for a PR box with size "auto" and no PR given. */
  prCandidates?: () => Promise<PrCandidate[]>;
}

export interface Built {
  state: AppState;
  /** What was done or skipped on the way, in plain words (as the app's messages). */
  notes: string[];
}

const r1 = (v: number) => Math.round(v * 10) / 10;
const b64url = (text: string) => Buffer.from(text, "utf8").toString("base64url");

/** The app's link parser on a raw (compact) state: what opening a link with it gives. */
export function stateFromRaw(raw: Record<string, unknown>): AppState | null {
  return decodeState("s=" + b64url(JSON.stringify({ v: 4, ...raw })));
}

/** The app's driver fields for a database driver, as picking it in the app sets them (App.tsx onPick; site/drivers.ts driverState). */
export function withLoadedDriver(s: AppState, d: LoadedDriver): AppState {
  const disp = d.displacement_l ?? (d.cutout_mm !== undefined && d.depth_mm !== undefined ? Math.round(estimateDriverDisplacement(d.cutout_mm, d.depth_mm) * 100) / 100 : undefined);
  return {
    ...s,
    driverName: d.name,
    driverBrand: d.brand,
    driverOrigin: d.id,
    nominal_ohms: d.nominal_ohms ?? s.nominal_ohms,
    ts: { ...d.ts },
    le_mh: d.le_mh ?? 0,
    l2_mh: d.l2_mh ?? 0,
    r2_ohm: d.r2_ohm ?? 0,
    semi: undefined,
    fdd: undefined,
    xmax_mm: d.xmax_mm ?? 0,
    pe_w: d.pe_w ?? 0,
    volume: { ...s.volume, ...(disp !== undefined ? { driverDisp_l: disp } : {}), driverCutout_mm: d.cutout_mm ?? 0, driverDepth_mm: d.depth_mm ?? 0 },
    dvc: d.dvcWiring ? { on: true, entered: d.dvcWiring, wired: d.dvcWiring } : { ...s.dvc, on: false },
  };
}

/** Values given in the request over the driver (the database's, or none). */
function withDriverSpec(s: AppState, spec: DriverSpec, fromDb: boolean): AppState {
  const ts: TsValues = fromDb ? { ...s.ts } : {};
  for (const k of TS_KEYS) {
    const v = spec[k as keyof DriverSpec];
    if (typeof v === "number") ts[k as TsParam] = v;
  }
  // Qts given with only one of Qes/Qms: the solver works the other out; a stale database Qts would fight it.
  if (spec.qes !== undefined || spec.qms !== undefined) {
    if (spec.qts === undefined) delete ts.qts;
  }
  const out: AppState = {
    ...s,
    ts,
    ...(fromDb ? {} : { driverName: spec.name ?? "Custom driver", driverBrand: "", driverOrigin: undefined, le_mh: 0, l2_mh: 0, r2_ohm: 0, xmax_mm: 0, pe_w: 0, semi: undefined, fdd: undefined, dvc: { ...s.dvc, on: false } }),
  };
  if (spec.name !== undefined) out.driverName = spec.name;
  for (const k of ["nominal_ohms", "le_mh", "l2_mh", "r2_ohm", "xmax_mm", "pe_w", "rth_k_w", "tmax_C"] as const) {
    if (typeof spec[k] === "number") out[k] = spec[k];
  }
  // Advanced coil/suspension models and DVC: through the app's parser, so they're checked as a link's are.
  if (spec.semi !== undefined || spec.fdd !== undefined || spec.dvc !== undefined) {
    const parsed = stateFromRaw({ ...(spec.semi !== undefined ? { semi: spec.semi } : {}), ...(spec.fdd !== undefined ? { fdd: spec.fdd } : {}), ...(spec.dvc !== undefined ? { dvc: spec.dvc } : {}), power: 1 });
    if (parsed) {
      if (spec.semi !== undefined) out.semi = parsed.semi;
      if (spec.fdd !== undefined) out.fdd = parsed.fdd;
      if (spec.dvc !== undefined) out.dvc = parsed.dvc;
    }
  }
  // A database driver whose values were changed no longer counts as that driver (the app's rule: driverName.ts).
  if (fromDb && Object.keys(spec).some((k) => k !== "id")) out.driverName = spec.name ?? `${s.driverName} (modified)`;
  return out;
}

/** A design's raw fields for the link parser: its own fields, plus port/pr given the friendly way. */
function rawDesign(spec: DesignSpec, i: number, pr: { name: string; params: object; id?: string } | null, before: { id: string; name: string; kind: DesignKind }[]): Record<string, unknown> {
  const { kind, name, vb_l, size: _size, fb_hz: _fb, port, pr: prSpec, ...rest } = spec;
  // Default names as the app gives them when boxes are added one after another ("Ported", "Ported 2").
  const base = newDesign(kind, before as never);
  before.push({ id: `d${i + 1}`, name: name ?? base.name, kind });
  const out: Record<string, unknown> = { ...rest, kind, id: `d${i + 1}`, name: name ?? base.name, on: true };
  if (vb_l !== undefined) out.vb_l = vb_l;
  if (kind === "vented" && port) {
    if (port.diameter_cm !== undefined) Object.assign(out, { shape: "round", diameter_cm: port.diameter_cm });
    if (port.slot_w_cm !== undefined) Object.assign(out, { shape: "slot", slotWidth_cm: port.slot_w_cm, slotHeight_cm: port.slot_h_cm });
    if (port.count !== undefined) out.count = port.count;
    if (port.length_cm !== undefined) out.length_cm = port.length_cm;
    if (port.flare_cm !== undefined) out.flare_cm = port.flare_cm;
  }
  if (kind === "pr" && prSpec) {
    if (pr) Object.assign(out, { prName: prSpec.name ?? pr.name, params: pr.params, extra: [] }, pr.id ? { prId: pr.id } : { prId: undefined });
    if (prSpec.count !== undefined) out.count = prSpec.count;
    if (prSpec.added_mass_g !== undefined) out.addedMass_g = prSpec.added_mass_g;
  }
  return out;
}

export async function buildState(req: SimRequest, opts: BuildOptions = {}): Promise<Built> {
  const notes: string[] = [];
  const db = opts.db;

  // Database lookups first (all at once), so every missing id is reported together.
  const missing: RequestError["missing"] = [];
  let loaded: LoadedDriver | null = null;
  if (req.driver.id !== undefined) {
    if (!db) throw new RequestError("driver.id needs the driver database");
    loaded = await loadDriverFrom(db, req.driver.id);
    if (!loaded) missing.push({ kind: "driver", id: req.driver.id });
  }
  const prs = await Promise.all(
    req.designs.map(async (d) => {
      if (d.kind !== "pr" || !d.pr) return null;
      if (d.pr.params) return { name: d.pr.name ?? "Passive radiator", params: { qms: 10, ...d.pr.params } };
      if (d.pr.id === undefined) return null;
      if (!db) throw new RequestError("pr.id needs the driver database");
      const p = await loadPrFrom(db, d.pr.id);
      if (!p) {
        missing.push({ kind: "pr", id: d.pr.id });
        return null;
      }
      return { name: p.name, params: p.params, id: d.pr.id };
    }),
  );
  if (missing.length) throw new RequestError(missing.map((m) => `${m.kind === "driver" ? "Driver" : "Passive radiator"} "${m.id}" isn't in the database`).join("; "), missing);

  const raw: Record<string, unknown> = { power: 1, drive: "watts" };
  for (const k of ["settings", "highPass", "roomGain", "baffle", "passive", "volume", "eq", "measured", "compare"] as const) {
    if (req[k] !== undefined) raw[k] = req[k];
  }
  const before: { id: string; name: string; kind: DesignKind }[] = [];
  raw.designs = req.designs.map((d, i) => rawDesign(d, i, prs[i] ?? null, before));
  const parsed = stateFromRaw(raw);
  if (!parsed) throw new RequestError("The app couldn't read these settings");
  let s: AppState = parsed;
  if (s.designs.length !== req.designs.length) throw new RequestError("The app couldn't read one of the designs: check its fields against the app's");

  // Driver.
  if (loaded) s = withLoadedDriver(s, loaded);
  s = withDriverSpec(s, req.driver, !!loaded);
  if (req.count !== undefined) s = { ...s, drivers: req.count };
  if (req.wiring !== undefined) s = { ...s, wiring: req.wiring };
  if (req.isobaric !== undefined) s = { ...s, isobaric: req.isobaric };
  if (req.isoCoils !== undefined) s = { ...s, isoCoils: req.isoCoils };
  const solved = solveDriver(s);
  if (solved.missing.length) throw new RequestError(`The driver's parameters aren't complete: missing ${solved.missing.join(", ")}`);

  // Drive.
  const drive = req.drive;
  if (drive === "rated") {
    if (!(s.pe_w > 0)) throw new RequestError('drive "rated" needs the driver\'s power rating (pe_w)');
    s = { ...s, drive: "watts", power: Math.min(10000, Math.round(s.pe_w * s.drivers)) };
  } else if (drive && "volts" in drive) s = { ...s, drive: "volts", volts: drive.volts };
  else if (drive && "watts" in drive) s = { ...s, drive: "watts", power: drive.watts };

  // Tuning given as a frequency.
  const designs = [...s.designs];
  req.designs.forEach((spec, i) => {
    if (spec.fb_hz === undefined) return;
    const d = designs[i]!;
    const vb = vbOf(s, d);
    if (d.kind === "vented") {
      let v: VentedDesign = { ...d, targetFb: spec.fb_hz };
      if (spec.port?.length_cm === undefined) {
        const hasPort = spec.port?.diameter_cm !== undefined || spec.port?.slot_w_cm !== undefined;
        if (hasPort) {
          const len = portLengthForFb(vb, portOf(v, 0), spec.fb_hz, v.count, endCorrectionOf(s), airOf(s));
          if (!(len > 0)) throw new RequestError(`designs[${i}]: this port is too small to tune ${r1(vb)} L to ${spec.fb_hz} Hz; use a smaller or slot port, or leave the port out`);
          v = { ...v, length_cm: r1(len) };
        } else {
          const best = bestVentedPort(s, v, vb, spec.fb_hz);
          if (!best) throw new RequestError(`designs[${i}]: no simple port fits ${r1(vb)} L tuned to ${spec.fb_hz} Hz`);
          v = { ...v, ...best.fields };
          notes.push(`${v.name}: ${best.text}`);
        }
      }
      designs[i] = v;
    }
    if (d.kind === "pr") {
      const add = prTuning(d, vb, airOf(s)).massFor(spec.fb_hz);
      if (!(add >= 0) || add === Infinity) throw new RequestError(`designs[${i}]: these passive radiators can't reach ${spec.fb_hz} Hz in ${r1(vb)} L (it would take ${Number.isFinite(add) ? `${Math.round(add)} g` : "infinite mass"}); try more PRs, a bigger box or a higher tuning`);
      designs[i] = { ...d, targetFb: spec.fb_hz, addedMass_g: r1(add) };
    }
  });
  s = { ...s, designs };

  // Size "auto": the app's Size all boxes on just those designs.
  const autoIds = new Set(req.designs.flatMap((d, i) => (d.size === "auto" ? [s.designs[i]!.id] : [])));
  if (autoIds.size) {
    // A PR box with no PR given: the PR finder picks one first (as the driver pages do), at a QB3-like start.
    const sized = sizeAllForDriver({ ...s, designs: s.designs.filter((d) => autoIds.has(d.id)) });
    notes.push(...sized.changed, ...sized.skipped);
    const byId = new Map(sized.state.designs.map((d) => [d.id, d]));
    s = { ...s, designs: s.designs.map((d) => byId.get(d.id) ?? d) };
    const needPr = req.designs.flatMap((d, i) => (d.kind === "pr" && d.size === "auto" && !d.pr?.id && !d.pr?.params ? [i] : []));
    if (needPr.length) {
      if (!opts.prCandidates) throw new RequestError("A PR box sized \"auto\" without a PR needs the PR database");
      const cands = await opts.prCandidates();
      s = { ...s, designs: s.designs.map((d, i) => (needPr.includes(i) && d.kind === "pr" ? pickPr(s, d, cands, notes) : d)) };
    }
  }
  return { state: s, notes };
}

/** The best database PR for a sized PR box (the driver pages' rule: the PR finder's first that keeps within its limits). */
function pickPr(s: AppState, d: PrDesign, cands: PrCandidate[], notes: string[]): PrDesign {
  const solved = solveDriver(s);
  const best = rankPrResults(
    [...evaluatePrCandidates(driverInputOf(s, solved), cands, { vb_l: vbOf(s, d), targetFb: d.targetFb, sim: simOptionsOf(s), losses: s.settings.losses, counts: [1, 2, 4] })].flat(),
  ).find((x) => x.ok);
  if (!best) {
    notes.push(`${d.name}: no passive radiator in the database keeps up with it in ${r1(vbOf(s, d))} L at ${r1(d.targetFb)} Hz (left with the example PR)`);
    return d;
  }
  const c = cands.find((x) => x.id === best.id)!;
  notes.push(`${d.name}: ${best.count} × ${best.name}, ${Math.round(best.addedMass_g)} g added each`);
  return { ...d, prName: best.name, prId: best.id, params: { ...c.pr } as PrDesign["params"], count: best.count, addedMass_g: Math.round(best.addedMass_g), extra: [] };
}

