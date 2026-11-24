/**
 * Anonymous crash reports and usage stats through PostHog's EU cloud. Built in only when the build has a
 * VITE_POSTHOG_TOKEN (the deploy workflows pass the repo variable POSTHOG_TOKEN); without it, on local
 * hosts, or when the browser sends Do Not Track / Global Privacy Control, nothing is loaded or sent. See /privacy/.
 *
 * What's sent: crash reports (the error, its stack trace, the page address without the design after the
 * `#`, the browser, the app version and a short summary of what's open: box types, tab, chart, where the
 * driver came from), and usage stats (the named events in telemetrySchema.ts, clicks with all text masked,
 * frustration clicks and page speed), and with usage stats on, session replays (REPLAY: what you type
 * and sliders are hidden, design links blocked; labels, results and charts show as on screen). No cookies or browser storage (memory-only persistence: each page load is a new
 * anonymous visitor; cookieless_mode is off because posthog-js refuses replay with it), no page views (the
 * site's visit counter has those), no console output or network bodies, and nothing that identifies the
 * visitor. Every event goes through `cleanEvent` (telemetrySchema.ts): only listed events, properties and
 * values leave.
 *
 * The SDK is loaded after the page, so it never slows the first render; errors, events and context from
 * before then are kept and sent once it's ready.
 */
import type { PostHog } from "posthog-js";
import { isLocalHost } from "./errorScrub.ts";
import { browserSaysNo, cleanEvent, type Context, type UsageEvent, type UsageProps } from "./telemetrySchema.ts";

const TOKEN: string | undefined = import.meta.env.VITE_POSTHOG_TOKEN;
/** The browser sends Do Not Track or Global Privacy Control: nothing is sent at all (Settings shows the switch off). */
export const browserAskedNotToTrack = browserSaysNo(navigator as Navigator & { globalPrivacyControl?: boolean }, window as Window & { doNotTrack?: string });
const enabled = import.meta.env.PROD && !!TOKEN && !isLocalHost(location.hostname) && !browserAskedNotToTrack;

/** Settings → Privacy → Help improve the app, kept in this browser only ("off" when switched off). */
const PREF = "sbg.usageStats";
/** Usage stats on or off (crash reports aren't affected). On unless switched off in Settings. */
let usage = (() => {
  try {
    return localStorage.getItem(PREF) !== "off";
  } catch {
    return true;
  }
})();
let ph: PostHog | null = null;

/**
 * Session replay masking: only what the visitor enters is hidden. Every input's value is masked (rrweb
 * draws it as `*`), sliders are blocked (an empty box; dragging one is still seen), and any link carrying a
 * design after `#` is blocked. Labels, results, driver names and charts are recorded as shown, so a replay
 * reads like the screen. Network bodies and console output are off.
 */
export const REPLAY = {
  maskAllInputs: true,
  blockSelector: 'a[href*="#"], input[type="range"]',
  recordCrossOriginIframes: false,
  recordHeaders: false,
  recordBody: false,
} as const;
const early: unknown[] = [];
const pending: (() => void)[] = [];
const onError = (e: ErrorEvent) => early.push(e.error ?? e.message);
const onRejection = (e: PromiseRejectionEvent) => early.push(e.reason);

if (enabled) {
  addEventListener("error", onError);
  addEventListener("unhandledrejection", onRejection);
  if (document.readyState === "complete") void start();
  else addEventListener("load", () => void start(), { once: true });
}

/** Run now if the SDK is ready, else once it is (dropped when reporting is off). */
function whenReady(fn: () => void) {
  if (!enabled) return;
  if (ph) fn();
  else if (pending.length < 200) pending.push(fn);
}

/** A named usage event (telemetrySchema.ts USAGE_EVENTS); properties outside the schema never leave. */
export function track<E extends UsageEvent>(name: E, props: UsageProps<E> = {} as UsageProps<E>): void {
  if (!usage) return;
  whenReady(() => ph!.capture(name, props as Record<string, unknown>));
}

/** Like track, but once per key per page load (a field typed into, a warning that stays on screen). */
const sent = new Set<string>();
export function trackOnce<E extends UsageEvent>(key: string, name: E, props: UsageProps<E> = {} as UsageProps<E>): void {
  if (!usage || sent.has(key)) return;
  sent.add(key);
  track(name, props);
}

/** Replaces the summary sent with every event and crash report (telemetrySchema.ts CONTEXT). */
export function setContext(ctx: Context): void {
  whenReady(() => ph!.register(ctx as Record<string, unknown>));
}

/** Whether usage stats are on (Settings → Privacy); always false when the browser asked not to be tracked. */
export function usageStatsOn(): boolean {
  return usage && !browserAskedNotToTrack;
}

/** Switch usage stats on or off and remember it in this browser; crash reports keep going either way. */
export function setUsageStats(on: boolean): void {
  usage = on;
  // Replays follow the switch at once, not only from the next visit.
  if (ph) {
    if (on) ph.startSessionRecording();
    else ph.stopSessionRecording();
  }
  try {
    if (on) localStorage.removeItem(PREF);
    else localStorage.setItem(PREF, "off");
  } catch {
    // not remembered: back on next visit
  }
}

async function start() {
  try {
    const { default: posthog } = await import("posthog-js");
    posthog.init(TOKEN!, {
      api_host: "https://eu.i.posthog.com",
      defaults: "2026-08-30",
      // Memory only: no cookies, localStorage or sessionStorage (replay parks nothing in storage either),
      // and the random ID lives for one page load. Not cookieless_mode "always": replay refuses to run with it.
      persistence: "memory",
      person_profiles: "never",
      respect_dnt: true,
      capture_exceptions: true,
      capture_pageview: false,
      capture_pageleave: false,
      // Clicks only, with no visible text or attribute values: which control, not what it said.
      autocapture: { dom_event_allowlist: ["click"], capture_copied_text: false },
      mask_all_text: true,
      mask_all_element_attributes: true,
      rageclick: true,
      capture_dead_clicks: true,
      capture_heatmaps: true,
      capture_performance: { web_vitals: true, network_timing: false },
      // Replays only with usage stats on (Settings → Privacy); masked as REPLAY says.
      disable_session_recording: !usage,
      session_recording: REPLAY,
      enable_recording_console_log: false,
      disable_surveys: true,
      disable_web_experiments: true,
      disable_product_tours: true,
      disable_conversations: true,
      // The project config (/array/<token>/config) must load: replay only starts once it says replay is on.
      // Feature flags stay off: no /flags request.
      advanced_disable_flags: false,
      advanced_disable_feature_flags: true,
      advanced_disable_feature_flags_on_first_load: true,
      save_referrer: false,
      before_send: (event) => cleanEvent(event, usage),
    });
    posthog.register({
      app_version: import.meta.env.VITE_APP_VERSION || "unreleased",
      site: location.hostname === "speakerboxgenius.com" ? "live" : "preview",
    });
    ph = posthog;
    removeEventListener("error", onError);
    removeEventListener("unhandledrejection", onRejection);
    for (const fn of pending.splice(0)) fn();
    for (const err of early.splice(0)) posthog.captureException(err);
  } catch {
    // Blocked by the browser or offline: the app works the same without it.
  }
}
