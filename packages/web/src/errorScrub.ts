/**
 * Cleans what's sent before it leaves the browser (telemetry.ts, telemetrySchema.ts). A design lives after the
 * `#` in the address, and the privacy page promises it's never sent anywhere, so every web address
 * in the report loses its `#…` part. Kept free of PostHog imports so it can be tested in Node.
 */

/** Any http(s) address in the text, with its `#…` fragment removed. */
export function stripHash(text: string): string {
  return text.replace(/(https?:\/\/[^\s#"'<>]*)#[^\s"'<>]*/g, "$1");
}

/** A copy of the value with stripHash applied to every string in it (objects and arrays included). */
export function scrubValue<T>(value: T, depth = 0): T {
  if (typeof value === "string") return stripHash(value) as T;
  if (depth > 12 || value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((v) => scrubValue(v, depth + 1)) as T;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value)) out[k] = scrubValue(v, depth + 1);
  return out as T;
}


/** Hosts that never report: local development and test runs of a production build. */
export function isLocalHost(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]" || hostname.endsWith(".local");
}
