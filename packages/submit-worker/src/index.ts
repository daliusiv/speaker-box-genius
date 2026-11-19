/**
 * Submit Worker: the website form's "Submit to database" posts here, and the
 * Worker opens a data-only pull request on the public repo with a GitHub App,
 * so submitters need no GitHub account.
 *
 *   POST /v1/submit  { kind, brand, model, …, consent, turnstile, website }
 *   GET  /v1/health  { ok, dry_run }
 *
 * Order of checks, cheapest first: origin → size → JSON → honeypot → consent →
 * per-IP limit → Turnstile → build + check the record (same code as CI) →
 * duplicate on main / open branch → queue and hourly caps → pull request.
 * The IP is only used for the rate limit key (a hash with a daily salt) and is
 * never stored or logged.
 */
import { fixCounts, isCountFile, totalsFromPaths } from "../../db-tools/src/counts.ts";
import { buildRecord, checkRecord, cleanCredit, type BuiltRecord, type Problem } from "../../db-tools/src/submission.ts";
import { LABELS, type Env } from "./env.ts";
import { GitHub, GitHubError } from "./github.ts";
import { readPayload } from "./payload.ts";
import { prBody, prTitle } from "./prBody.ts";
import { verifyTurnstile } from "./turnstile.ts";

export const MAX_BODY = 16 * 1024;

export interface Deps {
  fetch: typeof fetch;
  now: () => number;
  /** Builds the GitHub client (tests swap it for a fake). */
  github: (env: Env, fetcher: typeof fetch) => Promise<GitHub>;
}

const defaultDeps: Deps = {
  fetch: (...a) => fetch(...a),
  now: () => Date.now(),
  github: (env, f) => GitHub.forInstallation(env.GH_APP_ID, env.GH_APP_PRIVATE_KEY, env.GH_INSTALLATION_ID, env.TARGET_REPO, f),
};

const origins = (env: Env) =>
  `${env.ALLOWED_ORIGINS ?? ""},${env.EXTRA_ORIGINS ?? ""}`
    .split(",")
    .map((s) => s.trim().replace(/\/$/, ""))
    .filter(Boolean);

function cors(origin: string): Record<string, string> {
  return {
    "access-control-allow-origin": origin,
    "access-control-allow-methods": "POST, GET, OPTIONS",
    "access-control-allow-headers": "content-type",
    "access-control-max-age": "86400",
    vary: "Origin",
  };
}

function json(status: number, body: unknown, origin = ""): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...(origin ? cors(origin) : {}) },
  });
}

/** One error the form shows in its summary box (field "" = not tied to a field). */
const fail = (status: number, code: string, message: string, origin: string, extra: Record<string, unknown> = {}) =>
  json(status, { ok: false, code, errors: [{ field: "", message }], ...extra }, origin);

/** A short, non-secret description of why the GitHub App couldn't sign in. */
export function appProblem(e: unknown): string {
  if (e instanceof GitHubError) {
    if (e.status === 401) return "app 401: GH_APP_ID or the private key is wrong";
    if (e.status === 404) return "app 404: GH_INSTALLATION_ID is wrong or the App isn't installed";
    return `app ${e.status}`;
  }
  const m = e instanceof Error ? e.message : String(e);
  if (/DataError|invalid|decode|atob|base64/i.test(m) || (e instanceof Error && e.name === "DataError")) return "GH_APP_PRIVATE_KEY can't be read: paste the whole .pem file";
  return "app sign-in failed";
}

