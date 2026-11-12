/**
 * Every colour the charts draw with, in one place. UI colours (surfaces, text, the cyan accent)
 * are CSS tokens in styles.css; these are the traces and limit lines, which stay the same
 * whatever the theme does.
 */
import type { DesignKind } from "./state.ts";

/**
 * Each box type has its own colour, whatever else is in the project: sealed blue, ported
 * orange, passive radiators green, bandpass purple, transmission lines pink. A second (third…)
 * design of the same type takes the next shade of its colour.
 */
export const KIND_COLORS: Record<DesignKind, readonly string[]> = {
  sealed: ["#3b82f6", "#93c5fd", "#6366f1", "#bfdbfe"],
  vented: ["#f97316", "#fdba74", "#c2410c", "#ffedd5"],
  pr: ["#22c55e", "#86efac", "#84cc16", "#bbf7d0"],
  bandpass: ["#a855f7", "#d8b4fe", "#d946ef", "#e9d5ff"],
  line: ["#f472b6", "#f9a8d4", "#db2777", "#fbcfe8"],
};

/** What a guide calls each of KIND_COLORS, shade by shade (site/liveNumbers.ts writes these into captions). */
export const KIND_COLOR_NAMES: Record<DesignKind, readonly string[]> = {
  sealed: ["blue", "light blue", "indigo", "pale blue"],
  vented: ["orange", "light orange", "dark orange", "pale orange"],
  pr: ["green", "light green", "lime", "pale green"],
  bandpass: ["purple", "light purple", "magenta", "pale purple"],
  line: ["pink", "light pink", "dark pink", "pale pink"],
};

/** Measured curves: apart from the design palette, drawn dashed. */
export const MEASURED_COLORS = ["#0ea5e9", "#eab308", "#ec4899", "#84cc16"];

/** Limit lines and the max-SPL ribbon: dashed and labelled, so the colour is the second cue. */
export const LIMIT = {
  xmax: "#dc2626",
  prXmax: "#9333ea",
  port: "#d97706",
  thermal: "#6b7389",
  amp: "#0891b2",
  air: "#0d9488",
  deepBass: "#fbbf24",
} as const;

/** Past a limit: the part of a curve over its line. */
export const OVER_RED = LIMIT.xmax;

/** Neutral reference lines (0°, a duct's own impedance) and measured-reference curves. */
export const GUIDE = "#8e96aa";
export const GUIDE_DIM = "#6b7389";

/** EQ handles: white, so an EQ point never looks like one of the boxes' curves. */
export const EQ_HANDLE = "#e8ebf2";
