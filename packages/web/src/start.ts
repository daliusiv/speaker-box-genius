import { DEFAULT_STATE, type AppState } from "./state.ts";
import { decodeSharedAny, type SharedResults } from "./assistant.ts";

/** The marker a new tab is opened with to start a fresh project in the design assistant. */
export const ASSISTANT_HASH = "#assistant";

/**
 * Whether this page starts in the design assistant: a tab opened with #assistant (New
 * project, or the assistant from a project that's in use), or the very first visit with no
 * link. Never for a shared link, nor for someone who has used the app before. Read once, as
 * the page loads, before the app writes its own design into the address.
 */
/** A shared list of assistant results ("#assistant=…"): the link's text, read once as the page loads. */
const SHARED_TEXT: string | null = (() => {
  if (typeof location === "undefined") return null;
  return /^#assistant=([\w-]+)$/.exec(location.hash)?.[1] ?? null;
})();
/** Whether the page was opened from a shared list of results. */
export const SHARED_LINK = SHARED_TEXT !== null;
/** The shared list, decoded (a compressed link takes a moment); null if there's none or it's broken. */
export const SHARED_RESULTS: Promise<SharedResults | null> = SHARED_TEXT ? decodeSharedAny(SHARED_TEXT) : Promise.resolve(null);

export const START_IN_ASSISTANT = (() => {
  if (typeof location === "undefined") return false;
  if (location.hash === ASSISTANT_HASH || SHARED_LINK) return true;
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
