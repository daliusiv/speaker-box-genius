/**
 * The open baffle calculator page (/calculators/open-baffle/). The page's HTML comes from the site
 * build (site/calculators.ts); this script reads its form: the board you have (flat, H- or
 * U-frame), or the flat board for a dipole peak you want, and with a driver simulates it with its
 * Dipole EQ against the same driver in a wall (obCalcMath.ts). "Open in the simulator" carries the
 * board and its EQ into the app.
 */
import { encodeStateShort, type AppState } from "../state.ts";
import { driverLevelDb, OB_PASSIVE_DB, OB_PASSIVE_HZ } from "../boxType.ts";
import { boardForPeak, obProblem, qtsOf, type ObAspect, type ObForm, type ObResult } from "./obCalcMath.ts";
import { obNumbers, obRead } from "./obCalcRun.ts";
import { driverInput, driverQuery, HAND_KEYS } from "./driverInput.ts";
import { $, applyValues, pageQuery, val, wireCopyLink } from "./common.ts";
import { wireCombos } from "./combo.ts";
import type { QuerySpec } from "./query.ts";

const CM_PER_IN = 2.54;
const LEN_IDS = ["ob-w", "ob-h", "ob-x", "ob-y", "ob-depth", "ob-t"] as const;

const imperial = () => $<HTMLInputElement>("ob-imperial")?.checked === true;
const byPeak = () => $<HTMLInputElement>("ob-mode-peak")?.checked === true;
/** A length field in cm, whatever the units. */
const cm = (id: string) => val(id) * (imperial() ? CM_PER_IN : 1);
const len = (c: number) => (imperial() ? `${(c / CM_PER_IN).toFixed(1)}″ (${c.toFixed(0)} cm)` : `${c.toFixed(c < 10 ? 1 : 0)} cm (${(c / CM_PER_IN).toFixed(1)}″)`);
const hz = (v: number | null, dp = 0) => (v === null || !Number.isFinite(v) ? "–" : `${v.toFixed(dp)} Hz`);
const dB = (v: number | null) => (v === null ? "–" : `${Math.abs(v).toFixed(1)} dB ${v < 0 ? "less" : "more"}`);
const watts = (w: number) => `${Math.round(w * 10) / 10} W`;

/** The inputs kept in the page address (see query.ts); `d` is the picked driver's database id. */
export const OB_QUERY: QuerySpec = {
  u: { id: "ob-imperial", kind: "check", on: "in" },
  m: { id: "ob-mode-peak", kind: "check", on: "peak" },
  f: { id: "ob-frame", kind: "choice", choices: ["flat", "h", "u"] },
  w: { id: "ob-w", kind: "num" },
  h: { id: "ob-h", kind: "num" },
  // The driver's place on the board (`x` is the driver's Xmax, as on the other pages).
  dx: { id: "ob-x", kind: "num" },
  dy: { id: "ob-y", kind: "num" },
  dp: { id: "ob-depth", kind: "num" },
  t: { id: "ob-t", kind: "num" },
  fp: { id: "ob-fp", kind: "num" },
  ar: { id: "ob-ar", kind: "choice", choices: ["square", "tall"] },
  n: { id: "ob-n", kind: "int" },
  ...driverQuery("ob"),
};

let query: ReturnType<typeof pageQuery>;
let input: ReturnType<typeof driverInput>;

const frame = () => ($<HTMLInputElement>("ob-frame")?.value ?? "flat") as ObForm["frame"];
const aspect = () => ($<HTMLInputElement>("ob-ar")?.value === "tall" ? "tall" : "square") as ObAspect;

/** The board the form describes ("Board I have"). */
function boardFromForm(): ObForm {
  return { frame: frame(), w_cm: cm("ob-w"), h_cm: cm("ob-h"), x_cm: cm("ob-x"), y_cm: cm("ob-y"), t_cm: cm("ob-t"), depth_cm: cm("ob-depth") };
}

