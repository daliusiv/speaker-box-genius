/** Cloudflare Turnstile: check the token the form's widget produced. */

export const SITEVERIFY = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
/** The `action` the form renders its widget with. */
export const TURNSTILE_ACTION = "submit-driver";

export async function verifyTurnstile(
  token: string,
  secret: string,
  ip: string,
  allowedHosts: readonly string[],
  fetcher: typeof fetch = fetch,
): Promise<{ ok: boolean; reason: string }> {
  if (!token) return { ok: false, reason: "no-token" };
  if (!secret) return { ok: false, reason: "no-secret" };
  const form = new FormData();
  form.set("secret", secret);
  form.set("response", token);
  if (ip) form.set("remoteip", ip);
  try {
    const res = await fetcher(SITEVERIFY, { method: "POST", body: form });
    if (!res.ok) return { ok: false, reason: `siteverify-${res.status}` };
    const r = (await res.json()) as { success?: boolean; hostname?: string; action?: string; "error-codes"?: string[] };
    // Test keys answer hostname "example.com" and no action: accept those only with the test secret.
    const testKey = secret.startsWith("1x0000000000000000000000000000000");
    // The reason is Cloudflare's error code or which check failed: nothing secret, and it tells a
    // maintainer what to fix (e.g. "invalid-input-secret", "timeout-or-duplicate", "hostname").
    if (r.success !== true) return { ok: false, reason: (r["error-codes"] ?? []).join(",") || "failed" };
    if (testKey) return { ok: true, reason: "" };
    if (r.action !== TURNSTILE_ACTION) return { ok: false, reason: `action ${r.action ?? "none"}` };
    if (!allowedHosts.includes(r.hostname ?? "")) return { ok: false, reason: `hostname ${r.hostname ?? "none"}` };
    return { ok: true, reason: "" };
  } catch {
    return { ok: false, reason: "siteverify-unreachable" };
  }
}
