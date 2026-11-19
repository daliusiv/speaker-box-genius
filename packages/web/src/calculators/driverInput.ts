/**
 * The driver part of a calculator page: a database driver (picked by name) or T/S typed by hand,
 * and the amplifier power with a "Rated N W" button. Shared by the sealed, ported and subwoofer
 * box calculators; the markup comes from `driverFields()` in site/calculators.ts, with the same
 * prefix.
 *
 * Picking a database driver fills the T/S fields (so they show what's used); typing in any of them
 * turns it into your own driver. In the link, a database driver is its id (`d`) and a typed one
 * its values (`fs`, `qes`, … `pe`).
 */
import { DEFAULT_STATE, type AppState } from "../state.ts";
import { withDriver } from "../assistant.ts";
import { loadDriver, loadIndex, type DbIndex, type LoadedDriver } from "../library.ts";
import { $, esc, val } from "./common.ts";
import type { QuerySpec, QueryValues } from "./query.ts";

/** The T/S fields: link key, element id suffix, LoadedDriver field. */
const TS_FIELDS = [
  { key: "fs", id: "fs", ts: "fs" },
  { key: "qes", id: "qes", ts: "qes" },
  { key: "qms", id: "qms", ts: "qms" },
  { key: "vas", id: "vas", ts: "vas_l" },
  { key: "re", id: "re", ts: "re" },
  { key: "sd", id: "sd", ts: "sd_cm2" },
] as const;

/** The typed values a link carries for a hand-entered driver (left out when `d` names a database one). */
export const HAND_KEYS = ["fs", "qes", "qms", "vas", "re", "sd", "x", "pe"] as const;

/** The driver part's link keys, for a page's QuerySpec. */
export function driverQuery(prefix: string): QuerySpec {
  return {
    d: { id: `${prefix}-driver`, kind: "text" },
    ...Object.fromEntries(TS_FIELDS.map((f) => [f.key, { id: `${prefix}-${f.id}`, kind: "num" as const }])),
    x: { id: `${prefix}-xmax`, kind: "num" },
    pe: { id: `${prefix}-pe`, kind: "num" },
    p: { id: `${prefix}-power`, kind: "num" },
  };
}

const r2 = (v: number) => String(Math.round(v * 1000) / 1000);

export interface DriverInput {
  /** The driver in use: the database one, or the typed values (null while they're incomplete). */
  driver(): LoadedDriver | null;
  /** The app's state for that driver at the power set (DEFAULT_STATE's settings otherwise). */
  state(): AppState;
  /** The database id, or "" for a typed driver. */
  id(): string;
  /** Applies the link's driver part (`d`, typed values, `p`), loading a database driver. */
  start(q: QueryValues): Promise<void>;
}

/**
 * Wires the driver part. `onChange` runs after anything in it changes; `ratedPower` puts a newly
 * picked driver's rated power in the power field (the subwoofer page), else the power stays.
 */
