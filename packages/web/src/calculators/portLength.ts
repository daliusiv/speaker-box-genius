/**
 * The port length calculator page (/calculators/port-length/). The page's HTML comes from the
 * site build (site/calculators.ts); this script reads its form, works the port out with the
 * engine (portMath.ts) and, when a driver is picked, simulates the box with the app's own code
 * to give the port's peak air speed. "Open in the simulator" carries the box into the app.
 */
import { DEFAULT_STATE, encodeStateShort, newDesign, type AppState, type VentedDesign } from "../state.ts";
import { airOf, limitsOf, PORT_LIMIT, runDesigns, solveDriver } from "../sim.ts";
import { withDriver } from "../assistant.ts";
import { loadDriver, loadIndex, type DbIndex, type LoadedDriver } from "../library.ts";
import { portSpeedFor } from "../ports.ts";
import { portCalc, type PortCalcInput, type PortCalcResult, type PortEnds } from "./portMath.ts";

const L_PER_FT3 = 28.3168;
const CM_PER_IN = 2.54;
const AIR = airOf(DEFAULT_STATE);

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T | null;
const val = (id: string) => Number(($<HTMLInputElement>(id)?.value ?? "").replace(",", "."));
const imperial = () => $<HTMLInputElement>("pc-imperial")?.checked === true;

/** Lengths in the user's unit: "21.4 cm (8.4″)" or "8.4″ (21.4 cm)". */
const len = (cm: number) => (imperial() ? `${(cm / CM_PER_IN).toFixed(2)}″ (${cm.toFixed(1)} cm)` : `${cm.toFixed(1)} cm (${(cm / CM_PER_IN).toFixed(2)}″)`);
const vol = (l: number) => (imperial() ? `${(l / L_PER_FT3).toFixed(2)} ft³ (${l.toFixed(1)} L)` : `${l.toFixed(1)} L (${(l / L_PER_FT3).toFixed(2)} ft³)`);
const area = (cm2: number) => (imperial() ? `${(cm2 / CM_PER_IN ** 2).toFixed(1)} in² (${cm2.toFixed(0)} cm²)` : `${cm2.toFixed(0)} cm² (${(cm2 / CM_PER_IN ** 2).toFixed(1)} in²)`);
const ENTITY: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
/** Escapes text for HTML content and quoted attribute values, in one pass. */
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ENTITY[c]!);

function readInput(): PortCalcInput {
  const toCm = imperial() ? CM_PER_IN : 1;
  const toL = imperial() ? L_PER_FT3 : 1;
  const shape = ($<HTMLSelectElement>("pc-shape")?.value ?? "round") as "round" | "slot";
  const ends = ($<HTMLSelectElement>("pc-ends")?.value ?? "flanged") as PortEnds;
  return {
    vb_l: val("pc-vb") * toL,
    fb: val("pc-fb"),
    shape,
    diameter_cm: val("pc-d") * toCm,
    width_cm: val("pc-w") * toCm,
    height_cm: val("pc-h") * toCm,
    count: Math.max(1, Math.round(val("pc-n") || 1)),
    flare_cm: shape === "round" ? Math.max(0, val("pc-flare") * toCm || 0) : 0,
    ends: shape === "round" && ends === "wall" ? "flanged" : ends,
    subtractPort: $<HTMLInputElement>("pc-sub")?.checked === true,
    wall_mm: imperial() ? val("pc-wall") * 25.4 : val("pc-wall"),
    inside_cm: val("pc-inside") > 0 ? val("pc-inside") * toCm : undefined,
  };
}

