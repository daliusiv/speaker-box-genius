/**
 * The subwoofer box calculator page (/calculators/subwoofer-box/). The page's HTML comes from the
 * site build (site/calculators.ts); this script reads its form, picks three boxes for the driver
 * (subwooferMath.ts: compact, balanced and deep, sealed or ported) and shows each simulated at
 * the amplifier's power, with the three responses on one chart. "Open in the simulator" carries
 * a box into the app.
 */
import { encodeStateShort, type AppState } from "../state.ts";
import { PORT_LIMIT } from "../sim.ts";
import { loadIndex, type DbIndex } from "../library.ts";
import { $, applyValues, esc, pageQuery, wireCopyLink } from "./common.ts";
import { wireCombos } from "./combo.ts";
import { drawResponse } from "./calcChart.tsx";
import { driverInput, HAND_KEYS } from "./driverInput.ts";
import { PICK_NAMES, portText, SIZES, SUBWOOFER_QUERY, subwooferPicks, volumeText, type BoxKind, type Pick } from "./subwooferMath.ts";

let query: ReturnType<typeof pageQuery>;
const imperial = () => $<HTMLInputElement>("sb-imperial")?.checked === true;
const kindOf = (): BoxKind => ($<HTMLInputElement>("sb-type")?.value === "sealed" ? "sealed" : "ported");
const sizeOf = () => $<HTMLInputElement>("sb-size")?.value ?? "all";

let input: ReturnType<typeof driverInput>;
let index: DbIndex | null = null;
let indexLoading: Promise<void> | null = null;

// ---- Size chips: they only filter the driver list ----

/** Fills the driver list with the drivers of the size picked (all of them with no chip). */
function fillList() {
  const list = $("sb-drivers");
  if (!list || !index) return;
  const size = sizeOf();
  const rows = size === "all" ? index.drivers : index.drivers.filter((d) => String(d.size_in) === size);
  list.innerHTML = rows.map((d) => `<option value="${esc(`${d.brand} ${d.model}`)}"></option>`).join("");
}

function loadList(): Promise<void> {
  indexLoading ??= loadIndex().then(
    (ix) => {
      index = ix;
      fillList();
    },
    () => {
      indexLoading = null;
      const status = $("sb-driver-status");
      if (status) status.textContent = "Couldn't load the driver list.";
    },
  );
  return indexLoading;
}

/** Shows the size in the chips and keeps it where the link and the list read it. */
function setSize(size: string) {
  const hidden = $<HTMLInputElement>("sb-size");
  if (hidden) hidden.value = size;
  document.querySelectorAll<HTMLInputElement>('input[name="sb-size-chip"]').forEach((r) => (r.checked = r.value === size));
  fillList();
}

/** A driver picked from the list sets the chip to its own size (a size the chips offer). */
function followDriver() {
  const id = input.id();
  const row = id ? index?.drivers.find((d) => d.id === id) : undefined;
  if (row?.size_in && (SIZES as readonly number[]).includes(row.size_in) && String(row.size_in) !== sizeOf()) setSize(String(row.size_in));
}

// ---- Cards ----

const dash = "–";
const db = (v: number | undefined) => (v === undefined || !Number.isFinite(v) ? dash : `${v.toFixed(1)} dB`);

function cardHtml(p: Pick, kind: BoxKind): string {
  const start = p.key === "balanced" ? `<span class="start">Start here</span>` : "";
  const best = p.key === "balanced" ? " best" : "";
  if (p.why || !p.design) return `<article class="calc-pick${best}"><h3>${p.name}${start}</h3><p class="calc-note">${esc(p.why ?? "")}</p></article>`;
  const sw = `<span class="sw" style="background:${p.color}" aria-hidden="true"></span>`;
  const rows: [string, string][] = [];
  if (kind === "ported") rows.push(["Tuning", p.tuning!]);
  else rows.push(["Qtc", p.tuning!.replace(/^Qtc /, "")]);
  rows.push(["F3", p.f3 ? `${p.f3.toFixed(1)} Hz` : dash]);
  rows.push([`Output at 30 Hz`, db(p.spl30)]);
  rows.push(["Cone", p.x === null || p.x === undefined ? dash : p.xmax ? (p.x > p.xmax ? `<span class="over">${p.x.toFixed(1)} mm</span> of ${p.xmax} (over Xmax)` : `${p.x.toFixed(1)} mm of ${p.xmax}`) : `${p.x.toFixed(1)} mm`]);
  if (kind === "ported") {
    rows.push(["Port", p.port ? portText(p.port, imperial()) : dash]);
    const over = p.air !== null && p.air !== undefined && p.air > PORT_LIMIT;
    rows.push(["Port air", p.air === null || p.air === undefined ? dash : over ? `<span class="over">${p.air.toFixed(1)} m/s</span> (over ${PORT_LIMIT})` : `${p.air.toFixed(1)} m/s`]);
  }
  return (
    `<article class="calc-pick${best}"><h3>${sw}${p.name}${start}</h3>` +
    `<div class="big">${volumeText(p.vb_l!, imperial()).replace(/ \((.*)\)$/, " <em>($1)</em>")}</div>` +
    `<dl>${rows.map(([a, b]) => `<dt>${a}</dt><dd>${b}</dd>`).join("")}</dl>` +
    `<a class="open" data-pick="${p.key}" href="/" hidden>Open in the simulator</a></article>`
  );
}

