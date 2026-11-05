import { useRef, useState } from "react";
import { decodeState, encodeState, type AppState } from "./state.ts";

const KEY = "speaker-box-genius.projects";

export interface Saved {
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

/**
 * Saving and opening projects: in this browser (localStorage) or as a .json file. Messages go
 * to `notify` (the app's toast); `fileInput` must be rendered for "Open project file…".
 */
export function useProjects(props: { state: AppState; onOpen: (s: AppState) => void; notify: (m: string) => void }) {
  const [saved, setSaved] = useState<Saved[]>(readSaved);
  const fileInput = useRef<HTMLInputElement>(null);

  const refresh = () => setSaved(readSaved());

  const save = () => {
    const name = prompt("Save this project as:", props.state.driverName)?.trim();
    if (!name) return;
    const entry: Saved = { name, savedAt: new Date().toISOString(), hash: encodeState(props.state) };
    const list = [entry, ...readSaved().filter((x) => x.name !== name)].slice(0, 50);
    if (writeSaved(list)) {
      setSaved(list);
      props.notify(`Saved “${name}” in this browser.`);
    } else {
      props.notify("This browser won't let the page save. Use “Save project file” instead.");
    }
  };

  const openSaved = (x: Saved) => {
    const s = decodeState(x.hash);
    if (s) props.onOpen(s);
    else props.notify("That project couldn't be read.");
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
  };

  const upload = async (f: File) => {
    try {
      const file = JSON.parse(await f.text());
      if (file?.app !== "speaker-box-genius" || !file.state) throw new Error();
      // Go through the share-link decoder so old files are migrated and checked the same way.
      const s = decodeState(encodeState(file.state));
      if (!s) throw new Error();
      props.onOpen(s);
    } catch {
      props.notify(`${f.name} isn't a Speaker Box Genius project file.`);
    }
  };

  const fileInputElement = (
    <input
      ref={fileInput}
      type="file"
      accept=".json,application/json"
      hidden
      onChange={(e) => {
        const f = e.currentTarget.files?.[0];
        if (f) void upload(f);
        e.currentTarget.value = "";
      }}
    />
  );

  return { saved, refresh, save, openSaved, remove, download, openFile: () => fileInput.current?.click(), fileInputElement };
}
