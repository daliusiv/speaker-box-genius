/**
 * Read a manufacturer's website into a folder, for writing and testing an importer.
 *
 *   node … fetch-pages.ts --targets targets.json --out pages/
 *
 * targets.json is an array of { name, start: [urls], follow: regex, pdf?: regex, depth?, max? }.
 * Links matching `follow` (same host) are read up to `depth` clicks from a start page;
 * links matching `pdf` are saved too (not followed). robots.txt is honoured, one request a
 * second per site. Writes <out>/<name>/NNNN.html (or .pdf) and <out>/<name>/index.json
 * ([{ url, file, status, from }]).
 */
import https from "node:https";
import http from "node:http";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { disallowed } from "./seas.ts";

const UA = "SpeakerBoxGenius-importer/1.0 (+https://github.com/daliusiv/speaker-box-genius; with the manufacturer's permission)";

export interface Target { name: string; start: string[]; follow: string; pdf?: string; depth?: number; max?: number }

function get(url: string, hops = 0): Promise<{ status: number; body: Buffer; url: string; type: string }> {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith("https:") ? https : http;
    const req = lib.get(url, { headers: { "User-Agent": UA, Accept: "text/html,application/pdf;q=0.9,*/*;q=0.8" }, timeout: 60000 }, (res) => {
      const loc = res.headers.location;
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && loc && hops < 5) {
        res.resume();
        resolve(get(new URL(loc, url).href, hops + 1));
        return;
      }
      const chunks: Buffer[] = [];
      res.on("data", (c: Buffer) => chunks.push(c));
      res.on("end", () => resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks), url, type: String(res.headers["content-type"] ?? "") }));
    });
    req.on("timeout", () => req.destroy(new Error(`timeout ${url}`)));
    req.on("error", reject);
  });
}

export function links(html: string, base: string): string[] {
  const out = new Set<string>();
  for (const m of html.matchAll(/href\s*=\s*["']([^"'#]+)["']/gi)) {
    try {
      out.add(new URL(m[1]!.replace(/&amp;/g, "&"), base).href);
    } catch {
      /* not a URL */
    }
  }
  return [...out];
}

/** Drop scripts, styles, inline SVG and comments: the importer only needs text, tables and links. */
export const slim = (html: string) =>
  html
    .replace(/<script\b[\s\S]*?<\/script>/gi, "")
    .replace(/<style\b[\s\S]*?<\/style>/gi, "")
    .replace(/<svg\b[\s\S]*?<\/svg>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n");

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function crawl(t: Target, out: string) {
  const dir = join(out, t.name);
  mkdirSync(dir, { recursive: true });
  const follow = new RegExp(t.follow, "i");
  const pdf = t.pdf ? new RegExp(t.pdf, "i") : undefined;
  const max = t.max ?? 400;
  const robotsCache = new Map<string, string[]>();
  const blocked = async (u: URL) => {
    if (!robotsCache.has(u.host)) {
      try {
        const r = await get(`${u.protocol}//${u.host}/robots.txt`);
        robotsCache.set(u.host, r.status === 200 ? disallowed(r.body.toString("utf8")) : []);
      } catch {
        robotsCache.set(u.host, []);
      }
    }
    return robotsCache.get(u.host)!.some((rule) => u.pathname.startsWith(rule));
  };
  const seen = new Set<string>();
  const queue: { url: string; depth: number; from?: string; isPdf?: boolean }[] = t.start.map((url) => ({ url, depth: 0 }));
  const index: { url: string; file?: string; status: number | string; from?: string }[] = [];
  let n = 0;
  while (queue.length && n < max) {
    const item = queue.shift()!;
    if (seen.has(item.url)) continue;
    seen.add(item.url);
    const u = new URL(item.url);
    if (await blocked(u)) {
      index.push({ url: item.url, status: "robots", from: item.from });
      continue;
    }
    await sleep(1000);
    try {
      const r = await get(item.url);
      const isPdf = item.isPdf || r.type.includes("pdf");
      const file = `${String(++n).padStart(4, "0")}.${isPdf ? "pdf" : "html"}`;
      writeFileSync(join(dir, file), isPdf ? r.body : slim(r.body.toString("utf8")));
      index.push({ url: r.url, file, status: r.status, ...(item.from ? { from: item.from } : {}) });
      if (isPdf || r.status !== 200) continue;
      const html = r.body.toString("utf8");
      for (const l of links(html, r.url)) {
        if (seen.has(l)) continue;
        if (pdf?.test(l)) queue.push({ url: l, depth: item.depth + 1, from: r.url, isPdf: true });
        else if (item.depth < (t.depth ?? 1) && follow.test(l)) queue.push({ url: l, depth: item.depth + 1, from: r.url });
      }
    } catch (e) {
      index.push({ url: item.url, status: String(e), from: item.from });
    }
    writeFileSync(join(dir, "index.json"), JSON.stringify(index, null, 1));
  }
  writeFileSync(join(dir, "index.json"), JSON.stringify(index, null, 1));
  console.log(`${t.name}: ${n} saved, ${queue.length} left in queue`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const arg = (k: string) => args[args.indexOf(k) + 1];
  const targets = JSON.parse(readFileSync(arg("--targets")!, "utf8")) as Target[];
  const out = arg("--out") ?? "pages";
  await Promise.all(targets.map((t) => crawl(t, out)));
}
