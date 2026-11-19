/**
 * The sealed box calculator page (/calculators/sealed-box/). The page's HTML comes from the site
 * build (site/calculators.ts); this script reads its form, sizes the box for a target Qtc (or
 * takes the box you have) with the app's own sealed alignment, and simulates it for Qtc, F3,
 * cone excursion and output (sealedMath.ts). "Open in the simulator" carries the box into the app.
 */
import { encodeStateShort, type AppState } from "../state.ts";
import { alignmentDriver, solveDriver } from "../sim.ts";
import { sealedQtc, SEALED_MAX_VAS } from "../presets.ts";
import { boxForQtc, PEAK_QTC, qtsOfState, readSealed, roundVb, sealedState, type SealedResult } from "./sealedMath.ts";
import { driverInput, driverQuery, HAND_KEYS } from "./driverInput.ts";
import { $, applyValues, pageQuery, val, wireCopyLink } from "./common.ts";
import { wireCombos } from "./combo.ts";
import type { QuerySpec } from "./query.ts";

const L_PER_FT3 = 28.3168;

const imperial = () => $<HTMLInputElement>("sc-imperial")?.checked === true;
const vol = (l: number) => (imperial() ? `${(l / L_PER_FT3).toFixed(2)} ft³ (${l.toFixed(1)} L)` : `${l.toFixed(1)} L (${(l / L_PER_FT3).toFixed(2)} ft³)`);
const fixed = (v: number | null, dp: number, unit: string) => (v === null || !Number.isFinite(v) ? "–" : `${v.toFixed(dp)}${unit}`);
const watts = (w: number) => `${Math.round(w * 10) / 10} W`;

/** The inputs kept in the page address (see query.ts); `d` is the picked driver's database id. */
export const SEALED_QUERY: QuerySpec = {
  u: { id: "sc-imperial", kind: "check", on: "in" },
  m: { id: "sc-mode-qtc", kind: "check", on: "qtc" },
  q: { id: "sc-qtc", kind: "num" },
  vb: { id: "sc-vb", kind: "num" },
  n: { id: "sc-n", kind: "int" },
  ...driverQuery("sc"),
};

let query: ReturnType<typeof pageQuery>;
let input: ReturnType<typeof driverInput>;

/** The app's state for the driver, its count and the power set. */
function baseState(): AppState {
  const s = input.state();
  return { ...s, drivers: Math.max(1, Math.round(val("sc-n") || 1)), settings: { ...s.settings, units: imperial() ? "imperial" : "metric" } };
}

const byQtc = () => $<HTMLInputElement>("sc-mode-qtc")?.checked !== true;

function row(label: string, value: string, over = false) {
  return `<tr><th>${label}</th><td${over ? ' class="over"' : ""}>${value}</td></tr>`;
}

function tableHtml(r: SealedResult, n: number): string {
  const w = watts(r.power_w);
  let x = "–";
  let over = false;
  if (r.x_mm !== null) {
    over = r.xmax_mm > 0 && r.x_mm > r.xmax_mm;
    x = r.xmax_mm > 0 ? `${r.x_mm.toFixed(1)} mm, ${over ? "<strong>over</strong>" : "inside"} its ${r.xmax_mm} mm Xmax` : `${r.x_mm.toFixed(1)} mm (this driver has no Xmax to compare with)`;
  }
  const rows = [
    row(n > 1 ? `Net box volume (all ${n} drivers)` : "Net box volume", `<strong>${vol(r.vb_l)}</strong>`),
    row("Qtc", fixed(r.qtc, 3, "")),
    row("Fc (resonance in the box)", fixed(r.fc, 1, " Hz")),
    row("F3 / F10", `${fixed(r.f3, 1, " Hz")} / ${fixed(r.f10, 1, " Hz")}`),
    ...(r.qtc !== null && r.qtc > PEAK_QTC ? [row("Peak above the passband", r.peakDb < 0.05 ? "none" : `${r.peakDb.toFixed(1)} dB`)] : []),
    row(`Cone excursion at ${w}`, x, over),
    row(`Output at 30 Hz, ${w}`, r.spl30 === null ? "–" : `${r.spl30.toFixed(1)} dB SPL at 1 m`),
  ];
  return `<table class="calc-out">${rows.join("")}</table>`;
}