/** The app's state for the driver, its count and the power set. */
function baseState(): AppState {
  const s = input.state();
  return { ...s, drivers: Math.max(1, Math.round(val("ob-n") || 1)), settings: { ...s.settings, units: imperial() ? "imperial" : "metric" } };
}

const row = (label: string, value: string, over = false) => `<tr><th>${label}</th><td${over ? ' class="over"' : ""}>${value}</td></tr>`;
const sub = (t: string) => `<span class="sub">${t}</span>`;

function eqText(r: ObResult): string {
  const shelf = r.eq.find((e) => e.type === "lowshelf1");
  const cut = r.eq.find((e) => e.type === "peak");
  if (!shelf) return "none needed";
  return `6 dB/oct low shelf +${shelf.gain_db} dB at ${shelf.freq} Hz${cut ? `, cut −${Math.abs(cut.gain_db)} dB at ${cut.freq} Hz (Q ${cut.q})` : ""}`;
}

function suitsNote(r: ObResult, s: AppState): string {
  const qts = qtsOf(s) ?? 0;
  const fs = s.ts.fs ?? 0;
  const own = fs > 0 && qts > 0 ? driverLevelDb(OB_PASSIVE_HZ, fs, qts) : NaN;
  const ownText = Number.isFinite(own) ? `its own level at ${OB_PASSIVE_HZ} Hz is ${own >= 0 ? "+" : "−"}${Math.abs(own).toFixed(1)} dB (Qts ${qts.toFixed(2)}, Fs ${fs.toFixed(0)} Hz)` : `Qts ${qts.toFixed(2)}`;
  if (r.suits === "passive") return `Suits an open baffle without EQ: ${ownText}, −${Math.abs(OB_PASSIVE_DB)} dB or better. Its own rise towards resonance makes up part of the dipole's loss.`;
  if (r.suits === "dsp")
    return `Suits an open baffle with DSP EQ: Qts ${qts.toFixed(2)} (0.35 or more), Xmax ${s.xmax_mm} mm (8 or more), Fs ${(s.ts.fs ?? 0).toFixed(0)} Hz (45 or less). Without EQ the bass falls away early.`;
  return `Not an open baffle driver: ${ownText}, too little to go without EQ (−${Math.abs(OB_PASSIVE_DB)} dB or better), and its Xmax or Fs is out of range for one with EQ (Qts 0.35 or more, Xmax 8 mm or more, Fs 45 Hz or less).`;
}

function boardRows(b: ObForm, n: { d_m: number; fPeak: number; fNull: number; fQuarter: number | null }, peak: boolean): string[] {
  const rows: string[] = [];
  if (peak) rows.push(row("Board", `<strong>${len(b.w_cm)} × ${len(b.h_cm)}</strong>${sub(`width × height, the driver centred across and ${aspect() === "tall" ? "a third" : "half"} of the way up`)}`));
  rows.push(row("Path round the board, D", len(n.d_m * 100)));
  rows.push(row("Dipole peak", `${hz(n.fPeak)}${sub(`cross over below about ${Math.round(n.fPeak / 2 / 10) * 10} Hz`)}`));
  rows.push(row("First null", hz(n.fNull)));
  if (n.fQuarter !== null) rows.push(row("Quarter-wave of the frame", hz(n.fQuarter)));
  return rows;
}

function message(text: string) {
  const out = $("ob-out");
  if (out) out.innerHTML = `<p class="calc-note">${text}</p>`;
  const open = $<HTMLAnchorElement>("ob-open");
  if (open) open.hidden = true;
  const chart = $("ob-chart");
  if (chart) chart.hidden = true;
}

const PROBLEMS = {
  size: "Enter the board's width and height (5 cm or more).",
  driver: "The driver's centre has to be on the board: from the left less than the width, from the bottom less than the height.",
  depth: "A frame has to be deeper than its board is thick.",
} as const;

let run = 0;

