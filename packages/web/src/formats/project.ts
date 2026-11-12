import { decodeState, encodeState, type AppState } from "../state.ts";
import { safeName, type ExportFormat } from "./types.ts";
import { PROJECT_EXT, PROJECT_MIME } from "./imports.ts";

const KEY = "speaker-box-genius.projects";
/** Saves kept in this browser; the oldest go past this. */
const MAX_SAVED = 50;

export interface Saved {
  name: string;
  savedAt: string;
  /** The same "s=…" string a share link carries. */
  hash: string;
}

/** Browser storage can be missing, full or blocked (private mode): never let that break the app. */
export function readSaved(): Saved[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(v) ? v.filter((x) => x && typeof x.name === "string" && typeof x.hash === "string") : [];
  } catch {
    return [];
  }
}

export function writeSaved(list: Saved[]): boolean {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
    return true;
  } catch {
    return false;
  }
}

/** Save in this browser under a name (the same name is replaced); the message to show. */
export function saveInBrowser(state: AppState, name: string): { ok: boolean; message: string } {
  const n = name.trim();
  if (!n) return { ok: false, message: "Give the project a name." };
  const entry: Saved = { name: n, savedAt: new Date().toISOString(), hash: encodeState(state) };
  const list = [entry, ...readSaved().filter((x) => x.name !== n)].slice(0, MAX_SAVED);
  return writeSaved(list)
    ? { ok: true, message: `Saved “${n}” in this browser.` }
    : { ok: false, message: "This browser won't let the page save. Save a project file (.sbgenius) instead." };
}

export function removeSaved(name: string): Saved[] {
  const list = readSaved().filter((y) => y.name !== name);
  writeSaved(list);
  return list;
}

/** A saved project's state, or null if it can't be read. */
export const openSavedState = (x: Saved): AppState | null => decodeState(x.hash);

/** The project file's contents. */
export const projectJson = (state: AppState, date = new Date()) =>
  JSON.stringify({ app: "speaker-box-genius", saved: date.toISOString(), state }, null, 2);

/** A project file back to a state (migrated and checked like a share link), or null. */
export function readProjectJson(text: string): AppState | null {
  try {
    const file = JSON.parse(text);
    if (file?.app !== "speaker-box-genius" || !file.state) return null;
    return decodeState(encodeState(file.state));
  } catch {
    return null;
  }
}

export const browserFormat: ExportFormat = {
  id: "browser",
  group: "project",
  label: "Save in this browser",
  ext: "this device",
  icon: "browser",
  help: "Kept on this device only. The same name replaces the earlier save. Open it again from Open / Import.",
  scope: "workspace",
  options: [{ key: "name", label: "Name", kind: "text" }],
  defaults: (s) => ({ name: s.driverName }),
  action: "Save",
  run({ state }, _ids, o) {
    const r = saveInBrowser(state, o.name ?? "");
    return r.ok ? { message: r.message } : r.message;
  },
};

export const projectFormat: ExportFormat = {
  id: "json",
  group: "project",
  label: "Project file",
  ext: PROJECT_EXT,
  icon: "file",
  help: "The whole project as a file: back it up, or open it on another device.",
  scope: "workspace",
  run({ state }) {
    return { files: [{ name: `${safeName(state.driverName)}${PROJECT_EXT}`, data: projectJson(state), type: PROJECT_MIME }] };
  },
};
