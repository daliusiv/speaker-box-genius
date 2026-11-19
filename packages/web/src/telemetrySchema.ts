/**
 * What the app's anonymous usage stats and crash reports may contain (telemetry.ts). Every event, every
 * property and every text value is on a fixed list here; anything else is dropped in the browser before it
 * leaves. So names, values you type, file contents and the design after the `#` can't be sent, even by
 * mistake in a later change. Kept free of PostHog imports so it can be tested in Node. See /privacy/.
 */
import type { DesignKind, Settings, ShapeKind } from "./state.ts";
import type { LimitKind } from "./sim.ts";
import type { CompatPreset } from "./compat.ts";
import type { SubmissionKind } from "../../db-tools/src/submission.ts";
import type { PanelId } from "./PanelTabs.tsx";
import type { ChartId } from "./App.tsx";
import type { ImportKind, ImportUse } from "./formats/imports.ts";
import { scrubValue } from "./errorScrub.ts";

/** A list that must name every member of T: a new box type, tab or chart fails the type check until it's added. */
const all =
  <T extends string>() =>
  <const L extends readonly T[]>(list: L & (Exclude<T, L[number]> extends never ? unknown : { missing: Exclude<T, L[number]> })) =>
    list;

export const BOX_TYPES = all<DesignKind>()(["sealed", "vented", "pr", "bandpass", "line", "ib"]);
export const SHAPES = all<ShapeKind>()(["box", "wedge", "cylinder", "sphere", "frustum"]);
export const PANELS = all<PanelId>()(["driver", "boxes", "signal", "build", "settings"]);
export const CHARTS = all<ChartId>()(["excursion", "pr", "port", "maxspl", "impedance", "za", "delay", "transient", "pressure", "air"]);
export const IMPORT_KINDS = all<ImportKind>()(["project", "winisd", "hornresp", "measurement"]);
export const IMPORT_USES = all<ImportUse>()(["measure-driver", "overlay-impedance", "overlay-response", "driver-on-baffle"]);
/** `EXPORT_FORMATS` ids (formats/registry.ts); a test keeps the two lists equal. */
export const EXPORT_FORMAT_IDS = ["browser", "json", "csv", "wpr", "wdr", "hornresp", "spice", "baffle-frd", "dsp"] as const;
export const REFERRERS = ["reddit", "diyaudio", "google", "other", "none"] as const;
export const SETTING_KEYS = all<keyof Settings>()([
  "units", "air", "airConditions", "velocity", "excursion", "rg", "thermalLimit", "ampVolts", "ampAmps", "ampWatts", "signal",
  "inductance", "losses", "portCompression", "lineSpl", "portModel", "endCorrection", "leakage", "driveModel", "coneLoad",
  "coilTemp_C", "portLimit_ms", "prCaution_pct", "alignments", "airLimit_pct", "airInMaxSpl", "airFill", "f3From", "qaVolume", "ventPlacement",
]);
export const MATCH_PRESETS = all<CompatPreset>()(["default", "winisd", "hornresp", "vituixcad"]);
/** Limits shown as over in the summary (sim.ts LimitKind), plus Xmax reached only in the deep bass. */
export const WARNINGS = [...all<LimitKind>()(["xmax", "pr", "port", "air"]), "xmax_deep"] as const;
/** Why a file didn't open: the kind of failure, never the message or the file. */
export const SUBMISSION_KINDS = all<SubmissionKind>()(["driver", "passive-radiator"]);
export const IMPORT_FAILURES = ["unknown_type", "not_project", "unreadable"] as const;

/** What a property may hold: one of a list, a list of those, a small count, or the app's version text. */
export type Rule = readonly string[] | { readonly listOf: readonly string[] } | "count" | "version";

/** Named usage events and the properties each may carry (telemetry.ts `track`). */
export const USAGE_EVENTS = {
  app_opened: { entry: ["new", "share_link", "shared_results"], referrer: REFERRERS },
  design_added: { box_type: BOX_TYPES },
  driver_set: { source: ["database", "import", "measured", "paste"], slot: ["main", "compare"] },
  pr_set: { source: ["database"], count: "count" },
  import_done: { kind: IMPORT_KINDS, use: IMPORT_USES },
  import_failed: { kind: IMPORT_KINDS, use: IMPORT_USES, reason: IMPORT_FAILURES },
  export_done: { format: EXPORT_FORMAT_IDS },
  share_used: { action: ["link", "markdown", "bbcode", "image_download", "image_copy", "native"] },
  tool_opened: { tool: ["assistant", "measure", "baffle_frd", "program", "open_window", "export_window"] },
  tab_viewed: { tab: PANELS },
  chart_viewed: { chart: CHARTS },
  setting_changed: { key: [...SETTING_KEYS, "match"], preset: MATCH_PRESETS },
  warning_shown: { warning: WARNINGS, box_type: BOX_TYPES },
  submit_opened: { kind: SUBMISSION_KINDS },
  submit_sent: { kind: SUBMISSION_KINDS },
} as const satisfies Record<string, Record<string, Rule>>;

