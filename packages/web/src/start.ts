import { DEFAULT_STATE, type AppState } from "./state.ts";
import { decodeShared, type SharedResults } from "./assistant.ts";

/** The marker a new tab is opened with to start a fresh project in the design assistant. */
export const ASSISTANT_HASH = "#assistant";

/**
 * Whether this page starts in the design assistant: a tab opened with #assistant (New
 * project, or the assistant from a project that's in use), or the very first visit with no
 * link. Never for a shared link, nor for someone who has used the app before. Read once, as
 * the page loads, before the app writes its own design into the address.
 */
/** A shared list of assistant results ("#assistant=…"), read once as the page loads. */
export const SHARED_RESULTS: SharedResults | null = (() => {
  if (typeof location === "undefined") return null;
  const m = /^#assistant=([\w-]+)$/.exec(location.hash);
  return m ? decodeShared(m[1]!) : null;
})();

export const START_IN_ASSISTANT = (() => {
  if (typeof location === "undefined") return false;
  if (location.hash === ASSISTANT_HASH || SHARED_RESULTS) return true;
  if (/(?:^#|&)[sz]=/.test(location.hash)) return false;
  try {
    const before =
      localStorage.getItem("sbg.visited") !== null ||
      localStorage.getItem("sbg.tips-dismissed") !== null ||
      localStorage.getItem("speaker-box-genius.projects") !== null;
    localStorage.setItem("sbg.visited", "1");
    return !before;
  } catch {
    return false;
  }
})();
try {
  localStorage.setItem("sbg.visited", "1");
} catch {
  /* unavailable */
}

/** Still the example project the app opens with (nothing changed): the assistant can start here. */
export const untouched = (s: AppState) => JSON.stringify(s) === JSON.stringify(DEFAULT_STATE);
