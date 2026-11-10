/**
 * The passive radiator calculator page (/calculators/passive-radiator/). The page's HTML comes
 * from the site build (site/calculators.ts); this script reads its form, works out the added
 * mass with the engine (prMath.ts) and, when a driver is picked, simulates the box with the
 * app's own code to see whether the PRs keep up. "Open in the simulator" carries the box into the app.
 */
import { DEFAULT_STATE, encodeStateShort, type AppState, type PrParams } from "../state.ts";
import { airOf } from "../sim.ts";
import { withDriver } from "../assistant.ts";
import { loadDriver, loadIndex, loadPassiveRadiator, type DbIndex, type LoadedDriver } from "../library.ts";
import { fewestThatKeepUp, HEAVY_MASS_RATIO, keepsUp, MAX_MASS_RATIO, prCalc, prCheck, prDesignOf, VD_RULE, type PrCalcInput, type PrCalcResult } from "./prMath.ts";

const L_PER_FT3 = 28.3168;
const G_PER_OZ = 28.3495;
const AIR = airOf(DEFAULT_STATE);
const CAUTION = DEFAULT_STATE.settings.prCaution_pct / 100;

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T | null;
const val = (id: string) => Number(($<HTMLInputElement>(id)?.value ?? "").replace(",", "."));
const imperial = () => $<HTMLInputElement>("prc-imperial")?.checked === true;

const grams = (g: number) => (imperial() ? `${(g / G_PER_OZ).toFixed(1)} oz (${g.toFixed(0)} g)` : `${g.toFixed(0)} g (${(g / G_PER_OZ).toFixed(1)} oz)`);
const vd = (cm3: number) => (imperial() ? `${(cm3 / 16.387).toFixed(1)} in³ (${cm3.toFixed(0)} cm³)` : `${cm3.toFixed(0)} cm³ (${(cm3 / 16.387).toFixed(1)} in³)`);
const pct = (x: number) => `${Math.round(x * 100)} %`;
const ENTITY: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
/** Escapes text for HTML content and quoted attribute values, in one pass. */
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ENTITY[c]!);

let index: DbIndex | null = null;
let driver: LoadedDriver | null = null;
let prName = "your passive radiator";

function readInput(): PrCalcInput {
  const pr: PrParams = { mms_g: val("prc-mms"), sd_cm2: val("prc-sd"), vas_l: val("prc-vas"), xmax_mm: val("prc-xmax"), qms: val("prc-qms") > 0 ? val("prc-qms") : 10 };
  const max = val("prc-max");
  return {
    vb_l: val("prc-vb") * (imperial() ? L_PER_FT3 : 1),
    fb: val("prc-fb"),
    count: Math.max(1, Math.round(val("prc-n") || 1)),
    pr,
    ...(max > 0 ? { maxAdded_g: max } : {}),
  };
}

function resultHtml(i: PrCalcInput, r: PrCalcResult): string {
  const each = i.count > 1 ? " per PR" : "";
  const rows: [string, string][] = [
    [`Added mass${each}`, r.tooLow ? "none (see below)" : `<strong>${grams(r.addedMass_g)}</strong>${i.count > 1 ? `, ${grams(r.addedMass_g * i.count)} in all` : ""}`],
    [`Moving mass${each} with it`, `${grams(r.totalMass_g)}; the added mass is ${r.massRatio.toFixed(2)} × the PR's own`],
    ["Tuning with no added mass", `${r.bareFb.toFixed(1)} Hz (the highest ${i.count > 1 ? "these PRs tune" : "this PR tunes"} in this box)`],
    ["PR resonance in free air", r.tooLow ? `${r.fs.toFixed(1)} Hz` : `${r.fs.toFixed(1)} Hz bare, ${r.fsLoaded.toFixed(1)} Hz with the mass`],
    [`Displacement at Xmax${i.count > 1 ? " (all PRs)" : ""}`, vd(r.vd_cm3)],
  ];
  const notes: string[] = [];
  if (r.tooLow)
    notes.push(
      `<strong>Too heavy for this tuning:</strong> with no added mass ${i.count > 1 ? "these PRs" : "this PR"} already tune${i.count > 1 ? "" : "s"} the box to ${r.bareFb.toFixed(1)} Hz, below ${i.fb} Hz, and mass can only lower it. Use more PRs, a smaller box, or a lighter or stiffer PR.`,
    );
  else if (r.massRatio > MAX_MASS_RATIO)
    notes.push(`<strong>A lot of added mass:</strong> more than ${MAX_MASS_RATIO} × the PR's own moving mass. Heavy PRs sag and rock, and their suspension may not be made for it. A bigger PR, or more of them, tunes as low with less.`);
  else if (r.massRatio > HEAVY_MASS_RATIO)
    notes.push(`More than ${HEAVY_MASS_RATIO} × the PR's own moving mass added: workable, but a heavy cone can start to sag and rock. Fix the mass firmly at the centre.`);
  if (r.overMax) notes.push(`<strong>Over the published maximum added mass</strong>${r.lowestFb ? `: that much tunes this box to ${r.lowestFb.toFixed(1)} Hz at the lowest` : ""}. Use more PRs or a bigger box.`);
  else if (r.lowestFb && !r.tooLow) notes.push(`With the published maximum added mass, the lowest tuning here is ${r.lowestFb.toFixed(1)} Hz.`);
  if (i.vb_l > 0 && !r.tooLow) notes.push("Use the net volume: after the driver, the bracing and the PRs themselves (a PR's basket and added mass take room too).");
  return `<table class="calc-out">${rows.map(([a, b]) => `<tr><th>${a}</th><td>${b}</td></tr>`).join("")}</table>` + notes.map((n) => `<p class="calc-note">${n}</p>`).join("");
}

