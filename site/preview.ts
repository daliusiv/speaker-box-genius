/**
 * Turns a finished public build (packages/web/dist) into the private preview build that the dev
 * repo deploys to a Cloudflare Worker with static assets (.github/workflows/preview.yml). The build itself is identical;
 * only these differences are applied afterwards:
 *   - the GoatCounter tag is removed from every page, so preview visits aren't counted;
 *   - robots.txt disallows everything, and `_headers` sends `X-Robots-Tag: noindex` on every path;
 *   - CNAME is dropped (it names the public domain; Cloudflare doesn't use it).
 * It also checks Cloudflare's static-asset limits (20,000 files on the free plan, 25 MiB per file) and fails
 * before upload if the build is over them.
 *
 * Usage: node --experimental-strip-types site/preview.ts packages/web/dist
 */
import { readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { GOATCOUNTER } from "./build.ts";

export const MAX_FILES = 20_000;
export const MAX_FILE_BYTES = 25 * 1024 * 1024;

export interface PreviewReport {
  files: number;
  pagesStripped: number;
  largest: { path: string; bytes: number };
  problems: string[];
}

function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

export function makePreview(dist: string): PreviewReport {
  rmSync(join(dist, "CNAME"), { force: true });
  writeFileSync(join(dist, "robots.txt"), "User-agent: *\nDisallow: /\n");
  writeFileSync(join(dist, "_headers"), "/*\n  X-Robots-Tag: noindex, nofollow\n");

  const files = walk(dist);
  let pagesStripped = 0;
  let largest = { path: "", bytes: 0 };
  for (const f of files) {
    if (f.endsWith(".html")) {
      const html = readFileSync(f, "utf8");
      if (html.includes(GOATCOUNTER)) {
        writeFileSync(f, html.split(GOATCOUNTER).join(""));
        pagesStripped++;
      }
    }
    const bytes = statSync(f).size;
    if (bytes > largest.bytes) largest = { path: relative(dist, f), bytes };
  }

  const problems: string[] = [];
  if (files.length > MAX_FILES) problems.push(`${files.length} files, over Cloudflare's ${MAX_FILES}`);
  if (largest.bytes > MAX_FILE_BYTES) problems.push(`${largest.path} is ${(largest.bytes / 2 ** 20).toFixed(1)} MiB, over 25 MiB`);
  return { files: files.length, pagesStripped, largest, problems };
}

if (import.meta.main) {
  const dist = process.argv[2];
  if (!dist) throw new Error("usage: preview.ts <dist dir>");
  const r = makePreview(dist);
  console.log(`Preview build: ${r.files} files (limit ${MAX_FILES}), counter removed from ${r.pagesStripped} pages, largest ${r.largest.path} ${(r.largest.bytes / 2 ** 20).toFixed(1)} MiB`);
  if (r.problems.length) {
    for (const p of r.problems) console.error(`::error::${p}`);
    process.exit(1);
  }
}
