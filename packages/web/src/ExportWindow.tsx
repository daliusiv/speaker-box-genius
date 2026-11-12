import { useEffect, useState } from "react";
import { Icon } from "./Icon.tsx";
import { Sheet } from "./Sheet.tsx";
import { bundle, downloadFile } from "./formats/download.ts";
import { EXPORT_FORMATS, exportFormat } from "./formats/registry.ts";
import { GROUPS, safeName, type ExportFormat } from "./formats/types.ts";
import type { Design } from "./sim.ts";
import type { AppState } from "./state.ts";

const MEMORY = "speaker-box-genius.export";

/** The last format and its chosen settings (selects only: names start fresh). Never let storage break the window. */
function remembered(): { format?: string; opts?: Record<string, Record<string, string>> } {
  try {
    return JSON.parse(localStorage.getItem(MEMORY) ?? "{}") ?? {};
  } catch {
    return {};
  }
}

function remember(format: string, opts: Record<string, Record<string, string>>) {
  try {
    localStorage.setItem(MEMORY, JSON.stringify({ format, opts }));
  } catch {
    /* private mode: just don't remember */
  }
}

const isSelectKey = (f: ExportFormat, key: string) => f.options?.some((o) => o.key === key && o.kind === "select");

/**
 * Save & Export: a list of formats (EXPORT_FORMATS) on the left, the chosen one's boxes and
 * settings on the right, one button. On phones the list is a row of pills above the settings.
 */
export function ExportWindow(props: {
  open: boolean;
  /** Pre-select a format (a button elsewhere in the app opened the window for it). */
  format?: string;
  onClose: () => void;
  state: AppState;
  designs: Design[];
  shareUrl: () => string;
  notify: (m: string) => void;
}) {
  const { state } = props;
  const [formatId, setFormatId] = useState("json");
  const [opts, setOpts] = useState<Record<string, Record<string, string>>>({});
  const [ids, setIds] = useState<string[]>([]);
  const [error, setError] = useState("");

  const f = exportFormat(formatId) ?? EXPORT_FORMATS[0]!;
  const boxes = state.designs.filter((d) => d.on);
  const why = (d: AppState["designs"][number]) => (f.supports ? f.supports(d, state) : true);

  // On opening: the asked-for (or last) format, its remembered settings, every box it can write.
  useEffect(() => {
    if (!props.open) return;
    const mem = remembered();
    const id = exportFormat(props.format ?? "")?.id ?? exportFormat(mem.format ?? "")?.id ?? "json";
    setFormatId(id);
    setOpts(mem.opts ?? {});
    setError("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.open, props.format]);

  // Phones: the chosen format's pill scrolled into view (the row is wider than the screen).
  useEffect(() => {
    if (!props.open) return;
    requestAnimationFrame(() => document.querySelector(".format-item.on")?.scrollIntoView({ block: "nearest", inline: "center" }));
  }, [formatId, props.open]);

  useEffect(() => {
    setIds(boxes.filter((d) => why(d) === true).map((d) => d.id));
    setError("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formatId, props.open]);

  const values = { ...(f.defaults?.(state) ?? {}), ...(opts[f.id] ?? {}) };
  const setValue = (key: string, v: string) => setOpts((o) => ({ ...o, [f.id]: { ...o[f.id], [key]: v } }));
  const picked = f.scope === "designs" ? ids.filter((id) => boxes.some((d) => d.id === id && why(d) === true)) : [];
  const fileCount = f.scope === "designs" && f.id !== "csv" ? picked.length : 1;

  const run = () => {
    const keep: Record<string, Record<string, string>> = {};
    for (const [k, o] of Object.entries(opts)) {
      const fm = exportFormat(k);
      if (fm) keep[k] = Object.fromEntries(Object.entries(o).filter(([key]) => isSelectKey(fm, key)));
    }
    remember(f.id, keep);
    const r = f.run({ state, designs: props.designs, shareUrl: props.shareUrl() }, picked, values);
    if (typeof r === "string") return setError(r);
    if ("message" in r) {
      props.notify(r.message);
      return props.onClose();
    }
    const file = bundle(r.files, safeName(state.driverName));
    downloadFile(file);
    props.notify(r.notes?.length ? `Saved ${file.name}. Not in it: ${r.notes.join("; ")}.` : `Saved ${file.name}.`);
    props.onClose();
  };

  const groups = Object.keys(GROUPS) as ExportFormat["group"][];
  const label = f.action ?? (fileCount > 1 ? `Download ${fileCount} files (.zip)` : "Download");

  return (
    <Sheet
      open={props.open}
      onClose={props.onClose}
      title="Save & Export"
      className="export-window"
      footer={
        <button type="button" className="sheet-action" onClick={run} disabled={f.scope === "designs" && picked.length === 0}>
          <Icon name={f.action ? "save" : "download"} />
          {label}
        </button>
      }
    >
      <div className="export-grid">
        <div className="format-rail" role="radiogroup" aria-label="Format">
          {groups.map((g) => (
            <div key={g} className="format-group">
              <p className="menu-label">{GROUPS[g]}</p>
              {EXPORT_FORMATS.filter((x) => x.group === g).map((x) => (
                <button
                  key={x.id}
                  type="button"
                  role="radio"
                  aria-checked={x.id === f.id}
                  className={`format-item${x.id === f.id ? " on" : ""}`}
                  onClick={() => setFormatId(x.id)}
                >
                  <Icon name={x.icon} />
                  <span className="format-name">{x.label}</span>
                  <span className="format-ext">{x.ext}</span>
                </button>
              ))}
            </div>
          ))}
        </div>

        <div className="format-pane">
          <h3>
            {f.label} <span className="format-ext">{f.ext}</span>
          </h3>
          <p className="hint">{f.help}</p>

          {f.scope === "designs" && (
            <fieldset className="box-pick">
              <legend className="menu-label">Boxes</legend>
              {boxes.length === 0 && <p className="hint">No boxes are on.</p>}
              {boxes.map((d) => {
                const ok = why(d);
                return (
                  <label key={d.id} className={ok === true ? "" : "disabled"}>
                    <input
                      type="checkbox"
                      disabled={ok !== true}
                      checked={ok === true && ids.includes(d.id)}
                      onChange={(e) => {
                        const on = e.currentTarget.checked;
                        setIds((l) => (on ? [...l, d.id] : l.filter((x) => x !== d.id)));
                      }}
                    />
                    <span>{d.name}</span>
                    {ok !== true && <span className="menu-note">{ok}</span>}
                  </label>
                );
              })}
            </fieldset>
          )}

          {f.options?.map((o) => (
            <label key={o.key} className="export-field">
              <span className="menu-label">{o.label}</span>
              {o.kind === "select" ? (
                <select value={values[o.key] ?? ""} onChange={(e) => setValue(o.key, e.currentTarget.value)}>
                  {o.choices.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.text}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  type="text"
                  autoFocus
                  value={values[o.key] ?? ""}
                  onChange={(e) => setValue(o.key, e.currentTarget.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") run();
                  }}
                />
              )}
              {o.help && <span className="hint">{o.kind === "select" ? o.help(values[o.key] ?? "") : o.help()}</span>}
            </label>
          ))}

          {error && (
            <p className="export-error" role="alert">
              {error}
            </p>
          )}
        </div>
      </div>
    </Sheet>
  );
}