function resultHtml(i: PortCalcInput, r: PortCalcResult): string {
  const rows: [string, string][] = [
    [i.count > 1 ? `Length of each of the ${i.count} ports` : "Port length", `<strong>${len(r.length_cm)}</strong>`],
    [
      "Port area (total)",
      `${area(r.area_cm2)}, ${imperial() ? `${((r.areaPerLitre * L_PER_FT3) / CM_PER_IN ** 2).toFixed(1)} in² per ft³` : `${r.areaPerLitre.toFixed(1)} cm² per litre`}`,
    ],
    ["Net volume it tunes", vol(r.tunedVb_l) + (i.subtractPort ? `, after ${vol(r.portDisp_l)} for the port${i.count > 1 ? "s" : ""}` : "")],
    ["Effective length (with end corrections)", `${len(r.effective_cm)}, end correction ${r.k}`],
    ["Pipe resonance", `${r.pipe_hz.toFixed(0)} Hz, from the effective length (WinISD's \u201c1st port resonance\u201d leaves out the end corrections: ${r.pipeNoEnds_hz.toFixed(0)} Hz)`],
  ];
  const notes: string[] = [];
  notes.push(
    r.fits
      ? `It fits straight: there's room for about ${len(r.room_cm)}${i.inside_cm ? "" : " in a cube-shaped box of this volume"}, leaving one ${i.shape === "round" ? "port diameter" : "slot height"} of air at its inner end.`
      : `<strong>Too long to fit straight</strong>: about ${len(r.room_cm)} fits${i.inside_cm ? "" : " in a cube-shaped box of this volume (enter the longest inside dimension if the box is longer)"}. Use a bent (L-shaped) port, a slot along a wall, or a bigger box. A smaller port tunes shorter, but its air moves faster.`,
  );
  if (r.wallRange)
    notes.push(
      `A slot along the walls usually tunes lower than a free-standing one, and nobody can work out exactly how much. This length uses an end correction of ${r.k}; expect roughly ${r.wallRange.low.toFixed(1)}–${r.wallRange.high.toFixed(1)} Hz. Measure the impedance once it's built and trim if the dip is off.`,
    );
  if (r.pipe_hz < 300) notes.push(`The pipe resonance (${r.pipe_hz.toFixed(0)} Hz) is low enough to leak through: cross the woofer over well below it, or use a shorter, narrower port.`);
  if (!i.subtractPort) notes.push("The port's own volume isn't subtracted: tick the box above if your volume doesn't already allow for it.");
  return (
    `<table class="calc-out">${rows.map(([a, b]) => `<tr><th>${a}</th><td>${b}</td></tr>`).join("")}</table>` +
    notes.map((n) => `<p class="calc-note">${n}</p>`).join("")
  );
}

// ---- Driver and air speed ----

let index: DbIndex | null = null;
let driver: LoadedDriver | null = null;

function designOf(i: PortCalcInput, r: PortCalcResult): VentedDesign {
  const d = newDesign("vented", []) as VentedDesign;
  return {
    ...d,
    name: "Ported",
    vb_l: Math.round(r.tunedVb_l * 100) / 100,
    shape: i.shape,
    diameter_cm: i.shape === "round" ? i.diameter_cm : d.diameter_cm,
    slotWidth_cm: i.shape === "slot" ? i.width_cm : d.slotWidth_cm,
    slotHeight_cm: i.shape === "slot" ? i.height_cm : d.slotHeight_cm,
    flare_cm: i.shape === "round" ? i.flare_cm : 0,
    length_cm: Math.round(r.length_cm * 100) / 100,
    count: i.count,
    targetFb: i.fb,
  };
}

/** The app's state for this box: the picked driver (or the example one) at the power given. */
function stateFor(i: PortCalcInput, r: PortCalcResult): AppState {
  const base = driver ? withDriver(DEFAULT_STATE, driver) : DEFAULT_STATE;
  const power = val("pc-power");
  return {
    ...base,
    drive: "watts",
    power: power > 0 ? Math.min(10000, power) : base.power,
    designs: [designOf(i, r)],
    settings: { ...base.settings, endCorrection: r.k, units: imperial() ? "imperial" : "metric" },
  };
}

