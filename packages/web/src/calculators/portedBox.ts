/**
 * The ported box calculator page (/calculators/ported-box/). The page's HTML comes from the site
 * build (site/calculators.ts); this script reads its form, sizes the box one of the alignments
 * (QB3, C4, BB4) or your own numbers gives, picks the port that fits (portedMath.ts, the same
 * code as the app's Ported card) and simulates it with the app's own code for the port's air
 * speed and the cone's excursion. "Open in the simulator" carries the box into the app.
 */
import { encodeStateShort, type AppState } from "../state.ts";
import { PORT_LIMIT } from "../sim.ts";
import { drawResponse } from "./calcChart.tsx";
import { $, applyValues, esc, pageQuery, val, wireCopyLink } from "./common.ts";
import { wireCombos } from "./combo.ts";
import { driverInput, HAND_KEYS, type DriverInput } from "./driverInput.ts";
import { alignmentChips, fineTuneLink, PORTED_QUERY, portedBox, portWords, type AlignChip, type PortedResult } from "./portedMath.ts";

const L_PER_FT3 = 28.3168;
const imperial = () => $<HTMLInputElement>("vc-imperial")?.checked === true;

const vol = (l: number) => (imperial() ? `${(l / L_PER_FT3).toFixed(2)} ft³ (${l.toFixed(1)} L)` : `${l.toFixed(1)} L (${(l / L_PER_FT3).toFixed(2)} ft³)`);

// Made when the page starts (they read the page).
let query: ReturnType<typeof pageQuery>;
let input: DriverInput;

let timer = 0;
const schedule = () => {
  clearTimeout(timer);
  timer = window.setTimeout(() => void update(), 120);
};

// ---- Alignment chips ----

let shownChips = "";
/** The box the page last showed (what "Other…" starts from when picked). */
let last: { vb_l: number; fb: number } | null = null;

const align = () => $<HTMLInputElement>("vc-align");

/** Draws the chips for this driver (when they changed), choosing one that exists. */
function renderChips(chips: AlignChip[]): string {
  const sig = chips.map((c) => `${c.value}:${c.label}:${c.vb_l}:${c.fb}`).join("|");
  const want = align()?.value ?? "qb3";
  const pick = chips.some((c) => c.value === want) || want === "other" ? want : (chips[0]?.value ?? "other");
  if (align()) align()!.value = pick;
  const host = $("vc-chips");
  if (host && (sig !== shownChips || !host.querySelector("input:checked"))) {
    shownChips = sig;
    const opt = (value: string, label: string, title: string) =>
      `<label title="${esc(title)}"><input type="radio" name="vc-a" value="${value}"${value === pick ? " checked" : ""}><span>${esc(label)}</span></label>`;
    host.innerHTML =
      `<fieldset class="calc-chips"><legend>Alignment</legend>` +
      chips.map((c) => opt(c.value, c.label, c.help)).join("") +
      opt("other", "Other…", "Your own net volume and tuning") +
      `</fieldset>`;
  } else if (host) {
    const r = host.querySelector<HTMLInputElement>(`input[value="${pick}"]`);
    if (r) r.checked = true;
  }
  const other = $("vc-other");
  if (other) other.hidden = pick !== "other";
  return pick;
}

// ---- Results ----

const note = (html: string) => `<p class="calc-note">${html}</p>`;

function resultHtml(s: AppState, r: PortedResult, chip: AlignChip | null, driverId: string): string {
  const w = s.power;
  const overSpeed = r.vp !== null && r.vp > PORT_LIMIT;
  const xOver = r.x !== null && r.xmax_mm > 0 && r.x > r.xmax_mm;
  const rows: [string, string][] = [
    ["Net box volume", `<strong>${vol(r.vb_l)}</strong>`],
    ["Tuning, Fb", `<strong>${r.fb.toFixed(1)} Hz</strong>`],
    ["F3", r.f3 ? `${r.f3.toFixed(1)} Hz` : "–"],
  ];
  if (chip && chip.shape !== "flat" && chip.db > 0) rows.push([chip.shape === "ripple" ? "Ripple" : "Peak", `${chip.db.toFixed(1)} dB above the roll-off`]);
  rows.push(["Port", `${esc(portWords(r.design))}<br><a href="${esc(fineTuneLink(r, driverId, w))}">Fine-tune the port →</a>`]);
  rows.push([
    `Port air speed at ${w.toFixed(0)} W`,
    r.vp === null ? "–" : `<span class="${overSpeed ? "over" : ""}">${r.vp.toFixed(1)} m/s</span>${overSpeed ? ` <span class="over">over the ${PORT_LIMIT} m/s line</span>` : ""}`,
  ]);
  rows.push([
    `Cone excursion at ${w.toFixed(0)} W`,
    r.x === null ? "–" : `<span class="${xOver ? "over" : ""}">${r.x.toFixed(1)} mm</span>${r.xmax_mm > 0 ? ` of Xmax ${r.xmax_mm} mm` : " (no Xmax known)"}${xOver ? ` <span class="over">over Xmax</span>` : ""}`,
  ]);
  rows.push([`Output at 30 Hz at ${w.toFixed(0)} W`, r.spl30 === null ? "–" : `${r.spl30.toFixed(1)} dB SPL at 1 m`]);
  let html = `<table class="calc-out">${rows.map(([a, b]) => `<tr><th>${a}</th><td>${b}</td></tr>`).join("")}</table>`;
  if (overSpeed)
    html += note(
      `<strong>This port will chuff at ${w.toFixed(0)} W.</strong> It is the quietest simple port that fits this box, and its air still passes ${PORT_LIMIT} m/s. Lower the power, try a slot or two ports on the <a href="${esc(fineTuneLink(r, driverId, w))}">port length page</a>, or use a <a href="/guides/passive-radiator-box/">passive radiator</a> instead. <a href="/guides/port-chuffing/">How big should my port be?</a>`,
    );
  if (xOver) html += note(`The cone goes past its Xmax at ${w.toFixed(0)} W: lower the power or add a high-pass filter in the simulator.`);
  return html;
}