// ---- Driver: will the PRs keep up? ----

function driverState(): AppState {
  const base = driver ? withDriver(DEFAULT_STATE, driver) : DEFAULT_STATE;
  const power = val("prc-power");
  return { ...base, drive: "watts", power: power > 0 ? Math.min(10000, power) : base.power, settings: { ...base.settings, units: imperial() ? "imperial" : "metric" } };
}

function keepUpHtml(i: PrCalcInput, r: PrCalcResult): string {
  if (!driver) return `<p class="calc-note">Pick a driver above to see whether ${i.count > 1 ? "these PRs" : "this PR"} can keep up with it.</p>`;
  if (!(i.pr.xmax_mm > 0)) return `<p class="calc-note">Enter the PR's Xmax to compare its travel with the driver's.</p>`;
  const s = driverState();
  const c = prCheck(s, i, r);
  if (!c) return `<p class="calc-note">Couldn't simulate this box with ${esc(driver.name)}${driver.xmax_mm ? "" : " (it has no Xmax in the database)"}.</p>`;
  const w = s.power.toFixed(0);
  const runsOut = c.prUse > 1;
  const many = i.count > 1;
  const the = many ? "the PRs" : "the PR";
  const caution = !runsOut && c.prUse > CAUTION;
  let html =
    `<p class="calc-speed ${runsOut ? "over" : "ok"}">${runsOut ? `<strong>${many ? "The PRs run" : "The PR runs"} out of travel first.</strong> ` : ""}When the cone reaches its Xmax, ${many ? "the PRs use" : "the PR uses"} <strong>${pct(c.prUse)}</strong> of ${many ? "their" : "its"} travel` +
    `${runsOut ? `: ${many ? "they hit their" : "it hits its"} ${c.prXmax} mm limit with the cone at ${pct(1 / c.prUse)} of its own` : caution ? `, past the ${pct(CAUTION)} where a PR's suspension starts to stiffen (rule of thumb)` : ""}.` +
    ` At ${w} W the cone peaks at ${c.x.toFixed(1)} mm (Xmax ${c.xmax} mm) and ${the} at ${c.pr.toFixed(1)} mm (Xmax ${c.prXmax} mm), from 20 Hz up.` +
    (c.f3 ? ` F3 ${c.f3.toFixed(1)} Hz.` : "") +
    `</p>`;
  if (Number.isFinite(c.vdRatio))
    html += `<p class="calc-note">PR displacement is ${c.vdRatio.toFixed(1)} × the driver's (the common rule of thumb asks for about ${VD_RULE} ×). The simulation above is the real test: it counts the tuning and the added mass, which the rule of thumb doesn't.</p>`;
  if (!keepsUp(r, c)) {
    const f = fewestThatKeepUp(s, i, AIR);
    html += f
      ? f.count === i.count
        ? ""
        : `<p class="calc-note">The fewest ${esc(prName)}s that keep up here: <strong>${f.count}</strong>, with ${grams(f.r.addedMass_g)} added to each (PRs at ${pct(f.c.prUse)} when the cone is at Xmax).</p>`
      : `<p class="calc-note">No number of ${esc(prName)}s up to 6 keeps up here with under ${MAX_MASS_RATIO} × its own mass added. Try a bigger PR: in the simulator, "Find a PR for this driver…" in a passive radiator design searches the database for one.</p>`;
  }
  return html;
}

// ---- Wiring ----

async function update() {
  const out = $("prc-out");
  const keep = $("prc-keep");
  const open = $<HTMLAnchorElement>("prc-open");
  if (!out || !keep || !open) return;
  const i = readInput();
  const r = prCalc(i, AIR);
  if (!r) {
    out.innerHTML = `<p class="calc-note">Enter a volume, a tuning and the PR's Mms, Sd and Vas (or pick one from the database).</p>`;
    keep.innerHTML = "";
    open.hidden = true;
    return;
  }
  out.innerHTML = resultHtml(i, r);
  keep.innerHTML = keepUpHtml(i, r);
  open.hidden = false;
  const s = { ...driverState(), designs: [prDesignOf(i, r, prName === "your passive radiator" ? "Passive radiator" : prName)] };
  open.href = `/#${await encodeStateShort(s)}`;
}