export function driverInput(prefix: string, onChange: () => void, o: { ratedPower?: boolean } = {}): DriverInput {
  const el = <T extends HTMLElement>(id: string) => $<T>(`${prefix}-${id}`);
  let index: DbIndex | null = null;
  let picked: LoadedDriver | null = null;
  const form = $(`${prefix}-form`);
  let dbId = form?.dataset.driverId ?? "";

  const status = (text: string) => {
    const s = el("driver-status");
    if (s) s.textContent = text;
  };
  const describe = (d: LoadedDriver) => {
    const t = d.ts;
    const qts = t.qes && t.qms ? (t.qes * t.qms) / (t.qes + t.qms) : t.qts;
    const size = index?.drivers.find((r) => r.id === d.id)?.size_in;
    const parts = [
      size ? `${size}″` : "",
      t.fs ? `Fs ${t.fs} Hz` : "",
      qts ? `Qts ${qts.toFixed(2)}` : "",
      t.vas_l ? `Vas ${t.vas_l} L` : "",
      d.xmax_mm ? `Xmax ${d.xmax_mm} mm` : "no Xmax",
      d.pe_w ? `${d.pe_w} W` : "",
    ];
    return parts.filter(Boolean).join(" · ");
  };
  const rated = () => {
    const btn = el<HTMLButtonElement>("rated");
    const pe = picked?.pe_w ?? (val(`${prefix}-pe`) || 0);
    if (!btn) return;
    btn.hidden = !(pe > 0);
    btn.textContent = `Rated ${Math.round(pe)} W`;
    btn.dataset.watts = String(Math.round(pe));
  };

  /** Shows a database driver's values in the T/S fields. */
  const fill = (d: LoadedDriver) => {
    for (const f of TS_FIELDS) {
      const input = el<HTMLInputElement>(f.id);
      const v = d.ts[f.ts];
      if (input) input.value = typeof v === "number" ? r2(v) : "";
    }
    const x = el<HTMLInputElement>("xmax");
    if (x) x.value = d.xmax_mm ? String(d.xmax_mm) : "";
    const pe = el<HTMLInputElement>("pe");
    if (pe) pe.value = d.pe_w ? String(d.pe_w) : "";
  };

  /** The typed values as a driver, or null while Fs, Qes, Qms or Vas is missing. */
  const typed = (): LoadedDriver | null => {
    const ts: LoadedDriver["ts"] = {};
    for (const f of TS_FIELDS) {
      const v = val(`${prefix}-${f.id}`);
      if (v > 0) (ts as Record<string, number>)[f.ts] = v;
    }
    if (!(ts.fs && ts.qes && ts.qms && ts.vas_l)) return null;
    const x = val(`${prefix}-xmax`);
    const pe = val(`${prefix}-pe`);
    return { name: "Your driver", brand: "", ts, ...(x > 0 ? { xmax_mm: x } : {}), ...(pe > 0 ? { pe_w: pe } : {}) };
  };

  const setDb = async (id: string, takeRated: boolean) => {
    try {
      const d = await loadDriver(id);
      picked = d;
      dbId = id;
      const pick = el<HTMLInputElement>("driver");
      if (pick) pick.value = d.name;
      fill(d);
      status(describe(d));
      const power = el<HTMLInputElement>("power");
      if (takeRated && power && d.pe_w) power.value = String(Math.round(d.pe_w));
    } catch {
      status("Couldn't load that driver.");
    }
    rated();
  };

  const ensureIndex = () => {
    if (index) return;
    loadIndex().then(
      (ix) => {
        index = ix;
        const list = el("drivers");
        if (list) list.innerHTML = ix.drivers.map((d) => `<option value="${esc(`${d.brand} ${d.model}`)}"></option>`).join("");
        if (picked) status(describe(picked));
      },
      () => status("Couldn't load the driver list."),
    );
  };

  const pick = el<HTMLInputElement>("driver");
  pick?.addEventListener("focus", ensureIndex, { once: true });
  pick?.addEventListener("change", () => {
    const row = index?.drivers.find((d) => `${d.brand} ${d.model}` === pick.value.trim());
    if (!row) {
      if (pick.value.trim()) status("Pick a driver from the list, or enter its T/S below.");
      return;
    }
    void setDb(row.id, !!o.ratedPower).then(onChange);
  });
  // Typing a T/S value makes it your own driver.
  for (const id of [...TS_FIELDS.map((f) => f.id), "xmax", "pe"])
    el(id)?.addEventListener("input", () => {
      picked = null;
      dbId = "";
      if (pick) pick.value = "";
      status("Your own values (below).");
      rated();
      onChange();
    });
  el<HTMLButtonElement>("rated")?.addEventListener("click", (e) => {
    const power = el<HTMLInputElement>("power");
    const w = (e.currentTarget as HTMLElement).dataset.watts;
    if (power && w) {
      power.value = w;
      onChange();
    }
  });
  el("power")?.addEventListener("input", onChange);

  return {
    driver: () => picked ?? typed(),
    state() {
      const d = picked ?? typed();
      const base = d ? withDriver(DEFAULT_STATE, d) : DEFAULT_STATE;
      const power = val(`${prefix}-power`);
      return { ...base, drive: "watts", power: power > 0 ? Math.min(10000, power) : 1 };
    },
    id: () => dbId,
    async start(q) {
      // A typed driver in the link: its values are already in the fields (the page applied them).
      const handInLink = HAND_KEYS.some((k) => q[k] !== undefined);
      if (q.d) await setDb(q.d, q.p === undefined && !!o.ratedPower);
      else if (handInLink) {
        dbId = "";
        if (pick) pick.value = "";
        status("Your own values (below).");
        const ts = el<HTMLDetailsElement>("ts");
        if (ts) ts.open = true;
      } else if (dbId) await setDb(dbId, false);
      rated();
    },
  };
}