async function sha256Hex(s: string): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function handle(req: Request, env: Env, deps: Deps = defaultDeps): Promise<Response> {
  const url = new URL(req.url);
  const origin = (req.headers.get("origin") ?? "").replace(/\/$/, "");
  const allowed = origins(env);
  const okOrigin = allowed.includes(origin) ? origin : "";

  // Any origin may ask and read the answer (nothing private is in it), so a site that isn't allowed
  // gets a readable "not allowed" instead of a bare network error; only allowed origins can submit.
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(origin || "*") });
  if (req.method === "GET" && url.pathname === "/v1/health") return json(200, { ok: true, dry_run: env.DRY_RUN === "1" }, okOrigin);
  if (url.pathname !== "/v1/submit") return json(404, { ok: false, code: "not-found" });
  if (req.method !== "POST") return json(405, { ok: false, code: "method" });
  if (!okOrigin) return fail(403, "origin", `Submissions from ${origin || "this page"} aren't allowed.`, origin || "*");

  const text = await req.text();
  if (text.length > MAX_BODY) return fail(413, "too-large", "The submission is too large.", okOrigin);
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return fail(400, "bad-json", "The submission couldn't be read.", okOrigin);
  }
  const p = readPayload(raw);
  if (!p) return fail(400, "bad-kind", "Choose Driver or Passive radiator.", okOrigin);
  // Bots fill in the hidden field: answer as if it worked and do nothing.
  if (p.honeypot) return json(202, { ok: true }, okOrigin);
  if (!p.consent) return json(400, { ok: false, code: "consent", errors: [{ field: "consent", message: "Tick both boxes to confirm where the values come from and the licence." }] }, okOrigin);

  const ip = req.headers.get("cf-connecting-ip") ?? "";
  const day = new Date(deps.now()).toISOString().slice(0, 10);
  if (env.PER_IP && ip) {
    const key = await sha256Hex(`${day}|${ip}|${env.TURNSTILE_SECRET}`);
    if (!(await env.PER_IP.limit({ key })).success) return fail(429, "rate-limited", "Too many submissions from here in the last minute. Wait a minute and try again.", okOrigin);
  }

  const hosts = allowed.map((o) => new URL(o).hostname);
  const human = await verifyTurnstile(p.turnstile, env.TURNSTILE_SECRET, ip, hosts, deps.fetch);
  if (!human.ok) return fail(403, "turnstile", `The human check didn't pass (${human.reason}). Reload the form and try again.`, okOrigin);

  const credit = cleanCredit(p.credit);
  let gh: GitHub;
  try {
    gh = await deps.github(env, deps.fetch);
  } catch (e) {
    // Says which part of the App setup failed (key format, App id, installation id): nothing secret.
    return fail(502, "github", `GitHub didn't answer (${appProblem(e)}). Try again in a few minutes, or use the GitHub form.`, okOrigin);
  }

  try {
    const folder = p.fields.kind === "driver" ? "drivers" : "passive-radiators";
    // First pass for the slug, then again with the brand's spelling from the database.
    const first = buildRecord(p.fields, { kind: "web", today: day, credit });
    const brandText = first.brandSlug ? await gh.fileText(`${folder}/${first.brandSlug}/_brand.json`) : null;
    const brandInfo = brandText ? (JSON.parse(brandText) as { name?: string; licence?: string }) : null;
    const built: BuiltRecord = brandInfo?.name ? buildRecord(p.fields, { kind: "web", today: day, credit }, new Map([[first.brandSlug, brandInfo.name]])) : first;
    const path = `${folder}/${built.brandSlug}/${built.modelSlug}.json`;

    const onMain = built.brandSlug && built.modelSlug ? (await gh.fileText(path)) !== null : false;
    const check = checkRecord(built, { exists: () => onMain });
    if (check.errors.length) return json(422, { ok: false, code: "invalid", errors: check.errors, warnings: check.warnings }, okOrigin);

    const branch = `submit/${built.brandSlug}/${built.modelSlug}`;
    if (await gh.branchExists(branch)) {
      const pr = await gh.openPrFor(branch);
      return json(409, { ok: false, code: "pending", errors: [{ field: "model", message: "is already waiting for review." }], pr_url: pr }, okOrigin);
    }

    const load = await gh.webSubmissionLoad(LABELS[1], deps.now());
    if (load.open >= Number(env.MAX_OPEN ?? 20)) return fail(503, "queue-full", "The review queue is full right now. Please use the GitHub form, or try again in a few days.", okOrigin);
    if (load.lastHour >= Number(env.MAX_PER_HOUR ?? 60)) return fail(503, "busy", "Lots of submissions in the last hour. Please try again later.", okOrigin);

    const files = [{ path, content: JSON.stringify(built.record, null, 2) + "\n" }];
    if (!brandText) {
      files.unshift({ path: `${folder}/${built.brandSlug}/_brand.json`, content: JSON.stringify({ name: built.brand }, null, 2) + "\n" });
      // A new brand changes "N brands" in the README and docs: same pull request, or CI's counts check fails.
      const all = await gh.paths();
      const totals = totalsFromPaths([...all, ...files.map((f) => f.path)]);
      for (const p of all.filter(isCountFile)) {
        const before = await gh.fileText(p);
        if (before === null) continue;
        const after = fixCounts(before, totals);
        if (after !== before) files.push({ path: p, content: after });
      }
    }
    const title = prTitle(built);
    const body = prBody(built, path, check.warnings, credit, brandInfo?.licence ?? null);

    if (env.DRY_RUN === "1") return json(200, { ok: true, dry_run: true, path, branch, title, body, files, warnings: check.warnings }, okOrigin);

    const pr = await gh.openPullRequest({ branch, files, message: `${title} (website form)`, title, body, labels: LABELS });
    return json(201, { ok: true, pr_url: pr.html_url, pr_number: pr.number, warnings: check.warnings satisfies Problem[] }, okOrigin);
  } catch (e) {
    const status = e instanceof GitHubError ? e.status : 0;
    return fail(502, "github", `GitHub didn't accept the submission (${status || "error"}). Try again in a few minutes, or use the GitHub form.`, okOrigin);
  }
}

export default {
  fetch: (req: Request, env: Env) => handle(req, env),
};