function notesFor(s: AppState, r: SealedResult, pastMax: { vb_l: number; max_l: number } | null, target: number | null): string[] {
  const notes: string[] = [];
  const q = r.qtc ?? 0;
  if (pastMax) {
    const a = alignmentDriver(solveDriver(s), s)!;
    const qts = qtsOfState(s)!;
    const atMax = sealedQtc(a, pastMax.max_l, s.drivers);
    notes.push(
      `This box is ${(pastMax.vb_l / (a.vas_l * s.drivers)).toFixed(1)} × the driver's Vas, past the ${SEALED_MAX_VAS} × Vas (${vol(pastMax.max_l)}) where the simulator's sealed preset stops. The driver's own Qts is ${qts.toFixed(2)}, so a Qtc this close to it needs a huge box for very little change, and the size swings with every small difference in Qts (real drivers vary by 10 % or more). The preset takes ${SEALED_MAX_VAS} × Vas and the Qtc it gives, about ${atMax.toFixed(2)}.`,
    );
  }
  if (target !== null && s.drivers > 1 && Math.abs(q - target) > 0.01)
    notes.push(`With ${s.drivers} drivers the box reads a Qtc of ${q.toFixed(3)}, a little off the ${target} asked for: the app sizes the box with the amplifier's 0.1 Ω against one driver's Re, while drivers wired in parallel have a lower Re to put against it. The figures here are for the box as simulated.`);
  if (q > 0 && q < 0.65) notes.push("A Qtc below 0.707 needs a bigger box and rolls off more gently, so it plays more of the bottom octave for the same F3. Qtc 0.577 has the flattest group delay.");
  else if (q <= 0.75) notes.push("Qtc 0.707 is the flattest sealed box: the lowest Qtc with no peak. A lower Qtc needs a bigger box and rolls off more gently; a higher one is smaller, with a peak.");
  else notes.push(`Above Qtc 0.707 the response has a peak (${r.peakDb.toFixed(1)} dB here) and falls away faster below F3, in a smaller box. It suits a room or a car, where the room's gain fills the bass back in.`);
  if (r.x_mm !== null && r.xmax_mm > 0 && r.x_mm > r.xmax_mm)
    notes.push(`At ${watts(r.power_w)} the cone goes past its Xmax. Use less power, a bigger box, or a subsonic filter, which the simulator can add.`);
  return notes;
}

function message(text: string) {
  const out = $("sc-out");
  if (out) out.innerHTML = `<p class="calc-note">${text}</p>`;
  const open = $<HTMLAnchorElement>("sc-open");
  if (open) open.hidden = true;
  const chart = $("sc-chart");
  if (chart) chart.hidden = true;
}

async function update() {
  const out = $("sc-out");
  const open = $<HTMLAnchorElement>("sc-open");
  if (!out || !open) return;
  const save = () => query.save({ d: input.id() }, input.id() ? HAND_KEYS : []);
  const s = baseState();
  if (!input.driver()) {
    message("Enter the driver's Fs, Qes, Qms and Vas (pick one from the database, or open “No driver in the database?” above).");
    return save();
  }
  let vb_l: number;
  let pastMax: { vb_l: number; max_l: number } | null = null;
  if (byQtc()) {
    const qtc = val("sc-qtc");
    if (!(qtc > 0)) {
      message("Enter the Qtc you want, such as 0.707.");
      return save();
    }
    const b = boxForQtc(s, qtc);
    if (b === "incomplete") {
      message("Enter the driver's Fs, Qes, Qms and Vas.");
      return save();
    }
    if (b === "qts") {
      const qts = qtsOfState(s);
      message(
        `No sealed box gives a Qtc of ${qtc}: this driver's Qts is already ${qts ? qts.toFixed(2) : "higher"}, and a box only raises the Q. Pick a higher Qtc, or a driver with a lower Qts.`,
      );
      return save();
    }
    vb_l = b.vb_l;
    if (b.pastMax) pastMax = { vb_l: b.vb_l, max_l: b.maxVb_l };
  } else {
    vb_l = val("sc-vb") * (imperial() ? L_PER_FT3 : 1);
    if (!(vb_l > 0)) {
      message("Enter the net box volume.");
      return save();
    }
  }
  const r = readSealed(sealedState(s, vb_l));
  if (!r) {
    message("Couldn't simulate this box with that driver.");
    return save();
  }
  const state = sealedState(s, vb_l, `Sealed ${roundVb(vb_l).toFixed(1)} L, Qtc ${fixed(r.qtc, 3, "")}`);
  out.innerHTML = tableHtml(r, s.drivers) + notesFor(s, r, pastMax, byQtc() ? val("sc-qtc") : null).map((n) => `<p class="calc-note">${n}</p>`).join("");
  const chart = $("sc-chart");
  if (chart) {
    chart.hidden = false;
    // The chart's code (React, the app's chart) loads once the first result is up.
    const { drawResponse } = await import("./calcChart.tsx");
    drawResponse(chart, state);
  }
  open.hidden = false;
  open.href = `/#${await encodeStateShort(state)}`;
  save();
}

