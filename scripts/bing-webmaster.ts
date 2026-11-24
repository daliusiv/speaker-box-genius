/**
 * Weekly Bing Webmaster Tools numbers for speakerboxgenius.com, appended to the Search Console
 * report by .github/workflows/search-console.yml (dev repo only).
 *
 * Bing's index also feeds DuckDuckGo, Yahoo and Copilot, so it's worth watching next to Google.
 * Same windows as scripts/search-console.ts: the last 28 days against the 28 before.
 *
 * Env:
 *   BING_WEBMASTER_API_KEY  API key from Bing Webmaster Tools → Settings → API access
 *   BING_SITE               site as verified in Bing (default https://speakerboxgenius.com/)
 *   GSC_END_DATE            last day of the window, YYYY-MM-DD (default: 3 days ago, UTC)
 *   OUT                     report file to append to (default search-console-report.md)
 *
 * A failed API call is reported in the section, never fails the workflow, so the Google part
 * still gets posted.
 */
import { appendFileSync } from "node:fs";
import { change, defaultEnd, path, windows, type Window } from "./search-console.ts";

const API = "https://ssl.bing.com/webmaster/api.svc/json";

/** A Bing row: GetQueryStats / GetPageStats (Query = the query or the page URL) or GetRankAndTrafficStats. */
export interface BingRow { Date: string; Clicks: number; Impressions: number; Query?: string; AvgImpressionPosition?: number }
export interface BingTotal { clicks: number; impressions: number }
export interface BingItem extends BingTotal { key: string; position: number }

/** "/Date(1316156400000-0700)/" (or an ISO date) → milliseconds since the epoch. */
export function bingTime(d: string): number {
  const m = /\/Date\((-?\d+)/.exec(d);
  return m ? Number(m[1]) : Date.parse(d);
}

function inWindow(r: BingRow, w: Window): boolean {
  const t = bingTime(r.Date);
  return t >= Date.parse(w.start + "T00:00:00Z") && t < Date.parse(w.end + "T00:00:00Z") + 86_400_000;
}

export function total(rows: BingRow[], w: Window): BingTotal {
  return rows.filter((r) => inWindow(r, w)).reduce((s, r) => ({ clicks: s.clicks + r.Clicks, impressions: s.impressions + r.Impressions }), { clicks: 0, impressions: 0 });
}

/** Rows in the window summed per query (or page); position is the impression-weighted average. */
export function byKey(rows: BingRow[], w: Window, limit = 25): BingItem[] {
  const m = new Map<string, { clicks: number; impressions: number; posSum: number }>();
  for (const r of rows) {
    if (!r.Query || !inWindow(r, w)) continue;
    const e = m.get(r.Query) ?? { clicks: 0, impressions: 0, posSum: 0 };
    e.clicks += r.Clicks;
    e.impressions += r.Impressions;
    e.posSum += (r.AvgImpressionPosition ?? 0) * r.Impressions;
    m.set(r.Query, e);
  }
  return [...m]
    .map(([key, e]) => ({ key, clicks: e.clicks, impressions: e.impressions, position: e.impressions ? e.posSum / e.impressions : 0 }))
    .sort((a, b) => b.clicks - a.clicks || b.impressions - a.impressions)
    .slice(0, limit);
}

const cell = (s: string) => s.replace(/\|/g, "\\|").replace(/\s+/g, " ").trim();
const ctr = (c: number, i: number) => (i ? `${((c / i) * 100).toFixed(1)} %` : "–");

export function formatBing(d: { site: string; current: Window; previous: Window; traffic: BingRow[]; queries: BingRow[]; pages: BingRow[] }): string {
  const c = total(d.traffic, d.current);
  const p = total(d.traffic, d.previous);
  const out = ["## Bing Webmaster Tools", "", `\`${d.site}\`, same windows as above.`, ""];
  out.push("| | Last 28 days | 28 days before | Change |", "|---|---:|---:|---:|");
  out.push(`| Clicks | ${c.clicks} | ${p.clicks} | ${change(c.clicks, p.clicks)} |`);
  out.push(`| Impressions | ${c.impressions} | ${p.impressions} | ${change(c.impressions, p.impressions)} |`);
  out.push(`| CTR | ${ctr(c.clicks, c.impressions)} | ${ctr(p.clicks, p.impressions)} | |`, "");
  const table = (title: string, first: string, items: BingItem[], fmt: (k: string) => string) => {
    out.push(`### Bing: ${title}`, "", `| ${first} | Clicks | Impr. | CTR | Pos. |`, "|---|---:|---:|---:|---:|");
    for (const r of items) out.push(`| ${cell(fmt(r.key))} | ${r.clicks} | ${r.impressions} | ${ctr(r.clicks, r.impressions)} | ${r.position.toFixed(1)} |`);
    if (!items.length) out.push("| (none) | | | | |");
    out.push("");
  };
  table("top queries", "Query", byKey(d.queries, d.current), (k) => k);
  table("top pages", "Page", byKey(d.pages, d.current), path);
  return out.join("\n");
}

async function main() {
  const key = process.env.BING_WEBMASTER_API_KEY;
  if (!key) throw new Error("BING_WEBMASTER_API_KEY is not set");
  const site = process.env.BING_SITE || "https://speakerboxgenius.com/";
  const out = process.env.OUT || "search-console-report.md";
  const { current, previous } = windows(process.env.GSC_END_DATE || defaultEnd());
  const get = async (method: string): Promise<BingRow[]> => {
    const res = await fetch(`${API}/${method}?siteUrl=${encodeURIComponent(site)}&apikey=${encodeURIComponent(key)}`);
    if (!res.ok) throw new Error(`${method} failed: HTTP ${res.status}`);
    return ((await res.json()) as { d?: BingRow[] }).d ?? [];
  };
  let md: string;
  try {
    const [traffic, queries, pages] = await Promise.all([get("GetRankAndTrafficStats"), get("GetQueryStats"), get("GetPageStats")]);
    md = formatBing({ site, current, previous, traffic, queries, pages });
  } catch (e) {
    md = `## Bing Webmaster Tools\n\nCouldn't read Bing: ${e instanceof Error ? e.message : e}\n`;
    console.log(`::warning::${md.split("\n")[2]}`);
  }
  appendFileSync(out, `\n${md}\n`);
  console.log(md);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
}
