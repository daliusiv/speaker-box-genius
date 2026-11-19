/**
 * The box volume calculator page (/calculators/box-volume/). The page's HTML comes from the site
 * build (site/calculators.ts); this script reads its form, works out the net volume with the
 * app's own volume code (boxVolumeMath.ts), or the outside size for a net volume, and keeps the
 * form in the page address. "Open in the simulator" opens the box in the app's Build tab, linked
 * to a sealed, ported or PR box that follows it.
 */
import { DEFAULT_STATE, encodeStateShort, type AppState, type ShapeKind } from "../state.ts";
import { withDriver } from "../assistant.ts";
import { estimateDriverDisplacement } from "@sbg/engine";
import { loadDriver, loadIndex, loadPassiveRadiator, type DbIndex, type LoadedDriver } from "../library.ts";
import { $, applyValues, esc, pageQuery, readForm, val, wireCopyLink } from "./common.ts";
import { wireCombos } from "./combo.ts";
import type { QuerySpec } from "./query.ts";
import { ALL_SIZINGS, boxVolume, SHAPE_IDS, sizeFor, sizingFor, sizingOptions, stateOf, type BoxForm, type BoxVolume, type PickedPr, type Sizing } from "./boxVolumeMath.ts";
import { MM_KEYS, OUTLINES, outlineCaption, SHAPE_FIELDS, SHAPE_NOUN, SIZE_KEYS } from "./boxShapes.ts";

const L_PER_FT3 = 28.316846592;
/** Display unit → metric, per quantity, in imperial. */
const TO_METRIC = { len: 2.54, mm: 25.4, vol: L_PER_FT3 } as const;
type Q = keyof typeof TO_METRIC;
const UNIT = { metric: { len: "cm", mm: "mm", vol: "L" }, imperial: { len: "in", mm: "in", vol: "ft³" } } as const;
/** Decimals a converted value is shown with. */
const DP = { metric: { len: 1, mm: 1, vol: 2 }, imperial: { len: 3, mm: 3, vol: 3 } } as const;

const num = (k: string) => ({ id: `bv-${k}`, kind: "num" as const });

/** The inputs kept in the page address (see query.ts); `d` and `pr` are the picked driver's and PR's database ids. */
export const BOX_VOLUME_QUERY: QuerySpec = {
  u: { id: "bv-imperial", kind: "check", on: "in" },
  m: { id: "bv-mode-size", kind: "check", on: "size" },
  s: { id: "bv-shape", kind: "choice", choices: SHAPE_IDS },
  tgt: num("target"),
  r: { id: "bv-ratio", kind: "choice", choices: ALL_SIZINGS },
  w: num("w"),
  h: num("h"),
  d: { id: "bv-driver", kind: "text" },
  dd: num("dd"),
  n: { id: "bv-n", kind: "int" },
  dia: num("dia"),
  len: num("len"),
  tw: num("tw"),
  td: num("td"),
  bw: num("bw"),
  bd: num("bd"),
  dp: num("d"),
  t: num("wall"),
  cap: num("cap"),
  sw: num("sw"),
  lip: num("lip"),
  np: num("np"),
  pd: num("pd"),
  pr: { id: "bv-pr", kind: "text" },
  pc: num("pc"),
  pt: { id: "bv-pt", kind: "choice", choices: ["round", "slot"] },
  pdia: num("pdia"),
  pw: num("pw"),
  ph: num("ph"),
  pl: num("pl"),
  pwt: num("pwt"),
  br: num("br"),
  o: num("o"),
};

const imperial = () => $<HTMLInputElement>("bv-imperial")?.checked === true;
const sys = () => (imperial() ? "imperial" : "metric");
const bySize = () => $<HTMLInputElement>("bv-mode-size")?.checked === true;
const shape = () => ($<HTMLInputElement>("bv-shape")?.value ?? "box") as ShapeKind;

/** A field in metric (its `data-q` says what it holds); 0 when empty. */
function metric(id: string): number {
  const el = $<HTMLInputElement>(id);
  const v = val(id);
  const q = el?.dataset.q as Q | undefined;
  return q && imperial() ? v * TO_METRIC[q] : v;
}
/** An optional field (empty = null) in metric. */
const optional = (id: string) => (($<HTMLInputElement>(id)?.value ?? "").trim() === "" ? null : metric(id));

