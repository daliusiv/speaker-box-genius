/**
 * Weekly Google Search Console report for speakerboxgenius.com, for
 * .github/workflows/search-console.yml (dev repo only).
 *
 * Reads the Search Console API with a Google service account (read-only scope) and writes a
 * Markdown report: totals for the last 28 days against the 28 before, top queries and pages,
 * devices, countries, sitemaps, and "near misses" (queries shown often on page 1–2 but rarely
 * clicked). The workflow posts the report as a comment on a private dev-repo issue.
 *
 * Env:
 *   GSC_SERVICE_ACCOUNT  the service account's JSON key (client_email, private_key)
 *   GSC_SITE             Search Console property (default sc-domain:speakerboxgenius.com)
 *   GSC_END_DATE         last day of the window, YYYY-MM-DD (default: 3 days ago, UTC; the
 *                        newest Search Console data is about 2–3 days old)
 *   OUT                  report file (default search-console-report.md)
 *
 * No dependencies: the token request is a JWT signed with node:crypto.
 */
import { createSign } from "node:crypto";
import { writeFileSync } from "node:fs";

const API = "https://searchconsole.googleapis.com/webmasters/v3";
const SCOPE = "https://www.googleapis.com/auth/webmasters.readonly";
export const DAYS = 28;

export interface Row { keys?: string[]; clicks: number; impressions: number; ctr: number; position: number }
export interface Window { start: string; end: string }
export interface Sitemap {
  path: string; lastDownloaded?: string; errors?: string | number; warnings?: string | number;
  isPending?: boolean; contents?: { type: string; submitted?: string | number; indexed?: string | number }[];
}
export interface ReportData {
  site: string; current: Window; previous: Window;
  totals: { current?: Row; previous?: Row };
  /** Top queries shown in the table; allQueries (up to 500) feeds the near misses. */
  queries: Row[]; allQueries?: Row[]; previousQueries: Row[]; pages: Row[]; devices: Row[]; countries: Row[];
  sitemaps: Sitemap[];
}

