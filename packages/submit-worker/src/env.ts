/**
 * What the Worker gets from Cloudflare. Secrets and variables are set in the
 * Cloudflare dashboard (never in the repo); the rate limit binding comes from
 * .github/cloudflare/submit-worker.jsonc.
 */

/** Cloudflare's rate limiting binding (period 10 or 60 s, counted per Cloudflare location). */
export interface RateLimit {
  limit(opts: { key: string }): Promise<{ success: boolean }>;
}

export interface Env {
  /** GitHub App id (number as text). */
  GH_APP_ID: string;
  /** The App's private key: the .pem GitHub gives (PKCS#1) or PKCS#8, pasted whole. */
  GH_APP_PRIVATE_KEY: string;
  /** Installation id of the App on TARGET_REPO. */
  GH_INSTALLATION_ID: string;
  /** "owner/repo" the pull requests open on (the public repo). */
  TARGET_REPO: string;
  TURNSTILE_SECRET: string;
  /** Comma-separated origins allowed to submit, e.g. "https://speakerboxgenius.com". */
  ALLOWED_ORIGINS: string;
  /** More origins, set only in the dashboard (a private preview's address stays out of the repo). */
  EXTRA_ORIGINS?: string;
  /** "1": check everything and reply with the would-be pull request, open nothing. */
  DRY_RUN?: string;
  /** Most open web-submission pull requests at once (default 20). */
  MAX_OPEN?: string;
  /** Most web submissions per hour across everyone (default 60). */
  MAX_PER_HOUR?: string;
  /** Per-IP brake (binding from submit-worker.jsonc). Missing → no per-IP limit. */
  PER_IP?: RateLimit;
}

export const LABELS = ["database", "web-submission"] as const;
