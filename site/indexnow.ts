/**
 * IndexNow: tells Bing (and the other engines that share IndexNow) which pages a deploy added or
 * changed, so new driver pages and updated guides are crawled within hours instead of days.
 *
 * The list comes from the sitemap state (site/sitemap.ts): a page is sent when it's new or its
 * content hash changed since the last deploy. With no previous state nothing is sent, so a lost
 * cache never pings every page at once.
 *
 *   node site/indexnow.ts diff <previous-state.json> <new-state.json> <out.txt>
 *   node site/indexnow.ts submit <urls.txt>
 *
 * The key is public by design: IndexNow checks it against /<key>.txt on the site
 * (packages/web/public), which proves the ping comes from the site's owner.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export const INDEXNOW_KEY = "37451479689f442f9ea11baa1bf9f27e";
export const SITE = "https://speakerboxgenius.com";
/** IndexNow takes up to 10,000 URLs per request. */
export const MAX_URLS = 10_000;

type State = Record<string, { hash: string; lastmod?: string }>;

function readState(file: string): State | undefined {
  if (!existsSync(file)) return undefined;
  try {
    return JSON.parse(readFileSync(file, "utf8")) as State;
  } catch {
    return undefined;
  }
}

/** Paths that are new in `next` or whose content hash changed. Removed pages aren't sent. */
export function changedPaths(prev: State, next: State): string[] {
  return Object.keys(next)
    .filter((p) => prev[p]?.hash !== next[p].hash)
    .sort();
}

export function payload(paths: string[], site = SITE, key = INDEXNOW_KEY) {
  return {
    host: new URL(site).host,
    key,
    keyLocation: `${site}/${key}.txt`,
    urlList: paths.slice(0, MAX_URLS).map((p) => site + p),
  };
}

async function submit(file: string): Promise<void> {
  const paths = existsSync(file) ? readFileSync(file, "utf8").split("\n").filter(Boolean) : [];
  if (paths.length === 0) {
    console.log("IndexNow: no new or changed pages");
    return;
  }
  const res = await fetch("https://api.indexnow.org/indexnow", {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify(payload(paths)),
  });
  // 200 and 202 both mean accepted. Anything else is reported but doesn't fail the deploy.
  console.log(`IndexNow: sent ${Math.min(paths.length, MAX_URLS)} URLs, HTTP ${res.status}`);
  if (res.status !== 200 && res.status !== 202) console.log(`::warning::IndexNow returned HTTP ${res.status}: ${await res.text()}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const [cmd, a, b, out] = process.argv.slice(2);
  if (cmd === "diff") {
    const prev = readState(a);
    const next = readState(b);
    const paths = prev && next ? changedPaths(prev, next) : [];
    writeFileSync(out, paths.join("\n") + (paths.length ? "\n" : ""));
    console.log(prev ? `IndexNow: ${paths.length} new or changed pages` : "IndexNow: no previous sitemap state, sending nothing");
  } else if (cmd === "submit") {
    await submit(a);
  } else {
    console.error("usage: indexnow.ts diff <prev> <next> <out> | submit <urls.txt>");
    process.exit(2);
  }
}