/** Peak port air speed (m/s, as the app counts it) for this port with the picked driver. */
function speedOf(i: PortCalcInput, r: PortCalcResult): { vp: number; x: number | null; s: AppState } | null {
  const s = stateFor(i, r);
  const [d] = runDesigns(s, solveDriver(s));
  if (!d) return null;
  const lim = limitsOf(d.result, s.xmax_mm, false, PORT_LIMIT);
  if (lim.vp === null) return null;
  const flared = i.shape === "round" && i.flare_cm > 0;
  const vp = flared ? portSpeedFor({ kind: "flared", diameter_cm: i.diameter_cm, flare_cm: i.flare_cm, length_cm: r.length_cm, count: i.count }, lim.vp) : lim.vp;
  return { vp, x: lim.x, s };
}

/** The narrowest round port (same count, flare and ends) whose air stays under the line, by 0.5 cm steps. */
function smallestQuietRound(i: PortCalcInput): { d: number; r: PortCalcResult } | null {
  for (let d = 2.5; d <= 30; d += 0.5) {
    const j = { ...i, shape: "round" as const, diameter_cm: d, ends: i.ends === "wall" ? ("flanged" as const) : i.ends };
    const r = portCalc(j, AIR);
    if (!r) continue;
    const sp = speedOf(j, r);
    if (sp && sp.vp <= PORT_LIMIT) return { d, r };
  }
  return null;
}

function speedHtml(i: PortCalcInput, r: PortCalcResult): string {
  if (!driver) return `<p class="calc-note">Pick a driver above to see how fast the air moves in this port at its rated power.</p>`;
  const sp = speedOf(i, r);
  if (!sp) return `<p class="calc-note">Couldn't simulate this box with ${esc(driver.name)}.</p>`;
  const w = sp.s.power;
  const over = sp.vp > PORT_LIMIT;
  let html =
    `<p class="calc-speed ${over ? "over" : "ok"}">With the ${esc(driver.name)} at ${w.toFixed(0)} W, the port's peak air speed is <strong>${sp.vp.toFixed(1)} m/s</strong> ` +
    `(from 20 Hz up), ${over ? `over the ${PORT_LIMIT} m/s line where ports start to chuff` : `under the ${PORT_LIMIT} m/s line where ports start to chuff`}.` +
    (sp.x !== null ? ` The cone peaks at ${sp.x.toFixed(1)} mm${sp.s.xmax_mm ? ` (Xmax ${sp.s.xmax_mm} mm)` : ""}.` : "") +
    `</p>`;
  if (over) {
    const q = smallestQuietRound(i);
    html += q
      ? `<p class="calc-note">The smallest ${i.count > 1 ? `set of ${i.count} round ports` : "round port"} under the line at this power is <strong>${len(q.d)} across, ${len(q.r.length_cm)} long</strong>${q.r.fits ? "" : " (too long to fit straight: bend it, or use more ports)"}.</p>`
      : `<p class="calc-note">No round port up to 30 cm across stays under the line at this power: lower the power, add ports, or use a bigger box.</p>`;
  }
  return html;
}

// ---- Wiring ----

async function update() {
  const out = $("pc-out");
  const speed = $("pc-speed");
  const open = $<HTMLAnchorElement>("pc-open");
  if (!out || !speed || !open) return;
  const isSlot = $<HTMLSelectElement>("pc-shape")?.value === "slot";
  document.querySelectorAll<HTMLElement>("[data-shape]").forEach((el) => {
    el.hidden = el.dataset.shape !== (isSlot ? "slot" : "round");
    // Some browsers still list hidden options: disable them too, and move off one that's gone.
    if (el instanceof HTMLOptionElement) {
      el.disabled = el.hidden;
      if (el.hidden && el.selected && el.parentElement instanceof HTMLSelectElement) el.parentElement.value = "flanged";
    }
  });
  const i = readInput();
  const r = portCalc(i, AIR);
  if (!r) {
    out.innerHTML = `<p class="calc-note">Enter a volume, a tuning and a port size. If they're all there, the port is too small for this tuning: it would need a negative length. Use a smaller port or fewer ports.</p>`;
    speed.innerHTML = "";
    open.hidden = true;
    return;
  }
  out.innerHTML = resultHtml(i, r);
  speed.innerHTML = speedHtml(i, r);
  open.hidden = false;
  const s = stateFor(i, r);
  open.href = `/#${await encodeStateShort(s)}`;
}