export type UsageEvent = keyof typeof USAGE_EVENTS;
type Value<R> = R extends readonly (infer V)[] ? V : R extends { listOf: readonly (infer V)[] } ? V[] : R extends "count" ? number : string;
/** The properties an event takes, typed from the schema above. */
export type UsageProps<E extends UsageEvent> = { [K in keyof (typeof USAGE_EVENTS)[E]]?: Value<(typeof USAGE_EVENTS)[E][K]> };

/** Sent with every event, crash reports included: which build, and a summary of what's open (never the design). */
export const CONTEXT = {
  app_version: "version",
  site: ["live", "preview"],
  box_types: { listOf: BOX_TYPES },
  design_count: "count",
  driver_source: ["database", "custom", "none"],
  panel: PANELS,
  chart: CHARTS,
} as const satisfies Record<string, Rule>;

export type Context = { [K in keyof typeof CONTEXT]?: Value<(typeof CONTEXT)[K]> };

/** PostHog's own events allowed out with usage stats on: clicks (text masked), heatmaps, frustration clicks, page speed. */
export const SDK_EVENTS = new Set(["$autocapture", "$rageclick", "$dead_click", "$$heatmap", "$web_vitals"]);

/** Unprefixed keys the SDK itself puts on every event (the project token, the cookieless placeholder id). */
const SDK_KEYS = new Set(["token", "distinct_id"]);

function fits(rule: Rule, v: unknown): boolean {
  if (rule === "count") return typeof v === "number" && Number.isInteger(v) && v >= 0 && v < 1000;
  if (rule === "version") return typeof v === "string" && /^[\w.+-]{1,40}$/.test(v);
  if (Array.isArray(rule)) return typeof v === "string" && rule.includes(v);
  const of = (rule as { listOf: readonly string[] }).listOf;
  return Array.isArray(v) && v.length <= 20 && v.every((x) => typeof x === "string" && of.includes(x));
}

type Outgoing = { event: string; properties?: Record<string, unknown> };

/**
 * The event as it may leave the browser, or null to drop it. Crash reports always pass (unless the
 * browser asked not to be tracked, handled in telemetry.ts); everything else only with usage stats on
 * and only if listed. Properties: PostHog's own `$…` ones and SDK_KEYS pass, ours must fit their rule.
 * Every string then loses any `#…` design part (errorScrub.ts).
 */
export function cleanEvent<T extends Outgoing>(e: T | null | undefined, usage: boolean): T | null {
  if (!e) return null;
  const named = Object.hasOwn(USAGE_EVENTS, e.event);
  if (e.event !== "$exception" && !(usage && (named || SDK_EVENTS.has(e.event)))) return null;
  const rules: Record<string, Rule> = { ...CONTEXT, ...(named ? USAGE_EVENTS[e.event as UsageEvent] : {}) };
  const props: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(e.properties ?? {})) {
    if (k.startsWith("$") || SDK_KEYS.has(k)) props[k] = v;
    else if (Object.hasOwn(rules, k) && fits(rules[k]!, v)) props[k] = v;
  }
  return { ...e, properties: scrubValue(props) };
}

/** Where a visitor came from, as a bucket only: never the address itself. */
export function referrerBucket(referrer: string, ownHost: string): (typeof REFERRERS)[number] | null {
  if (!referrer) return "none";
  let host: string;
  try {
    host = new URL(referrer).hostname.toLowerCase();
  } catch {
    return "other";
  }
  if (host === ownHost) return null; // moving around the site isn't an arrival
  if (host === "reddit.com" || host.endsWith(".reddit.com") || host === "redd.it") return "reddit";
  if (host === "diyaudio.com" || host.endsWith(".diyaudio.com")) return "diyaudio";
  if (/(^|\.)google\.[a-z.]+$/.test(host)) return "google";
  return "other";
}

/** The browser asked not to be tracked: Do Not Track or Global Privacy Control. Nothing is sent then, crash reports included. */
export function browserSaysNo(nav: { doNotTrack?: string | null; globalPrivacyControl?: boolean }, win?: { doNotTrack?: string | null }): boolean {
  return nav.globalPrivacyControl === true || nav.doNotTrack === "1" || nav.doNotTrack === "yes" || win?.doNotTrack === "1";
}