/** The note under the cards: ports that chuff (with the ways out), or a cone past its Xmax. */
function noteHtml(picks: Pick[], kind: BoxKind, power: number, s: AppState): string {
  const made = picks.filter((p) => p.design);
  if (made.length === 0) return "";
  const notes: string[] = [];
  if (kind === "ported") {
    const loud = made.filter((p) => p.air !== null && p.air !== undefined && p.air > PORT_LIMIT);
    if (loud.length > 0) {
      const q = new URLSearchParams();
      const ref = loud.find((p) => p.key === "balanced") ?? loud[0]!;
      q.set("vb", ref.vb_l!.toFixed(1));
      q.set("fb", String(ref.fb));
      if (input.id()) q.set("d", input.id());
      q.set("p", String(power));
      const link = `/calculators/port-length/?${q.toString().replace(/%2F/gi, "/")}`;
      const who = loud.length === made.length ? "Every port here" : `The port${loud.length > 1 ? "s" : ""} on ${loud.map((p) => PICK_NAMES[p.key]).join(" and ")}`;
      notes.push(
        `${who} would chuff at ${power} W (over ${PORT_LIMIT} m/s): a sub tuned this low needs more port area than a round tube that fits. ` +
          `<a href="${link}">Try a slot or two ports</a>, or <a href="/calculators/passive-radiator/?${q.toString().replace(/%2F/gi, "/")}">passive radiators</a>.`,
      );
    }
  }
  const past = made.filter((p) => s.xmax_mm > 0 && p.x !== null && p.x !== undefined && p.x > s.xmax_mm);
  if (past.length > 0)
    notes.push(`At ${power} W the cone goes past its ${s.xmax_mm} mm Xmax on ${past.map((p) => PICK_NAMES[p.key]).join(" and ")}: use less power, or open the box in the simulator and add a high-pass filter.`);
  return notes.map((n) => `<p class="calc-note">${n}</p>`).join("");
}

// ---- Wiring ----

async function update() {
  const picksEl = $("sb-picks");
  const noteEl = $("sb-note");
  const chart = $("sb-chart");
  const open = $<HTMLAnchorElement>("sb-open");
  if (!picksEl || !noteEl || !chart || !open) return;
  const s = { ...input.state(), settings: { ...input.state().settings, units: imperial() ? ("imperial" as const) : ("metric" as const) } };
  const kind = kindOf();
  const { picks, state } = subwooferPicks(s, kind);
  picksEl.innerHTML = picks.map((p) => cardHtml(p, kind)).join("");
  noteEl.innerHTML = noteHtml(picks, kind, s.power, s);
  drawResponse(chart, state);
  // Each card opens its own box; the primary opens the balanced one.
  for (const p of picks) {
    const a = picksEl.querySelector<HTMLAnchorElement>(`a[data-pick="${p.key}"]`);
    if (!a || !p.design) continue;
    const href = `/#${await encodeStateShort({ ...state, designs: [p.design] })}`;
    a.href = href;
    a.hidden = false;
    if (p.key === "balanced") open.href = href;
  }
  const balanced = picks.find((p) => p.key === "balanced");
  open.hidden = !balanced?.design;
  query.save({ d: input.id() }, input.id() ? HAND_KEYS : []);
}

let timer = 0;
const schedule = () => {
  clearTimeout(timer);
  timer = window.setTimeout(() => void update(), 120);
};

export async function start() {
  const form = $("sb-form");
  if (!form) return;
  query = pageQuery(SUBWOOFER_QUERY, { d: form.dataset.driverId ?? "" });
  input = driverInput(
    "sb",
    () => {
      followDriver();
      schedule();
    },
    { ratedPower: true },
  );
  // The link's values: units, size, box type and typed values first, then the driver (which sets its own size unless the link names one).
  const q = query.start();
  const { d: _database, ...fields } = q;
  void _database;
  applyValues(SUBWOOFER_QUERY, fields);
  const size = sizeOf();
  document.querySelectorAll<HTMLInputElement>('input[name="sb-size-chip"]').forEach((r) => (r.checked = r.value === size));
  const type = kindOf();
  document.querySelectorAll<HTMLInputElement>('input[name="sb-t"]').forEach((r) => (r.checked = r.value === type));
  await input.start(q);
  if (q.d && q.sz === undefined) {
    await loadList();
    followDriver();
  }

  form.addEventListener("change", (e) => {
    const t = e.target as HTMLInputElement;
    if (t.name === "sb-size-chip") setSize(t.value);
    else if (t.name === "sb-t") {
      const hidden = $<HTMLInputElement>("sb-type");
      if (hidden) hidden.value = t.value;
    }
    if (t.id === "sb-driver") return;
    schedule();
  });
  // A chip that's already picked unpicks on a second tap: no chip = every size.
  let lastSize = sizeOf();
  form.addEventListener("click", (e) => {
    const t = e.target as HTMLInputElement;
    if (t.name !== "sb-size-chip") return;
    if (t.value === lastSize) {
      t.checked = false;
      setSize("all");
      lastSize = "all";
      schedule();
    } else lastSize = t.value;
  });
  $<HTMLInputElement>("sb-driver")?.addEventListener("focus", () => void loadList());
  wireCopyLink("sb-copy");
  wireCombos();
  form.hidden = false;
  document.querySelectorAll<HTMLElement>(".calc-nojs").forEach((el) => (el.hidden = true));
  void update();
}

// Not in tests, which import the page's maths without a page.
if (typeof document !== "undefined") void start();