function readBox(): BoxForm {
  const L = (k: string) => metric(`bv-${k}`);
  return {
    shape: shape(),
    w: L("w"),
    h: L("h"),
    d: L("d"),
    dia: L("dia"),
    len: L("len"),
    tw: L("tw"),
    td: L("td"),
    bw: L("bw"),
    bd: L("bd"),
    lip: L("lip"),
    wall: L("wall"),
    cap: optional("bv-cap"),
    sw: optional("bv-sw"),
    n: val("bv-n"),
    dd: L("dd"),
    np: val("bv-np"),
    pd: L("pd"),
    pc: val("bv-pc"),
    pt: $<HTMLSelectElement>("bv-pt")?.value === "slot" ? "slot" : "round",
    pdia: L("pdia"),
    pw: L("pw"),
    ph: L("ph"),
    pl: L("pl"),
    pwt: L("pwt"),
    br: val("bv-br"),
    o: L("o"),
  };
}

/** Shows a metric value in a field, in the units chosen. */
function show(id: string, metricValue: number) {
  const el = $<HTMLInputElement>(id);
  if (!el) return;
  const q = (el.dataset.q ?? "len") as Q;
  const v = imperial() ? metricValue / TO_METRIC[q] : metricValue;
  el.value = String(Number(v.toFixed(DP[sys()][q])));
  delete el.dataset.prev;
  delete el.dataset.conv;
}

/** Puts a sized box's outside sizes into the size fields. */
function writeSizes(f: BoxForm) {
  for (const { key } of SHAPE_FIELDS[f.shape]) if (!MM_KEYS.has(key)) show(`bv-${key}`, f[key] as number);
}

// ---- Text ----

const vol = (l: number, dp = 2) => (imperial() ? `${(l / L_PER_FT3).toFixed(dp + 1)} ft³` : `${l.toFixed(dp)} L`);
const len = (cm: number, dp = 1) => (imperial() ? `${(cm / 2.54).toFixed(dp)} in` : `${cm.toFixed(dp)} cm`);
const lenN = (cm: number) => (imperial() ? (cm / 2.54).toFixed(1) : cm.toFixed(1));
const lenU = () => (imperial() ? "in" : "cm");

/** "a 40 × 50 × 45 cm box (W × H × D)", as the app's Size for a volume says it. */
function describe(f: BoxForm): string {
  switch (f.shape) {
    case "box":
      return `a ${lenN(f.w)} × ${lenN(f.h)} × ${lenN(f.d)} ${lenU()} box (W × H × D)`;
    case "cylinder":
      return `a cylinder ${len(f.dia)} across and ${len(f.len)} long`;
    case "sphere":
      return `a sphere ${len(f.dia)} across`;
    case "wedge":
      return `a wedge ${len(f.w)} wide, ${len(f.h)} tall, ${len(f.td)} deep at the top and ${len(f.bd)} at the bottom${f.lip > 0 ? `, with a ${len(f.lip)} lip` : ""}`;
    case "frustum":
      return `a tapered box ${lenN(f.bw)} × ${lenN(f.bd)} ${lenU()} at the base, ${lenN(f.tw)} × ${lenN(f.td)} ${lenU()} at the top, ${len(f.h)} tall`;
  }
}
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function resultHtml(b: BoxVolume): string {
  const net = b.r.net_l;
  const big = imperial() ? `<strong>${(net / L_PER_FT3).toFixed(2)} ft³</strong><span>net (${net.toFixed(2)} L)</span>` : `<strong>${net.toFixed(2)} L</strong><span>net (${(net / L_PER_FT3).toFixed(2)} ft³)</span>`;
  const out = [`<p class="calc-net">${big}</p>`];
  if (b.problem === "walls") {
    out.push(`<p class="calc-note">The walls take up the whole box: make it bigger or the walls thinner.</p>`);
    return out.join("");
  }
  const rows = [
    `<tr><th>Gross internal</th><td>${vol(b.r.gross_l)}</td></tr>`,
    ...b.r.deductions.map((d) => `<tr><th>− ${esc(d.label)}</th><td>${vol(d.litres)}</td></tr>`),
    `<tr class="total"><th>Net</th><td>${vol(net)}</td></tr>`,
  ];
  out.push(`<table class="calc-out"><tbody>${rows.join("")}</tbody></table>`);
  if (b.problem === "parts") out.push(`<p class="calc-note">The parts take up the whole box: no air is left. Make the box bigger, or take something out.</p>`);
  if (b.prLeftOut) out.push(`<p class="calc-note">The passive radiators aren't taken off: a box has ports or passive radiators, not both. Set the number of ports to 0 for a passive radiator box.</p>`);
  const mode = Number.isFinite(b.mode_hz) ? ` · lowest standing wave ≈ ${Math.round(b.mode_hz)} Hz` : "";
  out.push(`<p class="calc-note">Longest inside ${len(b.longest_cm)}${mode}</p>`);
  out.push(
    `<p class="calc-note">Stuffing isn't taken off here: the fibre itself is about 1% of the box. Set it on the box in the simulator (it makes the box act bigger); see <a href="/guides/box-stuffing/">box stuffing</a>.</p>`,
  );
  return out.join("");
}