// ---- Wiring ----

async function update() {
  const out = $("vc-out");
  const open = $<HTMLAnchorElement>("vc-open");
  const chart = $("vc-chart");
  if (!out || !open) return;
  const hide = (html: string) => {
    out.innerHTML = html;
    open.hidden = true;
    if (chart) chart.innerHTML = "";
    last = null;
    query.save({ d: input.id() }, input.id() ? HAND_KEYS : []);
  };
  const drivers = Math.max(1, Math.round(val("vc-n") || 1));
  const s: AppState = { ...input.state(), drivers };
  if (!input.driver()) {
    renderChips([]);
    hide(note("Pick a driver above, or enter its T/S by hand (Fs, Qes, Qms and Vas are needed)."));
    return;
  }
  const chips = alignmentChips(s);
  const pick = renderChips(chips);
  const chip = chips.find((c) => c.value === pick) ?? null;
  const toL = imperial() ? L_PER_FT3 : 1;
  const vb = chip ? chip.vb_l : val("vc-vb") * toL;
  const fb = chip ? chip.fb : val("vc-fb");
  let lead = "";
  if (chips.length === 0)
    lead = note(
      `This driver's Qts is too high for a ported box: WinISD's QB3 stops at about 0.62, and no other family suits it. A <a href="/calculators/sealed-box/">sealed box</a> or an <a href="/guides/infinite-baffle/">infinite baffle</a> suits it better. Your own volume and tuning below still work.`,
    );
  if (!(vb > 0 && fb > 0)) {
    hide(lead + note("Enter a net volume and a tuning frequency."));
    return;
  }
  const r = portedBox(s, vb, fb, chip?.label);
  if (!r) {
    hide(lead + note(`No simple port fits ${vol(vb)} at ${fb.toFixed(1)} Hz: it needs a bent port or a slot folded along the walls. Try a bigger box or a higher tuning, or work it out on the <a href="/calculators/port-length/">port length page</a>.`));
    return;
  }
  last = { vb_l: r.vb_l, fb: r.fb };
  out.innerHTML = lead + resultHtml(s, r, chip, input.id());
  open.hidden = false;
  const full: AppState = { ...s, designs: [r.design], settings: { ...s.settings, units: imperial() ? "imperial" : "metric" } };
  open.href = `/#${await encodeStateShort(full)}`;
  if (chart) drawResponse(chart, full, [r.run]);
  query.save({ d: input.id() }, input.id() ? HAND_KEYS : []);
}

function convertUnits(toImperial: boolean) {
  const el = $<HTMLInputElement>("vc-vb");
  if (el && el.value !== "") {
    // Switching back without editing restores the exact value typed, not a rounded round trip.
    const back = el.dataset.conv === el.value ? el.dataset.prev : undefined;
    const next = back ?? String(Number((Number(el.value) * (toImperial ? 1 / L_PER_FT3 : L_PER_FT3)).toFixed(2)));
    el.dataset.prev = el.value;
    el.dataset.conv = next;
    el.value = next;
  }
  document.querySelectorAll<HTMLElement>("#vc-form [data-unit=vol]").forEach((e) => (e.textContent = toImperial ? "ft³" : "L"));
}

export async function start() {
  const form = $("vc-form");
  if (!form) return;
  input = driverInput("vc", schedule);
  query = pageQuery(PORTED_QUERY, { d: form.dataset.driverId ?? "" });
  // The link's values: units first (they convert the defaults), then the fields, then the driver.
  const { u, d, ...rest } = query.start();
  if (u) {
    const imp = $<HTMLInputElement>("vc-imperial");
    if (imp) imp.checked = true;
    convertUnits(true);
  }
  applyValues(PORTED_QUERY, rest);
  form.addEventListener("input", (e) => {
    const t = e.target as HTMLInputElement;
    if (t.id === "vc-driver") return;
    if (t.name === "vc-a") {
      if (align()) align()!.value = t.value;
      // "Other…" starts from the box that was showing.
      if (t.value === "other" && last) {
        const v = $<HTMLInputElement>("vc-vb");
        const f = $<HTMLInputElement>("vc-fb");
        if (v) v.value = String(Number((imperial() ? last.vb_l / L_PER_FT3 : last.vb_l).toFixed(2)));
        if (f) f.value = String(last.fb);
      }
      const other = $("vc-other");
      if (other) other.hidden = t.value !== "other";
    }
    schedule();
  });
  $<HTMLInputElement>("vc-imperial")?.addEventListener("change", (e) => {
    convertUnits((e.target as HTMLInputElement).checked);
    schedule();
  });
  $<HTMLInputElement>("vc-metric")?.addEventListener("change", () => {
    convertUnits(false);
    schedule();
  });
  wireCopyLink("vc-copy");
  wireCombos();
  form.hidden = false;
  document.querySelectorAll<HTMLElement>(".calc-nojs").forEach((el) => (el.hidden = true));
  await input.start({ ...rest, ...(d ? { d } : {}) });
  void update();
}

// Not in tests, which import the page's link spec without a page.
if (typeof document !== "undefined") void start();
