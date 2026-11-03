import { useEffect, useRef, useState } from "react";
import { decodeState, encodeState, type AppState } from "./state.ts";

const KEY = "speaker-box-genius.projects";

interface Saved {
  name: string;
  savedAt: string;
  /** The same "s=…" string a share link carries. */
  hash: string;
}

/** Browser storage can be missing, full or blocked (private mode): never let that break the app. */
function readSaved(): Saved[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(v) ? v.filter((x) => x && typeof x.name === "string" && typeof x.hash === "string") : [];
  } catch {
    return [];
  }
}

function writeSaved(list: Saved[]): boolean {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
    return true;
  } catch {
    return false;
  }
}

const fileName = (s: string) => s.replace(/[^\w.-]+/g, " ").trim() || "speaker-box";

export function ProjectsMenu(props: { state: AppState; onOpen: (s: AppState) => void }) {
  const [open, setOpen] = useState(false);
  const [saved, setSaved] = useState<Saved[]>(readSaved);
  const [msg, setMsg] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setSaved(readSaved());
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    // Escape closes the menu and puts focus back on its button.
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setOpen(false);
      ref.current?.querySelector<HTMLButtonElement>("button")?.focus();
    };
    addEventListener("mousedown", close);
    addEventListener("keydown", onKey);
    return () => {
      removeEventListener("mousedown", close);
      removeEventListener("keydown", onKey);
    };
  }, [open]);

  const flash = (m: string) => {
    setMsg(m);
    setTimeout(() => setMsg(""), 2500);
  };

  const save = () => {
    const name = prompt("Save this project as:", props.state.driverName)?.trim();
    if (!name) return;
    const entry: Saved = { name, savedAt: new Date().toISOString(), hash: encodeState(props.state) };
    const list = [entry, ...readSaved().filter((x) => x.name !== name)].slice(0, 50);
    if (writeSaved(list)) {
      setSaved(list);
      flash("Saved ✓");
    } else {
      flash("This browser won't let the page save. Use “Save project file” instead.");
    }
    setOpen(false);
  };

  const openSaved = (x: Saved) => {
    const s = decodeState(x.hash);
    if (s) props.onOpen(s);
    else flash("That project couldn't be read");
    setOpen(false);
  };

  const remove = (x: Saved) => {
    const list = readSaved().filter((y) => y.name !== x.name);
    writeSaved(list);
    setSaved(list);
  };

  const download = () => {
    const file = { app: "speaker-box-genius", saved: new Date().toISOString(), state: props.state };
    const url = URL.createObjectURL(new Blob([JSON.stringify(file, null, 2)], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${fileName(props.state.driverName)}.sbg.json`;
    a.click();
    URL.revokeObjectURL(url);
    setOpen(false);
  };

  const upload = async (f: File) => {
    try {
      const file = JSON.parse(await f.text());
      if (file?.app !== "speaker-box-genius" || !file.state) throw new Error();
      // Go through the share-link decoder so old files are migrated and checked the same way.
      const s = decodeState(encodeState(file.state));
      if (!s) throw new Error();
      props.onOpen(s);
      flash(`Opened ${f.name}`);
    } catch {
      flash(`${f.name} isn't a Speaker Box Genius project file`);
    }
    setOpen(false);
  };

  return (
    <div className="share" ref={ref}>
      <button className="secondary" onClick={() => setOpen(!open)} aria-expanded={open}>
        {msg || "Projects ▾"}
      </button>
      {open && (
        <div className="share-menu" role="menu">
          <button role="menuitem" onClick={save}>
            Save in this browser…
          </button>
          {saved.length > 0 && <p className="menu-label">Saved in this browser</p>}
          {saved.map((x) => (
            <div key={x.name} className="saved-row">
              <button role="menuitem" onClick={() => openSaved(x)} title={`Saved ${new Date(x.savedAt).toLocaleString()}`}>
                {x.name}
              </button>
              <button className="icon" aria-label={`Delete ${x.name}`} title="Delete" onClick={() => remove(x)}>
                ✕
              </button>
            </div>
          ))}
          <hr />
          <button role="menuitem" onClick={download}>
            Save project file (.json)
          </button>
          <button role="menuitem" onClick={() => fileInput.current?.click()}>
            Open project file…
          </button>
          <input
            ref={fileInput}
            type="file"
            accept=".json,application/json"
            hidden
            onChange={(e) => {
              const f = e.currentTarget.files?.[0];
              if (f) upload(f);
              e.currentTarget.value = "";
            }}
          />
          <p className="hint">Browser saves stay on this device. Project files and share links work anywhere.</p>
        </div>
      )}
    </div>
  );
}
