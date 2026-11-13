import { useEffect, useRef, useState } from "react";
import { Icon } from "./Icon.tsx";
import { Sheet } from "./Sheet.tsx";
import { ago, IMPORT_ACCEPT, IMPORT_USES, importUses, type ImportUse } from "./formats/imports.ts";
import { openSavedState, readSaved, removeSaved, type Saved } from "./formats/project.ts";
import type { AppState } from "./state.ts";

/** Browser saves shown before "All saved". */
const RECENT = 3;

/**
 * Open / Import: the projects saved in this browser, and one drop zone for every file the
 * app reads. A measurement file can be used more than one way, so it asks (`pending`).
 */
export function OpenWindow(props: {
  open: boolean;
  onClose: () => void;
  onOpen: (s: AppState, name: string) => void;
  /** A picked or dropped file: the app opens it, or hands it back as `pending` to ask how to use it. */
  onFile: (f: File) => void;
  /** A measurement waiting for "use as…". */
  pending: File | null;
  onUse: (f: File, use: ImportUse) => void;
  notify: (m: string) => void;
}) {
  const [saved, setSaved] = useState<Saved[]>([]);
  const [all, setAll] = useState(false);
  const [over, setOver] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!props.open) return;
    setSaved(readSaved());
    setAll(false);
  }, [props.open]);

  const shown = all ? saved : saved.slice(0, RECENT);
  const open = (x: Saved) => {
    const s = openSavedState(x);
    if (!s) return props.notify("That project couldn't be read.");
    props.onOpen(s, x.name);
  };

  return (
    <Sheet open={props.open} onClose={props.onClose} title="Open / Import" className="open-window">
      {props.pending ? (
        <section className="sheet-section">
          <p className="menu-label">Use {props.pending.name} to…</p>
          <div className="use-list">
            {importUses(props.pending.name).map((u) => (
              <button key={u} type="button" className="secondary use-item" onClick={() => props.onUse(props.pending!, u)}>
                <b>{IMPORT_USES[u].label}</b>
                <span className="hint">{IMPORT_USES[u].help}</span>
              </button>
            ))}
          </div>
        </section>
      ) : (
        <>
          <section className="sheet-section">
            <p className="menu-label">Saved in this browser</p>
            {saved.length === 0 ? (
              <p className="hint">Nothing saved yet. Save & Export → Save in this browser keeps a project here.</p>
            ) : (
              <ul className="saved-list">
                {shown.map((x) => (
                  <li key={x.name}>
                    <button type="button" className="saved-open" onClick={() => open(x)} title={`Saved ${new Date(x.savedAt).toLocaleString()}`}>
                      <span className="saved-name">{x.name}</span>
                      <span className="menu-note">{ago(x.savedAt)}</span>
                    </button>
                    <button type="button" className="icon" aria-label={`Delete ${x.name}`} title="Delete" onClick={() => setSaved(removeSaved(x.name))}>
                      <Icon name="trash" size={16} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {!all && saved.length > RECENT && (
              <button type="button" className="link saved-more" onClick={() => setAll(true)}>
                All saved ({saved.length})
              </button>
            )}
          </section>

          <section className="sheet-section">
            <p className="menu-label">From a file</p>
            <div
              className={`drop-zone${over ? " over" : ""}`}
              onDragOver={(e) => {
                e.preventDefault();
                setOver(true);
              }}
              onDragLeave={() => setOver(false)}
              // The page-wide drop handler (App) opens the file.
              onDrop={() => setOver(false)}
            >
              <button type="button" className="sheet-action choose-file" onClick={() => input.current?.click()}>
                <Icon name="upload" size={18} />
                Choose a file
              </button>
              <p className="drop-only">or drop it here</p>
              <p className="hint">Project (.sbgenius) · WinISD (.wpr, .wdr) · OpenISD (.owpr, .owdr) · Hornresp record (.txt) · impedance (.zma) · response (.frd)</p>
              <input
                ref={input}
                type="file"
                accept={IMPORT_ACCEPT}
                hidden
                onChange={(e) => {
                  const f = e.currentTarget.files?.[0];
                  e.currentTarget.value = "";
                  if (f) props.onFile(f);
                }}
              />
            </div>
            <p className="hint drop-only">You can also drop a file anywhere on the page.</p>
          </section>
        </>
      )}
    </Sheet>
  );
}