async function update() {
  const out = $("ob-out");
  const open = $<HTMLAnchorElement>("ob-open");
  if (!out || !open) return;
  const mine = ++run;
  const save = () => query.save({ d: input.id() }, input.id() ? HAND_KEYS : []);
  const s = baseState();
  const sd_m2 = input.driver() ? (s.ts.sd_cm2 ?? 0) / 1e4 : 0;
  let b: ObForm;
  if (byPeak()) {
    const fp = val("ob-fp");
    if (!(fp > 0)) {
      message("Enter the dipole peak you want, such as 300 Hz.");
      return save();
    }
    out.innerHTML = `<p class="calc-note">Working out the board…</p>`;
    // Let the note paint before the model runs (a big board takes a few seconds).
    await new Promise((r) => setTimeout(r, 30));
    if (mine !== run) return;
    const found = boardForPeak(fp, aspect(), cm("ob-t"), sd_m2);
    if (!found) {
      message(`No ${aspect() === "tall" ? "tall" : "square"} board between 15 cm and 1.5 m wide (1 m for a tall one) has its peak at ${fp} Hz. Pick a peak between about 160 and 1,500 Hz.`);
      return save();
    }
    b = found;
  } else {
    b = boardFromForm();
    const p = obProblem(b);
    if (p) {
      message(PROBLEMS[p]);
      return save();
    }
    // A frame's model takes a second or so to build (in a worker): say so meanwhile.
    if (b.frame !== "flat") out.innerHTML = `<p class="calc-note">Working out the frame…</p>`;
  }
  if (!input.driver()) {
    const n = await obNumbers(b, 0);
    if (mine !== run) return;
    out.innerHTML = `<table class="calc-out">${boardRows(b, n, byPeak()).join("")}</table><p class="calc-note">Pick a driver (or enter its T/S) for its bass against a wall, the Dipole EQ and its cone excursion. Without one the cone is taken as a point.</p>`;
    open.hidden = true;
    const chart = $("ob-chart");
    if (chart) chart.hidden = true;
    return save();
  }
  const r = await obRead(s, b);
  if (mine !== run) return;
  if (!r) {
    message("Couldn't simulate this board with that driver.");
    return save();
  }
  const w = watts(r.power_w);
  const xOver = r.xmax_mm > 0 && r.x_mm !== null && r.x_mm > r.xmax_mm;
  const rows = [
    ...boardRows(b, r, byPeak()),
    row("F3", `${hz(r.f3)}${sub(`${hz(r.f3Eq, 1)} with the Dipole EQ`)}`),
    row(`Bass at 40 Hz against the same driver in a wall`, `${dB(r.loss)}${sub(`${dB(r.lossEq)} with the Dipole EQ`)}`),
    row("Dipole EQ", eqText(r)),
    row(
      `Cone excursion at ${w}, with the EQ`,
      r.x_mm === null ? "–" : r.xmax_mm > 0 ? `${r.x_mm.toFixed(1)} mm of ${r.xmax_mm} mm Xmax` : `${r.x_mm.toFixed(1)} mm (no Xmax to compare with)`,
      xOver,
    ),
  ];
  const notes = [suitsNote(r, s)];
  if (r.overBare) notes.push(`At ${w} the cone passes its Xmax on the board even without EQ, so no EQ can help: use less power, or a driver with more travel.`);
  else if (r.over) notes.push(`With the Dipole EQ at ${w} the cone passes a limit: use less power, or less shelf.`);
  if (b.frame !== "flat") notes.push("A frame's sound comes round it as a block (edge diffraction) from its ducts' open ends, checked against boundary-element solutions of four frames.");
  out.innerHTML = `<table class="calc-out">${rows.join("")}</table>${notes.map((n) => `<p class="calc-note">${n}</p>`).join("")}`;
  const chart = $("ob-chart");
  if (chart) {
    chart.hidden = false;
    // The chart's code (React, the app's chart) loads once the first result is up.
    const { drawResponse } = await import("./calcChart.tsx");
    if (mine !== run) return;
    drawResponse(chart, r.chart, r.designs);
  }
  open.hidden = false;
  open.href = `/#${await encodeStateShort(r.open)}`;
  save();
}

