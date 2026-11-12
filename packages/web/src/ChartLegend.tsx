import { useState } from "react";

/** One curve's row in a chart's legend table. */
export interface LegendRow {
  key: string;
  label: string;
  color: string;
  /** Dashed curves get a short line for a swatch (a square can't show the dash). */
  dash?: string;
  /** A part of a design (a line's cone or mouth): shown indented, under `parent`, when it's opened. */
  parent?: string;
  /** The value at the cursor ("–" before a hover or tap). */
  at: string;
  atOver?: boolean;
  /** Marks the best value at the cursor (▲ highest, ▼ lowest, ◆ closest to zero). */
  lead?: { mark: string; title: string };
  /** The curve's peak, with where it is below it in small type. */
  peak?: { main: string; sub?: string; over?: boolean };
  /** The chart's own columns, in the order of `LegendProps.columns`. */
  cols: string[];
  faint?: boolean;
}

export interface LegendProps {
  /**
   * The cursor column's heading ("@ 19.2 Hz"), or null before a hover or tap. With no cursor the
   * cursor column and the chart's own columns (all read at the cursor) are left out, so the table
   * is names and peaks only.
   */
  atHeading: string | null;
  /** Peak column: left out when no row has one. */
  peakHeading?: string;
  columns: string[];
  rows: LegendRow[];
}

const Swatch = ({ color, dash }: { color: string; dash?: string }) =>
  dash ? (
    <svg className="legend-swatch line" viewBox="0 0 16 8" aria-hidden="true">
      <line x1="1" y1="4" x2="15" y2="4" stroke={color} strokeWidth="2.5" strokeDasharray="4 2.5" strokeLinecap="round" />
    </svg>
  ) : (
    <span className="legend-swatch" style={{ background: color }} aria-hidden="true" />
  );

/**
 * The legend under every chart: one row per curve with its value at the cursor, its peak (and
 * where), and the chart's own columns. Parts of a design (a line's cone and mouth) fold under it.
 */
export function ChartLegend(p: LegendProps) {
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set());
  const hasPeak = p.peakHeading !== undefined && p.rows.some((r) => r.peak);
  const parents = new Set(p.rows.filter((r) => r.parent).map((r) => r.parent!));
  const top = new Set(p.rows.filter((r) => !r.parent).map((r) => r.label));
  const live = p.atHeading !== null;
  const columns = live ? p.columns : [];
  const cols = 1 + (live ? 1 : 0) + (hasPeak ? 1 : 0) + columns.length;
  return (
    <div className={`legend-wrap${cols > 4 ? " wide" : ""}`}>
      <table className="legend" style={{ ["--legend-cols" as string]: cols }}>
        <thead>
          <tr>
            <th scope="col">Enclosure</th>
            {live && (
              <th scope="col" className="legend-at on">
                {p.atHeading}
              </th>
            )}
            {hasPeak && <th scope="col">{p.peakHeading}</th>}
            {columns.map((c) => (
              <th scope="col" key={c}>
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {p.rows.map((r) => {
            // A part shows when its design is opened, or when its design has no row of its own.
            if (r.parent && top.has(r.parent) && !open.has(r.parent)) return null;
            const isOpen = open.has(r.label);
            const toggle = () =>
              setOpen((s) => {
                const n = new Set(s);
                if (n.has(r.label)) n.delete(r.label);
                else n.add(r.label);
                return n;
              });
            return (
              <tr key={r.key} className={`${r.parent && top.has(r.parent) ? "part" : ""}${r.faint ? " faint" : ""}`}>
                <th scope="row">
                  {parents.has(r.label) ? (
                    <button type="button" className="legend-name" aria-expanded={isOpen} onClick={toggle}>
                      <Swatch color={r.color} dash={r.dash} />
                      <span className="legend-label" title={r.label}>
                        {r.label}
                      </span>
                      <svg className="legend-caret" viewBox="0 0 24 24" aria-hidden="true">
                        <path d="M6 9l6 6 6-6" />
                      </svg>
                    </button>
                  ) : (
                    <span className="legend-name">
                      <Swatch color={r.color} dash={r.dash} />
                      <span className="legend-label" title={r.label}>
                        {r.parent && top.has(r.parent) ? r.label.slice(r.label.lastIndexOf(" · ") + 3) : r.label}
                      </span>
                    </span>
                  )}
                </th>
                {live && (
                  <td className={`legend-val${r.atOver ? " over" : ""}`}>
                    {r.at}
                    {r.lead && (
                      <span className="lead" title={r.lead.title} aria-label={r.lead.title}>
                        {" "}
                        {r.lead.mark}
                      </span>
                    )}
                  </td>
                )}
                {hasPeak && (
                  <td className={r.peak?.over ? "over" : undefined}>
                    {r.peak ? (
                      <>
                        <span className="legend-val">{r.peak.main}</span>
                        {r.peak.sub && <span className="legend-sub">{r.peak.sub}</span>}
                      </>
                    ) : (
                      "–"
                    )}
                  </td>
                )}
                {r.cols.slice(0, columns.length).map((c, i) => (
                  <td key={i} className="legend-note">
                    {c || "–"}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