let timer = 0;
const schedule = () => {
  clearTimeout(timer);
  timer = window.setTimeout(() => void update(), 120);
};

function convertUnits(toImperial: boolean) {
  const k = toImperial ? 1 / CM_PER_IN : CM_PER_IN;
  const kv = toImperial ? 1 / L_PER_FT3 : L_PER_FT3;
  // Switching back without editing restores the exact value typed, not a rounded round trip.
  const set = (id: string, f: number, dp: number) => {
    const el = $<HTMLInputElement>(id);
    if (!el || el.value === "") return;
    const back = el.dataset.conv === el.value ? el.dataset.prev : undefined;
    const next = back ?? String(Number((Number(el.value) * f).toFixed(dp)));
    el.dataset.prev = el.value;
    el.dataset.conv = next;
    el.value = next;
  };
  set("pc-vb", kv, 2);
  for (const id of ["pc-d", "pc-w", "pc-h", "pc-flare", "pc-inside"]) set(id, k, 2);
  set("pc-wall", toImperial ? 1 / 25.4 : 25.4, 2);
  document.querySelectorAll<HTMLElement>("[data-unit]").forEach((el) => {
    const u = el.dataset.unit!;
    el.textContent = toImperial ? (u === "vol" ? "ft³" : u === "thin" ? "in" : "in") : u === "vol" ? "L" : u === "thin" ? "mm" : "cm";
  });
}

async function pickDriver(text: string) {
  const status = $("pc-driver-status");
  const row = index?.drivers.find((d) => `${d.brand} ${d.model}` === text.trim());
  if (!row) {
    driver = null;
    if (status) status.textContent = text.trim() ? "Pick a driver from the list." : "";
    schedule();
    return;
  }
  try {
    driver = await loadDriver(row.id);
    const power = $<HTMLInputElement>("pc-power");
    if (power && driver.pe_w) power.value = String(Math.round(driver.pe_w));
    if (status) status.textContent = driver.xmax_mm ? `Xmax ${driver.xmax_mm} mm${driver.pe_w ? `, rated ${driver.pe_w} W` : ""}.` : "";
  } catch {
    driver = null;
    if (status) status.textContent = "Couldn't load that driver.";
  }
  schedule();
}

export function start() {
  const form = $("pc-form");
  if (!form) return;
  form.addEventListener("input", (e) => {
    const t = e.target as HTMLElement;
    if (t.id === "pc-driver") return;
    schedule();
  });
  $<HTMLInputElement>("pc-imperial")?.addEventListener("change", (e) => {
    convertUnits((e.target as HTMLInputElement).checked);
    schedule();
  });
  $<HTMLInputElement>("pc-metric")?.addEventListener("change", () => {
    convertUnits(false);
    schedule();
  });
  const pick = $<HTMLInputElement>("pc-driver");
  pick?.addEventListener("change", () => void pickDriver(pick.value));
  pick?.addEventListener(
    "focus",
    () => {
      if (index) return;
      loadIndex().then(
        (ix) => {
          index = ix;
          const list = $("pc-drivers");
          if (list) list.innerHTML = ix.drivers.map((d) => `<option value="${esc(`${d.brand} ${d.model}`)}"></option>`).join("");
        },
        () => {
          const status = $("pc-driver-status");
          if (status) status.textContent = "Couldn't load the driver list.";
        },
      );
    },
    { once: true },
  );
  form.hidden = false;
  document.querySelectorAll<HTMLElement>(".calc-nojs").forEach((el) => (el.hidden = true));
  void update();
}

start();