// ---- Database driver and PR ----

let index: DbIndex | null = null;
let indexWait: Promise<DbIndex | null> | null = null;
let driver: LoadedDriver | null = null;
let driverId = "";
let pr: (PickedPr & { size?: number }) | null = null;
let prId = "";

function ensureIndex(): Promise<DbIndex | null> {
  indexWait ??= loadIndex().then(
    (ix) => {
      index = ix;
      const dl = $("bv-drivers");
      if (dl) dl.innerHTML = ix.drivers.map((d) => `<option value="${esc(`${d.brand} ${d.model}`)}"></option>`).join("");
      const pl = $("bv-prs");
      if (pl) pl.innerHTML = ix.passiveRadiators.map((p) => `<option value="${esc(`${p.brand} ${p.model}`)}"></option>`).join("");
      return ix;
    },
    () => {
      setStatus("bv-driver-status", "Couldn't load the driver list.");
      return null;
    },
  );
  return indexWait;
}

const setStatus = (id: string, html: string) => {
  const s = $(id);
  if (s) s.innerHTML = html;
};

/** Whether a database displacement is the cutout × depth estimate (the database has no datasheet value). */
export function isEstimate(d: { displacement_l?: number; cutout_mm?: number; depth_mm?: number }): boolean {
  if (d.displacement_l === undefined || d.cutout_mm === undefined || d.depth_mm === undefined) return false;
  return d.displacement_l === Math.round(estimateDriverDisplacement(d.cutout_mm, d.depth_mm) * 100) / 100;
}

function driverStatus(d: LoadedDriver, size?: number): string {
  const parts = [size ? `${size}″` : "", d.cutout_mm ? `cutout ${d.cutout_mm} mm` : "", d.depth_mm ? `depth ${d.depth_mm} mm` : ""].filter(Boolean);
  const each = d.displacement_l === undefined ? "" : vol(d.displacement_l);
  if (d.displacement_l === undefined) parts.push("no displacement in the database: enter it under Each driver");
  else if (isEstimate(d)) parts.push(`<span class="calc-est">≈ ${each} each, estimated</span> from cutout and depth (no datasheet value)`);
  else parts.push(`${each} each, from the datasheet`);
  return parts.join(" · ");
}

async function pickDriver(id: string, fill: boolean, status = true) {
  try {
    const d = await loadDriver(id);
    driver = d;
    driverId = id;
    const pick = $<HTMLInputElement>("bv-driver");
    if (pick) pick.value = d.name;
    if (fill && d.displacement_l !== undefined) show("bv-dd", d.displacement_l);
    const size = index?.drivers.find((r) => r.id === id)?.size_in;
    if (status) setStatus("bv-driver-status", driverStatus(d, size));
  } catch {
    setStatus("bv-driver-status", "Couldn't load that driver.");
  }
}