let timer = 0;
const schedule = () => {
  clearTimeout(timer);
  timer = window.setTimeout(() => void update(), 150);
};

/** Shows what the mode and frame choose: the board fields or the peak fields, and the frame depth. */
function syncChoices() {
  const peak = byPeak();
  const have = $("ob-have");
  const pk = $("ob-peak");
  if (have) have.hidden = peak;
  if (pk) pk.hidden = !peak;
  const depth = $("ob-depthfield");
  if (depth) depth.hidden = frame() === "flat";
}

/** Ticks the chips that match the hidden frame and shape fields (from a link). */
function chipsFromFields() {
  for (const [name, id] of [["ob-framepick", "ob-frame"], ["ob-arpick", "ob-ar"]] as const) {
    const v = $<HTMLInputElement>(id)?.value;
    const hit = document.querySelector<HTMLInputElement>(`input[name="${name}"][value="${v}"]`);
    if (hit) hit.checked = true;
  }
}

function convertUnits(toImperial: boolean) {
  for (const id of LEN_IDS) {
    const el = $<HTMLInputElement>(id);
    if (!el || el.value === "") continue;
    // Switching back without editing restores the exact value typed, not a rounded round trip.
    const back = el.dataset.conv === el.value ? el.dataset.prev : undefined;
    const next = back ?? String(Number((Number(el.value) * (toImperial ? 1 / CM_PER_IN : CM_PER_IN)).toFixed(2)));
    el.dataset.prev = el.value;
    el.dataset.conv = next;
    el.value = next;
  }
  document.querySelectorAll<HTMLElement>('#ob-form [data-unit="len"]').forEach((u) => (u.textContent = toImperial ? "in" : "cm"));
}

export async function start() {
  const form = $("ob-form");
  if (!form) return;
  query = pageQuery(OB_QUERY, { d: form.dataset.driverId ?? "" });
  input = driverInput("ob", schedule);
  // The link's values: units first (they convert the defaults), then the fields, then the driver.
  const { u, d, ...fields } = query.start();
  if (u) {
    const imp = $<HTMLInputElement>("ob-imperial");
    if (imp) imp.checked = true;
    convertUnits(true);
  }
  applyValues(OB_QUERY, fields);
  chipsFromFields();
  syncChoices();
  form.addEventListener("input", (e) => {
    const t = e.target as HTMLElement;
    if (t.id === "ob-driver") return;
    schedule();
  });
  for (const id of ["ob-mode-have", "ob-mode-peak"])
    $<HTMLInputElement>(id)?.addEventListener("change", () => {
      syncChoices();
      schedule();
    });
  for (const [name, id] of [["ob-framepick", "ob-frame"], ["ob-arpick", "ob-ar"]] as const)
    document.querySelectorAll<HTMLInputElement>(`input[name="${name}"]`).forEach((c) =>
      c.addEventListener("change", () => {
        const f = $<HTMLInputElement>(id);
        if (f) f.value = c.value;
        syncChoices();
        schedule();
      }),
    );
  $<HTMLInputElement>("ob-imperial")?.addEventListener("change", (e) => {
    convertUnits((e.target as HTMLInputElement).checked);
    schedule();
  });
  $<HTMLInputElement>("ob-metric")?.addEventListener("change", () => {
    convertUnits(false);
    schedule();
  });
  wireCopyLink("ob-copy");
  wireCombos();
  form.hidden = false;
  document.querySelectorAll<HTMLElement>(".calc-nojs").forEach((el) => (el.hidden = true));
  await input.start({ ...(d ? { d } : {}), ...fields });
  void update();
}

// Not in tests, which import the page's link spec without a page.
if (typeof document !== "undefined") void start();
