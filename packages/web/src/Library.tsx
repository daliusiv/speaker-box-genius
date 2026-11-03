import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { REPO } from "./components.tsx";
import type { DbIndex } from "./library.ts";
import { useUnits } from "./units.ts";

/**
 * Database browser: a button that opens a modal with search, filters and a
 * sortable table. Generic over the row type so drivers and passive radiators
 * share it.
 */

interface Column<R> {
  key: string;
  label: string;
  title?: string;
  /** Sort key; omit to make the column unsortable. */
  sort?: (r: R) => number | string | undefined;
  cell: (r: R) => ReactNode;
  num?: boolean;
  /** Hidden on narrow screens. */
  wide?: boolean;
}

interface ChipFilter<R> {
  key: string;
  label: string;
  kind: "chips" | "select";
  options: { value: string; text: string }[];
  match: (r: R, value: string) => boolean;
  hint?: string;
}

type Filters = Record<string, string[]>;

/** Lowercase, punctuation stripped: "RSS315HF-4" and "rss315hf4" both match. */
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9.]+/g, "");

function Browser<R extends { id: string; brand: string; model: string }>(props: {
  button: string;
  title: string;
  rows: R[];
  columns: Column<R>[];
  filters: ChipFilter<R>[];
  searchText: (r: R) => string;
  onPick: (id: string) => void;
}) {
  const dlg = useRef<HTMLDialogElement>(null);
  const searchBox = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState<Filters>({});
  // Phones: the filters fold away behind a button (wide screens always show them).
  const [filtersOpen, setFiltersOpen] = useState(false);
  const filterCount = Object.values(filters).reduce((n, v) => n + v.length, 0);
  const [sort, setSort] = useState<{ key: string; dir: 1 | -1 }>({ key: "name", dir: 1 });
  const [cursor, setCursor] = useState(0);

  const open = () => {
    dlg.current?.showModal();
    setCursor(0);
    // Select the old query so typing replaces it.
    requestAnimationFrame(() => searchBox.current?.select());
  };
  const close = () => dlg.current?.close();
  const pick = (id: string) => {
    close();
    props.onPick(id);
  };

  const shown = useMemo(() => {
    const tokens = query.split(/\s+/).map(norm).filter(Boolean);
    const list = props.rows.filter((r) => {
      const hay = norm(props.searchText(r));
      if (!tokens.every((t) => hay.includes(t))) return false;
      return props.filters.every((f) => {
        const sel = filters[f.key];
        return !sel || sel.length === 0 || sel.some((v) => f.match(r, v));
      });
    });
    const col = props.columns.find((c) => c.key === sort.key);
    const key = col?.sort ?? ((r: R) => `${r.brand} ${r.model}`);
    return list.sort((a, b) => {
      const x = key(a);
      const y = key(b);
      // Missing values always go last, whichever way the column is sorted.
      if (x === undefined || y === undefined) return x === y ? 0 : x === undefined ? 1 : -1;
      const c = typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y), undefined, { numeric: true });
      return c * sort.dir || `${a.brand} ${a.model}`.localeCompare(`${b.brand} ${b.model}`, undefined, { numeric: true });
    });
  }, [props.rows, props.columns, props.filters, props.searchText, query, filters, sort]);

  useEffect(() => setCursor(0), [query, filters]);

  // Keep the highlighted row in view while arrowing through the list.
  useEffect(() => {
    dlg.current?.querySelector<HTMLElement>(`tr[data-i="${cursor}"]`)?.scrollIntoView({ block: "nearest" });
  }, [cursor]);

  const toggle = (key: string, value: string, multi: boolean) =>
    setFilters((f) => {
      const cur = f[key] ?? [];
      if (!multi) return { ...f, [key]: value ? [value] : [] };
      return { ...f, [key]: cur.includes(value) ? cur.filter((v) => v !== value) : [...cur, value] };
    });

  const active = query.trim() !== "" || Object.values(filters).some((v) => v.length > 0);

  return (
    <div className="picker">
      <button type="button" className="browse" onClick={open} disabled={props.rows.length === 0}>
        {props.button} <span className="count">{props.rows.length}</span>
      </button>
      <a href={`${REPO}/blob/main/CONTRIBUTING.md`} title="Add a driver or passive radiator to the database">
        Missing one?
      </a>
      <dialog
        ref={dlg}
        className="library"
        aria-label={props.title}
        onClick={(e) => {
          if (e.target === e.currentTarget) close(); // backdrop
        }}
      >
        <div className="lib-inner">
          <header>
            <h2>{props.title}</h2>
            <button type="button" className="icon" onClick={close} aria-label="Close">
              ×
            </button>
          </header>
          <div className="lib-searchrow">
          <input
            ref={searchBox}
            type="search"
            className="lib-search"
            placeholder="Search, e.g. rss315 or scan 30w"
            value={query}
            onChange={(e) => setQuery(e.currentTarget.value)}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setCursor((c) => Math.min(c + 1, shown.length - 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setCursor((c) => Math.max(c - 1, 0));
              } else if (e.key === "Enter" && shown[cursor]) {
                e.preventDefault();
                pick(shown[cursor].id);
              }
            }}
            aria-label="Search"
          />
            <button
              type="button"
              className={`secondary lib-filter-toggle${filterCount > 0 ? " has-filters" : ""}`}
              aria-expanded={filtersOpen}
              aria-controls="lib-filters"
              onClick={() => setFiltersOpen(!filtersOpen)}
            >
              Filters{filterCount > 0 ? ` (${filterCount})` : ""} {filtersOpen ? "▴" : "▾"}
            </button>
          </div>
          <div className={`lib-filters${filtersOpen ? " open" : ""}`} id="lib-filters">
            {props.filters.map((f) =>
              f.kind === "select" ? (
                <label key={f.key} className="lib-filter">
                  <span>{f.label}</span>
                  <select value={filters[f.key]?.[0] ?? ""} onChange={(e) => toggle(f.key, e.currentTarget.value, false)}>
                    <option value="">All</option>
                    {f.options.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.text}
                      </option>
                    ))}
                  </select>
                </label>
              ) : (
                <div key={f.key} className="lib-filter" role="group" aria-label={f.label} title={f.hint}>
                  <span>{f.label}</span>
                  <div className="chips">
                    {f.options.map((o) => {
                      const on = filters[f.key]?.includes(o.value) ?? false;
                      return (
                        <button
                          key={o.value}
                          type="button"
                          className={`chip${on ? " on" : ""}`}
                          aria-pressed={on}
                          onClick={() => toggle(f.key, o.value, true)}
                        >
                          {o.text}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ),
            )}
          </div>
          <p className="lib-status">
            {shown.length} of {props.rows.length}
            {active && (
              <button
                type="button"
                className="link"
                onClick={() => {
                  setQuery("");
                  setFilters({});
                }}
              >
                Clear search and filters
              </button>
            )}
          </p>
          <div className="lib-table">
            <table>
              <thead>
                <tr>
                  {props.columns.map((c) => {
                    const on = sort.key === c.key;
                    return (
                      <th
                        key={c.key}
                        className={`${c.num ? "num" : ""}${c.wide ? " wide" : ""}`}
                        title={c.title}
                        aria-sort={on ? (sort.dir === 1 ? "ascending" : "descending") : undefined}
                      >
                        {c.sort || c.key === "name" ? (
                          <button
                            type="button"
                            onClick={() => setSort((s) => ({ key: c.key, dir: s.key === c.key ? ((-s.dir) as 1 | -1) : 1 }))}
                          >
                            {c.label}
                            <span className="arrow">{on ? (sort.dir === 1 ? "▲" : "▼") : ""}</span>
                          </button>
                        ) : (
                          c.label
                        )}
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {shown.map((r, i) => (
                  <tr
                    key={r.id}
                    data-i={i}
                    className={i === cursor ? "cursor-row" : undefined}
                    onClick={() => pick(r.id)}
                    onMouseMove={() => i !== cursor && setCursor(i)}
                  >
                    {props.columns.map((c) => (
                      <td key={c.key} className={`${c.num ? "num" : ""}${c.wide ? " wide" : ""}`}>
                        {c.cell(r)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            {shown.length === 0 && (
              <p className="lib-empty">
                Nothing matches. <a href={`${REPO}/blob/main/CONTRIBUTING.md`}>Add it to the database</a>, or enter its
                parameters by hand.
              </p>
            )}
          </div>
        </div>
      </dialog>
    </div>
  );
}

// ---------------------------------------------------------------------------

type DriverRow = DbIndex["drivers"][number];
type PrRow = DbIndex["passiveRadiators"][number];

const fmt = (v: number | undefined, d = 1) => (v === undefined ? "–" : v.toFixed(d));
const ohmsText = (r: DriverRow) => (r.coil_ohms ? `${r.coil_ohms}+${r.coil_ohms}` : `${r.ohms}`);
const uniq = <T,>(xs: T[]) => [...new Set(xs)];
const bySize = (a: number, b: number) => a - b;

function nameCell(r: { brand: string; model: string }) {
  return (
    <>
      <span className="lib-brand">{r.brand}</span> <b>{r.model}</b>
    </>
  );
}

function brandFilter<R extends { brand: string }>(rows: R[]): ChipFilter<R> {
  return {
    key: "brand",
    label: "Brand",
    kind: "select",
    options: uniq(rows.map((r) => r.brand))
      .sort()
      .map((b) => ({ value: b, text: b })),
    match: (r, v) => r.brand === v,
  };
}

function sizeFilter<R extends { size_in?: number }>(rows: R[]): ChipFilter<R> {
  return {
    key: "size",
    label: "Size",
    kind: "chips",
    options: uniq(rows.map((r) => r.size_in).filter((s): s is number => s !== undefined))
      .sort(bySize)
      .map((s) => ({ value: String(s), text: `${s}"` })),
    match: (r, v) => String(r.size_in) === v,
  };
}

const QTS_BANDS: { value: string; text: string; lo: number; hi: number }[] = [
  { value: "low", text: "< 0.35", lo: 0, hi: 0.35 },
  { value: "mid", text: "0.35–0.5", lo: 0.35, hi: 0.5 },
  { value: "high", text: "> 0.5", lo: 0.5, hi: Infinity },
];

export function DriverBrowser(props: { rows: DbIndex["drivers"] | undefined; onPick: (id: string) => void }) {
  const units = useUnits();
  const vol = units.unit("vol");
  const rows = props.rows ?? [];

  const filters = useMemo<ChipFilter<DriverRow>[]>(() => {
    const ohms = uniq(rows.map(ohmsText)).sort((a, b) => {
      // Single-coil values first, then DVC, each numerically.
      const dvc = (s: string) => (s.includes("+") ? 1 : 0);
      return dvc(a) - dvc(b) || parseFloat(a) - parseFloat(b);
    });
    const types = uniq(rows.map((r) => r.type)).sort();
    const list: ChipFilter<DriverRow>[] = [
      brandFilter(rows),
      sizeFilter(rows),
      {
        key: "ohms",
        label: "Impedance",
        kind: "chips",
        options: ohms.map((o) => ({ value: o, text: o.includes("+") ? `DVC ${o} Ω` : `${o} Ω` })),
        match: (r, v) => ohmsText(r) === v,
        hint: "DVC = dual voice coil, shown per coil",
      },
      {
        key: "qts",
        label: "Qts",
        kind: "chips",
        options: QTS_BANDS.map((b) => ({ value: b.value, text: b.text })),
        match: (r, v) => {
          const b = QTS_BANDS.find((x) => x.value === v)!;
          return r.qts !== undefined && r.qts >= b.lo && r.qts < b.hi;
        },
        hint: "Lower Qts generally suits ported boxes; higher Qts suits small sealed boxes",
      },
    ];
    if (types.length > 1) {
      list.push({
        key: "type",
        label: "Type",
        kind: "chips",
        options: types.map((t) => ({ value: t, text: t })),
        match: (r, v) => r.type === v,
      });
    }
    return list;
  }, [rows]);

  const columns = useMemo<Column<DriverRow>[]>(
    () => [
      { key: "name", label: "Driver", cell: nameCell },
      { key: "size", label: "Size", sort: (r) => r.size_in, cell: (r) => (r.size_in ? `${r.size_in}"` : "–"), num: true },
      { key: "ohms", label: "Ω", sort: (r) => r.ohms, cell: ohmsText, num: true, title: "Nominal impedance (DVC: per coil)" },
      { key: "fs", label: "Fs", sort: (r) => r.fs, cell: (r) => fmt(r.fs), num: true, title: "Resonance, Hz" },
      { key: "qts", label: "Qts", sort: (r) => r.qts, cell: (r) => fmt(r.qts, 2), num: true },
      {
        key: "vas",
        label: `Vas ${vol.unit}`,
        sort: (r) => r.vas_l,
        cell: (r) => (r.vas_l === undefined ? "–" : (r.vas_l * vol.k).toFixed(vol.digits)),
        num: true,
        wide: true,
      },
      { key: "xmax", label: "Xmax", sort: (r) => r.xmax_mm, cell: (r) => fmt(r.xmax_mm), num: true, title: "One-way linear excursion, mm" },
      { key: "pe", label: "Pe W", sort: (r) => r.pe_w, cell: (r) => fmt(r.pe_w, 0), num: true, wide: true, title: "Thermal power handling" },
    ],
    [vol.unit, vol.k, vol.digits],
  );

  return (
    <Browser
      button="Browse drivers"
      title="Driver database"
      rows={rows}
      columns={columns}
      filters={filters}
      searchText={(r) => `${r.brand} ${r.model} ${r.type} ${r.size_in ?? ""}in`}
      onPick={props.onPick}
    />
  );
}

export function PassiveRadiatorBrowser(props: {
  rows: DbIndex["passiveRadiators"] | undefined;
  onPick: (id: string) => void;
}) {
  const rows = props.rows ?? [];
  const filters = useMemo(() => [brandFilter(rows), sizeFilter(rows)], [rows]);
  const columns = useMemo<Column<PrRow>[]>(
    () => [
      { key: "name", label: "Passive radiator", cell: nameCell },
      { key: "size", label: "Size", sort: (r) => r.size_in, cell: (r) => (r.size_in ? `${r.size_in}"` : "–"), num: true },
      { key: "sd", label: "Sd cm²", sort: (r) => r.sd_cm2, cell: (r) => fmt(r.sd_cm2, 0), num: true },
      { key: "xmax", label: "Xmax", sort: (r) => r.xmax_mm, cell: (r) => fmt(r.xmax_mm), num: true },
    ],
    [],
  );
  return (
    <Browser
      button="Browse passive radiators"
      title="Passive radiator database"
      rows={rows}
      columns={columns}
      filters={filters}
      searchText={(r) => `${r.brand} ${r.model} ${r.size_in ?? ""}in`}
      onPick={props.onPick}
    />
  );
}