let timer = 0;
const schedule = () => {
  clearTimeout(timer);
  timer = window.setTimeout(() => void update(), 120);
};

function convertUnits(toImperial: boolean) {
  const el = $<HTMLInputElement>("prc-vb");
  if (el && el.value !== "") {
    // Switching back without editing restores the exact value typed, not a rounded round trip.
    const back = el.dataset.conv === el.value ? el.dataset.prev : undefined;
    const next = back ?? String(Number((Number(el.value) * (toImperial ? 1 / L_PER_FT3 : L_PER_FT3)).toFixed(2)));
    el.dataset.prev = el.value;
    el.dataset.conv = next;
    el.value = next;
  }
  document.querySelectorAll<HTMLElement>("[data-unit=vol]").forEach((e) => (e.textContent = toImperial ? "ft³" : "L"));
}

function fillList(listId: string, items: string[]) {
  const list = $(listId);
  if (list) list.innerHTML = items.map((t) => `<option value="${esc(t)}"></option>`).join("");
}

function ensureIndex() {
  if (index) return;
  loadIndex().then(
    (ix) => {
      index = ix;
      fillList("prc-prs", ix.passiveRadiators.map((p) => `${p.brand} ${p.model}`));
      fillList("prc-drivers", ix.drivers.map((d) => `${d.brand} ${d.model}`));
    },
    () => {
      for (const id of ["prc-pr-status", "prc-driver-status"]) {
        const st = $(id);
        if (st) st.textContent = "Couldn't load the database.";
      }
    },
  );
}

async function pickPr(text: string) {
  const status = $("prc-pr-status");
  const row = index?.passiveRadiators.find((p) => `${p.brand} ${p.model}` === text.trim());
  if (!row) {
    if (status) status.textContent = text.trim() ? "Pick a PR from the list, or type its values below." : "";
    return;
  }
  try {
    const pr = await loadPassiveRadiator(row.id);
    prName = pr.name;
    const set = (id: string, v: number | undefined) => {
      const el = $<HTMLInputElement>(id);
      if (el) el.value = v !== undefined ? String(v) : "";
    };
    set("prc-mms", pr.params.mms_g);
    set("prc-sd", pr.params.sd_cm2);
    set("prc-vas", pr.params.vas_l);
    set("prc-xmax", pr.params.xmax_mm);
    set("prc-qms", pr.params.qms);
    set("prc-max", pr.maxAdded_g);
    if (status) status.textContent = `Values from the database${pr.maxAdded_g ? "" : " (no maximum added mass published)"}.`;
  } catch {
    if (status) status.textContent = "Couldn't load that passive radiator.";
  }
  schedule();
}

async function pickDriver(text: string) {
  const status = $("prc-driver-status");
  const row = index?.drivers.find((d) => `${d.brand} ${d.model}` === text.trim());
  if (!row) {
    driver = null;
    if (status) status.textContent = text.trim() ? "Pick a driver from the list." : "";
    schedule();
    return;
  }
  try {
    driver = await loadDriver(row.id);
    const power = $<HTMLInputElement>("prc-power");
    if (power && driver.pe_w) power.value = String(Math.round(driver.pe_w));
    if (status) status.textContent = driver.xmax_mm ? `Xmax ${driver.xmax_mm} mm${driver.pe_w ? `, rated ${driver.pe_w} W` : ""}.` : "No Xmax in the database for this driver.";
  } catch {
    driver = null;
    if (status) status.textContent = "Couldn't load that driver.";
  }
  schedule();
}

export function start() {
  const form = $("prc-form");
  if (!form) return;
  if (form.dataset.prName) prName = form.dataset.prName;
  form.addEventListener("input", (e) => {
    const id = (e.target as HTMLElement).id;
    if (id === "prc-driver" || id === "prc-pr") return;
    // Typed PR values are no longer the database PR's.
    if (["prc-mms", "prc-sd", "prc-vas", "prc-xmax", "prc-qms"].includes(id)) prName = "your passive radiator";
    schedule();
  });
  $<HTMLInputElement>("prc-imperial")?.addEventListener("change", () => {
    convertUnits(true);
    schedule();
  });
  $<HTMLInputElement>("prc-metric")?.addEventListener("change", () => {
    convertUnits(false);
    schedule();
  });
  const pr = $<HTMLInputElement>("prc-pr");
  pr?.addEventListener("change", () => void pickPr(pr.value));
  pr?.addEventListener("focus", ensureIndex, { once: true });
  const pick = $<HTMLInputElement>("prc-driver");
  pick?.addEventListener("change", () => void pickDriver(pick.value));
  pick?.addEventListener("focus", ensureIndex, { once: true });
  form.hidden = false;
  document.querySelectorAll<HTMLElement>(".calc-nojs").forEach((el) => (el.hidden = true));
  void update();
}

start();