let timer = 0;
const schedule = () => {
  clearTimeout(timer);
  timer = window.setTimeout(() => void update(), 120);
};

/** Shows what the mode and the Qtc chip choose: the target chips (and the Other field), or the box volume field. */
function syncChoices() {
  const byQ = byQtc();
  const target = $("sc-target");
  const box = $("sc-boxfield");
  if (target) target.hidden = !byQ;
  if (box) box.hidden = byQ;
  const other = document.querySelector<HTMLInputElement>('input[name="sc-qtcpick"][value="other"]');
  const field = $("sc-qtc-field");
  if (field) field.hidden = !other?.checked;
}

/** Ticks the chip that matches the Qtc field, or Other. */
function chipForQtc() {
  const v = val("sc-qtc");
  const chips = [...document.querySelectorAll<HTMLInputElement>('input[name="sc-qtcpick"]')];
  const hit = chips.find((c) => c.value !== "other" && Number(c.value) === v) ?? chips.find((c) => c.value === "other");
  if (hit) hit.checked = true;
}

function convertUnits(toImperial: boolean) {
  const el = $<HTMLInputElement>("sc-vb");
  if (el && el.value !== "") {
    // Switching back without editing restores the exact value typed, not a rounded round trip.
    const back = el.dataset.conv === el.value ? el.dataset.prev : undefined;
    const next = back ?? String(Number((Number(el.value) * (toImperial ? 1 / L_PER_FT3 : L_PER_FT3)).toFixed(2)));
    el.dataset.prev = el.value;
    el.dataset.conv = next;
    el.value = next;
  }
  document.querySelectorAll<HTMLElement>("[data-unit]").forEach((u) => (u.textContent = toImperial ? "ft³" : "L"));
}

export async function start() {
  const form = $("sc-form");
  if (!form) return;
  query = pageQuery(SEALED_QUERY, { d: form.dataset.driverId ?? "" });
  input = driverInput("sc", schedule);
  // The link's values: units first (they convert the defaults), then the fields, then the driver.
  const { u, d, ...fields } = query.start();
  if (u) {
    const imp = $<HTMLInputElement>("sc-imperial");
    if (imp) imp.checked = true;
    convertUnits(true);
  }
  applyValues(SEALED_QUERY, fields);
  chipForQtc();
  syncChoices();
  form.addEventListener("input", (e) => {
    const t = e.target as HTMLElement;
    if (t.id === "sc-driver") return;
    schedule();
  });
  for (const id of ["sc-mode-box", "sc-mode-qtc"])
    $<HTMLInputElement>(id)?.addEventListener("change", () => {
      syncChoices();
      schedule();
    });
  document.querySelectorAll<HTMLInputElement>('input[name="sc-qtcpick"]').forEach((c) =>
    c.addEventListener("change", () => {
      if (c.value !== "other") {
        const f = $<HTMLInputElement>("sc-qtc");
        if (f) f.value = c.value;
      }
      syncChoices();
      schedule();
    }),
  );
  // Typing a Qtc that matches a chip ticks it (and a chip's value is what the field shows).
  $<HTMLInputElement>("sc-qtc")?.addEventListener("change", chipForQtc);
  $<HTMLInputElement>("sc-imperial")?.addEventListener("change", (e) => {
    convertUnits((e.target as HTMLInputElement).checked);
    schedule();
  });
  $<HTMLInputElement>("sc-metric")?.addEventListener("change", () => {
    convertUnits(false);
    schedule();
  });
  wireCopyLink("sc-copy");
  wireCombos();
  form.hidden = false;
  document.querySelectorAll<HTMLElement>(".calc-nojs").forEach((el) => (el.hidden = true));
  await input.start({ ...(d ? { d } : {}), ...fields });
  void update();
}

// Not in tests, which import the page's link spec without a page.
if (typeof document !== "undefined") void start();