async function pickPr(id: string, fill: boolean) {
  try {
    const p = await loadPassiveRadiator(id);
    const size = index?.passiveRadiators.find((r) => r.id === id)?.size_in;
    pr = { id, name: p.name, params: p.params, ...(size ? { size } : {}) };
    prId = id;
    const pick = $<HTMLInputElement>("bv-pr");
    if (pick) pick.value = p.name;
    if (fill) {
      if (p.displacement_l !== undefined) show("bv-pd", p.displacement_l);
      const n = $<HTMLInputElement>("bv-np");
      if (n && !(val("bv-np") >= 1)) n.value = "1";
    }
    const parts = [size ? `${size}″` : "", p.cutout_mm ? `cutout ${p.cutout_mm} mm` : ""].filter(Boolean);
    parts.push(p.displacement_l === undefined ? "no displacement in the database: enter it under Each PR" : `${vol(p.displacement_l)} each, from the database`);
    setStatus("bv-pr-status", parts.join(" · "));
  } catch {
    setStatus("bv-pr-status", "Couldn't load that passive radiator.");
  }
}

function wirePicker(inputId: string, statusId: string, list: () => { id: string; brand: string; model: string }[], pick: (id: string) => Promise<void>, clear: () => void, what: string) {
  const el = $<HTMLInputElement>(inputId);
  el?.addEventListener("focus", () => void ensureIndex(), { once: true });
  el?.addEventListener("change", () => {
    const name = el.value.trim();
    if (!name) {
      clear();
      setStatus(statusId, "");
      return schedule(true);
    }
    const row = list().find((d) => `${d.brand} ${d.model}` === name);
    if (!row) {
      setStatus(statusId, `Pick a ${what} from the list, or type its displacement below.`);
      return;
    }
    void pick(row.id).then(() => schedule(true));
  });
}

// ---- Shape, mode and units ----

/** Shows the chosen shape's fields (in its order, with its names), outline and sizing choices. */
function syncShape(ratio?: string) {
  const s = shape();
  const fields = SHAPE_FIELDS[s];
  for (const key of SIZE_KEYS) {
    const wrap = document.querySelector<HTMLElement>(`[data-size="${key}"]`);
    if (!wrap) continue;
    const i = fields.findIndex((f) => f.key === key);
    wrap.hidden = i < 0;
    if (i < 0) continue;
    wrap.style.order = String(i);
    const f = fields[i]!;
    const label = wrap.querySelector("span");
    if (label) label.textContent = f.label;
    const input = wrap.querySelector("input");
    if (input) input.title = f.help;
  }
  const svg = $("bv-svg");
  if (svg && svg.dataset.shape !== s) {
    svg.innerHTML = OUTLINES[s];
    svg.dataset.shape = s;
  }
  const sel = $<HTMLSelectElement>("bv-ratio");
  if (sel) {
    const want = sizingFor(s, ratio ?? sel.value);
    sel.innerHTML = sizingOptions(s)
      .map((o) => `<option value="${o.value}"${o.value === want ? " selected" : ""}>${o.text}</option>`)
      .join("");
    sel.value = want;
    const lab = $("bv-ratio-label");
    if (lab) lab.textContent = s === "wedge" ? "Solve for" : "Ratio";
  }
  document.querySelectorAll<HTMLInputElement>('input[name="bv-shape-chip"]').forEach((c) => (c.checked = c.value === s));
}

function syncMode() {
  const sizing = $("bv-sizing");
  if (sizing) sizing.hidden = !bySize();
  const done = $("bv-done");
  if (done && !bySize()) done.hidden = true;
}

function syncPort() {
  const slot = $<HTMLSelectElement>("bv-pt")?.value === "slot";
  document.querySelectorAll<HTMLElement>("[data-port]").forEach((el) => (el.hidden = (el.dataset.port === "slot") !== slot));
}

function convertUnits(toImperial: boolean) {
  document.querySelectorAll<HTMLInputElement>("#bv-form input[data-q]").forEach((el) => {
    if (el.value === "") return;
    const q = el.dataset.q as Q;
    // Switching back without editing restores the exact value typed, not a rounded round trip.
    const back = el.dataset.conv === el.value ? el.dataset.prev : undefined;
    const k = toImperial ? 1 / TO_METRIC[q] : TO_METRIC[q];
    const next = back ?? String(Number((Number(el.value.replace(",", ".")) * k).toFixed(DP[toImperial ? "imperial" : "metric"][q])));
    el.dataset.prev = el.value;
    el.dataset.conv = next;
    el.value = next;
  });
  const u = UNIT[toImperial ? "imperial" : "metric"];
  document.querySelectorAll<HTMLElement>("#bv-form [data-u]").forEach((e) => (e.textContent = u[e.dataset.u as Q]));
}