const iso = (d: Date) => d.toISOString().slice(0, 10);
function addDays(day: string, n: number): string {
  const d = new Date(day + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return iso(d);
}

/** The current 28-day window ending on `end`, and the 28 days before it. */
export function windows(end: string): { current: Window; previous: Window } {
  const start = addDays(end, -(DAYS - 1));
  return { current: { start, end }, previous: { start: addDays(start, -DAYS), end: addDays(start, -1) } };
}

export function defaultEnd(now = new Date()): string {
  return addDays(iso(now), -3);
}

/** "+12 %", "−5 %", "new" (nothing before), "–" (nothing either time). */
export function change(now: number, before: number): string {
  if (!before) return now ? "new" : "–";
  const p = Math.round(((now - before) / before) * 100);
  return p > 0 ? `+${p} %` : p < 0 ? `−${-p} %` : "0 %";
}

/** Shown often near the top but rarely clicked: impressions ≥ 50, position 4–20, CTR < 2 %. */
export function nearMisses(rows: Row[], limit = 10): Row[] {
  return rows
    .filter((r) => r.impressions >= 50 && r.position >= 4 && r.position <= 20 && r.ctr < 0.02)
    .sort((a, b) => b.impressions - a.impressions)
    .slice(0, limit);
}

/** Page URL → site path ("https://speakerboxgenius.com/guides/x/" → "/guides/x/"). */
export function path(url: string): string {
  try { return new URL(url).pathname || "/"; } catch { return url; }
}

const cell = (s: string) => s.replace(/\|/g, "\\|").replace(/\s+/g, " ").trim();
const pct = (x: number) => `${(x * 100).toFixed(1)} %`;
const pos = (x: number) => x.toFixed(1);

export function formatReport(d: ReportData): string {
  const out: string[] = [];
  const c = d.totals.current ?? { clicks: 0, impressions: 0, ctr: 0, position: 0 };
  const p = d.totals.previous ?? { clicks: 0, impressions: 0, ctr: 0, position: 0 };
  out.push(`## Search Console ${d.current.end}`, "");
  out.push(`\`${d.site}\`, ${d.current.start} → ${d.current.end} vs ${d.previous.start} → ${d.previous.end} (web search).`, "");
  out.push("| | Last 28 days | 28 days before | Change |", "|---|---:|---:|---:|");
  out.push(`| Clicks | ${c.clicks} | ${p.clicks} | ${change(c.clicks, p.clicks)} |`);
  out.push(`| Impressions | ${c.impressions} | ${p.impressions} | ${change(c.impressions, p.impressions)} |`);
  out.push(`| CTR | ${pct(c.ctr)} | ${pct(p.ctr)} | |`);
  out.push(`| Avg position | ${pos(c.position)} | ${pos(p.position)} | |`, "");

  const before = new Map(d.previousQueries.map((r) => [r.keys?.[0] ?? "", r]));
  out.push("### Top queries", "", "| Query | Clicks | Impr. | CTR | Pos. | Clicks change |", "|---|---:|---:|---:|---:|---:|");
  for (const r of d.queries) {
    const q = r.keys?.[0] ?? "";
    out.push(`| ${cell(q)} | ${r.clicks} | ${r.impressions} | ${pct(r.ctr)} | ${pos(r.position)} | ${change(r.clicks, before.get(q)?.clicks ?? 0)} |`);
  }
  if (!d.queries.length) out.push("| (none) | | | | | |");
  out.push("");

  out.push("### Top pages", "", "| Page | Clicks | Impr. | CTR | Pos. |", "|---|---:|---:|---:|---:|");
  for (const r of d.pages) out.push(`| ${cell(path(r.keys?.[0] ?? ""))} | ${r.clicks} | ${r.impressions} | ${pct(r.ctr)} | ${pos(r.position)} |`);
  if (!d.pages.length) out.push("| (none) | | | | |");
  out.push("");

  const misses = nearMisses(d.allQueries ?? d.queries);
  out.push("### Near misses (shown on page 1–2, rarely clicked)", "");
  if (misses.length) {
    out.push("| Query | Impr. | CTR | Pos. |", "|---|---:|---:|---:|");
    for (const r of misses) out.push(`| ${cell(r.keys?.[0] ?? "")} | ${r.impressions} | ${pct(r.ctr)} | ${pos(r.position)} |`);
  } else out.push("None.");
  out.push("");

  out.push("### Devices", "", "| Device | Clicks | Impr. | CTR | Pos. |", "|---|---:|---:|---:|---:|");
  for (const r of d.devices) out.push(`| ${cell((r.keys?.[0] ?? "").toLowerCase())} | ${r.clicks} | ${r.impressions} | ${pct(r.ctr)} | ${pos(r.position)} |`);
  out.push("");

  out.push("### Countries (top 10 by clicks)", "", "| Country | Clicks | Impr. | Pos. |", "|---|---:|---:|---:|");
  for (const r of d.countries) out.push(`| ${cell((r.keys?.[0] ?? "").toUpperCase())} | ${r.clicks} | ${r.impressions} | ${pos(r.position)} |`);
  out.push("");

  out.push("### Sitemaps", "");
  if (d.sitemaps.length) {
    out.push("| Sitemap | Last read | Errors | Warnings | Submitted |", "|---|---|---:|---:|---:|");
    for (const s of d.sitemaps) {
      const submitted = (s.contents ?? []).reduce((n, x) => n + Number(x.submitted ?? 0), 0);
      out.push(`| ${cell(path(s.path))} | ${s.isPending ? "pending" : (s.lastDownloaded ?? "–").slice(0, 10)} | ${Number(s.errors ?? 0)} | ${Number(s.warnings ?? 0)} | ${submitted} |`);
    }
  } else out.push("No sitemaps submitted.");
  out.push("");
  return out.join("\n");
}

// ---- API ----

const b64url = (s: string | Buffer) => Buffer.from(s).toString("base64url");

async function token(key: { client_email: string; private_key: string }): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const head = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = b64url(JSON.stringify({ iss: key.client_email, scope: SCOPE, aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600 }));
  const sig = createSign("RSA-SHA256").update(`${head}.${claims}`).sign(key.private_key).toString("base64url");
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${head}.${claims}.${sig}` }),
  });
  if (!res.ok) throw new Error(`token request failed: ${res.status} ${await res.text()}`);
  return ((await res.json()) as { access_token: string }).access_token;
}

async function main() {
  const raw = process.env.GSC_SERVICE_ACCOUNT;
  if (!raw) throw new Error("GSC_SERVICE_ACCOUNT is not set");
  const site = process.env.GSC_SITE || "sc-domain:speakerboxgenius.com";
  const { current, previous } = windows(process.env.GSC_END_DATE || defaultEnd());
  const auth = `Bearer ${await token(JSON.parse(raw))}`;
  const base = `${API}/sites/${encodeURIComponent(site)}`;

  async function query(w: Window, dimensions: string[], rowLimit: number): Promise<Row[]> {
    const res = await fetch(`${base}/searchAnalytics/query`, {
      method: "POST",
      headers: { authorization: auth, "content-type": "application/json" },
      body: JSON.stringify({ startDate: w.start, endDate: w.end, dimensions, rowLimit, type: "web" }),
    });
    if (!res.ok) throw new Error(`searchAnalytics ${dimensions.join(",") || "totals"} failed: ${res.status} ${await res.text()}`);
    return ((await res.json()) as { rows?: Row[] }).rows ?? [];
  }

  const [tc, tp, allQueries, previousQueries, pages, devices, countries] = await Promise.all([
    query(current, [], 1), query(previous, [], 1),
    query(current, ["query"], 500), query(previous, ["query"], 500),
    query(current, ["page"], 25), query(current, ["device"], 10), query(current, ["country"], 10),
  ]);
  const sm = await fetch(`${base}/sitemaps`, { headers: { authorization: auth } });
  const sitemaps = sm.ok ? (((await sm.json()) as { sitemap?: Sitemap[] }).sitemap ?? []) : [];

  const md = formatReport({
    site, current, previous, totals: { current: tc[0], previous: tp[0] },
    queries: allQueries.slice(0, 25), allQueries, previousQueries, pages, devices, countries, sitemaps,
  });
  writeFileSync(process.env.OUT || "search-console-report.md", md);
  console.log(md);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
}
