/**
 * The sitemaps: a sitemap index (sitemap.xml) pointing at one sitemap per kind of page, so
 * Search Console reports indexing for the guides, the driver pages and the other pages apart.
 *
 * Each URL gets a <lastmod>: the date its content last changed. A page's content is what's
 * inside <main> (the header, menu and footer are the same on every page), with any part marked
 * `<!--volatile-->…<!--/volatile-->` left out (the validation page's build date and commit).
 * The hash and date of every URL are kept between deploys in a small JSON file (the deploy
 * workflow keeps it with actions/cache, like the share cards). A page whose hash hasn't changed
 * keeps its date; a new or changed page gets the build date. With no saved state (the first
 * build, or the cache expired) every page gets the build date.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

export type SitemapGroup = "pages" | "guides" | "drivers";
export const SITEMAP_GROUPS: SitemapGroup[] = ["pages", "guides", "drivers"];

export interface SitemapEntry {
  path: string;
  group: SitemapGroup;
  lastmod: string;
}

type State = Record<string, { hash: string; lastmod: string }>;

/** A hash of a page's content: inside <main> if it has one, without the volatile parts. */
export function contentHash(html: string): string {
  const main = /<main>([\s\S]*)<\/main>/.exec(html)?.[1] ?? html;
  const stable = main.replace(/<!--volatile-->[\s\S]*?<!--\/volatile-->/g, "");
  return createHash("sha256").update(stable).digest("hex").slice(0, 32);
}

export class LastmodStore {
  private readonly file: string;
  private readonly today: string;
  private readonly old: State;
  private readonly next: State = {};
  changed = 0;

  constructor(file: string, today: string) {
    this.file = file;
    this.today = today;
    let old: State = {};
    try {
      if (existsSync(file)) old = JSON.parse(readFileSync(file, "utf8")) as State;
    } catch {
      old = {};
    }
    this.old = old;
  }

  /** The page's lastmod: its saved date if its content is unchanged, else today. */
  date(path: string, html: string): string {
    const hash = contentHash(html);
    const prev = this.old[path];
    const same = prev !== undefined && prev.hash === hash;
    const lastmod = same ? prev.lastmod : this.today;
    if (!same) this.changed++;
    this.next[path] = { hash, lastmod };
    return lastmod;
  }

  /** Save this build's pages only, so removed pages drop out. */
  save(): void {
    mkdirSync(dirname(this.file), { recursive: true });
    writeFileSync(this.file, `${JSON.stringify(this.next, null, 1)}\n`);
  }
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** The files to write: sitemap.xml (the index) and sitemap-<group>.xml for each group with pages. */
export function sitemapFiles(site: string, entries: SitemapEntry[]): Record<string, string> {
  const files: Record<string, string> = {};
  const index: string[] = [];
  for (const group of SITEMAP_GROUPS) {
    const list = entries.filter((e) => e.group === group);
    if (!list.length) continue;
    const name = `sitemap-${group}.xml`;
    files[name] =
      `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
      list.map((e) => `  <url><loc>${esc(site + e.path)}</loc><lastmod>${e.lastmod}</lastmod></url>`).join("\n") +
      `\n</urlset>\n`;
    const newest = list.reduce((m, e) => (e.lastmod > m ? e.lastmod : m), "");
    index.push(`  <sitemap><loc>${site}/${name}</loc><lastmod>${newest}</lastmod></sitemap>`);
  }
  files["sitemap.xml"] = `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${index.join("\n")}\n</sitemapindex>\n`;
  return files;
}