// ---- Update ----

let query: ReturnType<typeof pageQuery>;
/** The form as served (metric), by link key. */
let metricDefaults: Record<string, string> = {};
let timer = 0;
let pendingResize = false;
/** Size the box for the target on the next update (anything but a size field changed, in sizing mode). */
const schedule = (resize = false) => {
  pendingResize ||= resize;
  clearTimeout(timer);
  timer = window.setTimeout(() => {
    const r = pendingResize;
    pendingResize = false;
    void update(r);
  }, 120);
};

/** The last sizing: how it went, for which target, and the box it gave (to tell when a size has been changed since). */
let sized: { kind: "empty" | "none" | "ok" | "near"; target: number; sig: string } | null = null;
const sigOf = (f: BoxForm) => SIZE_KEYS.map((k) => (typeof f[k] === "number" ? (f[k] as number).toFixed(1) : "")).join("|") + f.shape;

/** The line under the sizes in sizing mode. */
function doneText(f: BoxForm): string {
  const target = metric("bv-target");
  const got = vol(boxVolume(f).r.net_l);
  if (!(target > 0)) return "Enter the net volume you want.";
  if (sized && sized.target === target && (sized.kind === "none" || sized.sig === sigOf(f))) {
    if (sized.kind === "none") return `No size reaches ${vol(target, 1)}: the deductions alone are larger. Lower them or aim higher.`;
    if (sized.kind === "ok") return `${cap(describe(f))} gives ${got} net. Sizes filled in above; change any of them to check another box.`;
    if (sized.kind === "near") return `Target not reachable with these locks. Nearest: ${describe(f)}, ${got}. Solve for another dimension, or keep the proportions.`;
  }
  return `${cap(describe(f))} gives ${got} net (the target is ${vol(target, 1)}).`;
}

function hintFor(f: BoxForm, b: BoxVolume): string {
  const who = driver ? "this driver" : "the simulator's example driver";
  const portAnd = driver ? "this port and driver" : `this port and ${who}`;
  const follow = `its volume following this ${SHAPE_NOUN[f.shape]} (Build → Box, Used by)`;
  if (b.kind === "vented") return `Opens as a ported box with ${portAnd}, ${follow}.`;
  if (b.kind === "pr") {
    const n = Math.max(1, Math.round(f.np));
    return `Opens as a passive radiator box with ${n} × ${pr ? esc(pr.name) : "the simulator's example PR"} and ${who}, ${follow}.`;
  }
  return `Opens as a sealed box with ${who} (no ports or PRs entered), ${follow}.`;
}

async function update(resize: boolean) {
  const out = $("bv-out");
  const open = $<HTMLAnchorElement>("bv-open");
  if (!out || !open) return;
  let f = readBox();
  if (bySize() && resize) {
    const target = metric("bv-target");
    const r = target > 0 ? sizeFor(f, target, ($<HTMLSelectElement>("bv-ratio")?.value ?? "keep") as Sizing) : null;
    if (r) writeSizes(r.f);
    f = readBox();
    sized = { kind: !(target > 0) ? "empty" : !r ? "none" : r.ok ? "ok" : "near", target, sig: sigOf(f) };
  }
  const done = $("bv-done");
  if (done) {
    const text = bySize() ? doneText(f) : "";
    done.hidden = !text;
    done.textContent = text;
  }
  const b = boxVolume(f);
  out.innerHTML = resultHtml(b);
  const total = $("bv-parts-total");
  if (total) total.textContent = `−${imperial() ? `${(b.parts_l / L_PER_FT3).toFixed(2)} ft³` : `${b.parts_l.toFixed(1)} L`}`;
  const caption = $("bv-caption");
  if (caption) caption.textContent = outlineCaption(f.shape, b.slope_deg);
  const hint = $("bv-hint");
  if (hint) hint.innerHTML = hintFor(f, b);
  const base: AppState = driver ? withDriver(DEFAULT_STATE, driver) : DEFAULT_STATE;
  const state = stateOf(f, { ...base, settings: { ...base.settings, units: imperial() ? "imperial" : "metric" } }, b.kind === "pr" ? pr : null);
  open.hidden = false;
  open.href = `/#${await encodeStateShort(state)}`;
  // Left out of the link: the shape's own default sizing, and fields still at their default (shown in inches or ft³).
  const omit = Object.entries(BOX_VOLUME_QUERY)
    .filter(([k, q]) => {
      if (k === "r") return sizingFor(f.shape, "") === $<HTMLSelectElement>("bv-ratio")?.value;
      const el = $<HTMLInputElement>(q.id);
      return !!el?.dataset.q && el.dataset.conv === el.value && el.dataset.prev === metricDefaults[k];
    })
    .map(([k]) => k);
  query.save({ d: driverId, pr: prId }, omit);
}

// ---- Start ----

export async function start() {
  const form = $("bv-form");
  if (!form) return;
  driverId = form.dataset.driverId ?? "";
  query = pageQuery(BOX_VOLUME_QUERY, { d: driverId, pr: "" });
  metricDefaults = readForm(BOX_VOLUME_QUERY);
  // The link's values: units first (they convert the defaults), then the fields, then the database parts.
  const { u, d, pr: prLink, ...fields } = query.start();
  if (u) {
    const imp = $<HTMLInputElement>("bv-imperial");
    if (imp) imp.checked = true;
    convertUnits(true);
  }
  applyValues(BOX_VOLUME_QUERY, fields);
  syncShape(fields.r);
  syncMode();
  syncPort();

  const sizeIds = new Set(SIZE_KEYS.filter((k) => !MM_KEYS.has(k)).map((k) => `bv-${k}`));
  form.addEventListener("input", (e) => {
    const t = e.target as HTMLInputElement;
    if (t.id === "bv-driver" || t.id === "bv-pr" || t.type === "radio") return;
    if (t.id === "bv-pt") syncPort();
    // Typing a size checks that box; anything else (target, ratio, walls, parts) sizes it again.
    schedule(bySize() && !sizeIds.has(t.id));
  });
  document.querySelectorAll<HTMLInputElement>('input[name="bv-shape-chip"]').forEach((c) =>
    c.addEventListener("change", () => {
      const sh = $<HTMLInputElement>("bv-shape");
      if (sh) sh.value = c.value;
      syncShape();
      schedule(bySize());
    }),
  );
  for (const id of ["bv-mode-net", "bv-mode-size"])
    $<HTMLInputElement>(id)?.addEventListener("change", () => {
      syncMode();
      schedule(bySize());
    });
  $<HTMLInputElement>("bv-imperial")?.addEventListener("change", () => {
    convertUnits(true);
    schedule();
  });
  $<HTMLInputElement>("bv-metric")?.addEventListener("change", () => {
    convertUnits(false);
    schedule();
  });
  wirePicker("bv-driver", "bv-driver-status", () => index?.drivers ?? [], (id) => pickDriver(id, true), () => ((driver = null), (driverId = "")), "driver");
  wirePicker("bv-pr", "bv-pr-status", () => index?.passiveRadiators ?? [], (id) => pickPr(id, true), () => ((pr = null), (prId = "")), "passive radiator");
  wireCopyLink("bv-copy");
  wireCombos();
  form.hidden = false;
  document.querySelectorAll<HTMLElement>(".calc-nojs").forEach((el) => (el.hidden = true));
  // A database part in the link fills its displacement unless the link has its own value.
  const loads: Promise<void>[] = [];
  // The page's own driver keeps the status line the build wrote (it names its size), unless it's in other units.
  if (d) loads.push(pickDriver(d, fields.dd === undefined));
  else if (driverId) loads.push(pickDriver(driverId, false, !!u));
  if (prLink) loads.push(pickPr(prLink, fields.pd === undefined));
  await Promise.all(loads);
  void update(false);
}

// Not in tests, which import the page's link spec without a page.
if (typeof document !== "undefined") void start();
