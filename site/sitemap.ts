/**
 * The sitemaps: a sitemap index (sitemap.xml) pointing at one sitemap per kind of page, so
 * Search Console reports indexing for the guides, the other pages and each driver brand apart.
 *
 * Each URL gets a <lastmod>: the date its content last changed. A page's content is what's
 * inside <main> (the header, menu and footer are the same on every page), with any part marked
 * `<!--volatile-->…<!--/volatile-->` left out (the validation page's build date and commit), and
 * with the fragment of every share link to the site root (`href=".../#z=…"`) emptied: it encodes
 * the app's state, so a change to the share format must not bump every page's date.
 * The hash and date of every URL are kept between deploys in a small JSON file (the deploy
 * workflow keeps it with actions/cache, like the share cards) and is also served from the site
 * (/sitemap-state.json), so a deploy with no cache can restore it from the live site. A page whose
 * hash hasn't changed keeps its date; a new or changed page gets the build date. With no saved
 * state anywhere (the first build) every page gets the build date.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

/** A sitemap's name: pages, guides, drivers (the driver lists) or drivers-<brand slug>. */
export type SitemapGroup = string;

const HEAD_GROUPS = ["pages", "guides", "drivers"];
const SAFE_GROUP = /^[a-z0-9-]+$/;

/** The groups, once each, in file order: pages, guides, drivers, the brands A-Z, then any others A-Z. */
export function sitemapGroupOrder(groups: Iterable<string>): string[] {
  const all = [...new Set(groups)];
  const rank = (g: string) => (HEAD_GROUPS.includes(g) ? HEAD_GROUPS.indexOf(g) : g.startsWith("drivers-") ? 3 : 4);
  return all.sort((a, b) => rank(a) - rank(b) || (a < b ? -1 : a > b ? 1 : 0));
}

export interface SitemapEntry {
  path: string;
  group: SitemapGroup;
  lastmod: string;
}

type State = Record<string, { hash: string; lastmod: string }>;

/**
 * A hash of a page's content: inside <main> if it has one, without the volatile parts. Share links
 * to the app (`/#…`, or `site` + `/#…`) count without their state, so a model update that only
 * re-encodes them doesn't bump every page; another site's fragments still count.
 */
export function contentHash(html: string, site = ""): string {
  const own = site.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const main = /<main>([\s\S]*)<\/main>/.exec(html)?.[1] ?? html;
  const stable = main
    .replace(/<!--volatile-->[\s\S]*?<!--\/volatile-->/g, "")
    .replace(new RegExp(`href="(${own})?/#[^"]*"`, "g"), 'href="$1/#"');
  return createHash("sha256").update(stable).digest("hex").slice(0, 32);
}

export class LastmodStore {
  private readonly file: string;
  private readonly today: string;
  private readonly old: State;
  private readonly next: State = {};
  changed = 0;

  private readonly site: string;

  constructor(file: string, today: string, site = "") {
    this.file = file;
    this.today = today;
    this.site = site;
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
    const hash = contentHash(html, this.site);
    const prev = this.old[path];
    const same = prev !== undefined && prev.hash === hash;
    const lastmod = same ? prev.lastmod : this.today;
    if (!same) this.changed++;
    this.next[path] = { hash, lastmod };
    return lastmod;
  }

  /** Save this build's pages only, so removed pages drop out; `copies` get the same JSON. */
  save(...copies: string[]): void {
    const json = `${JSON.stringify(this.next, null, 1)}\n`;
    for (const file of [this.file, ...copies]) {
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, json);
    }
  }
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** The files to write: sitemap.xml (the index) and sitemap-<group>.xml for each group with pages. */
export function sitemapFiles(site: string, entries: SitemapEntry[]): Record<string, string> {
  const files: Record<string, string> = {};
  const index: string[] = [];
  for (const group of sitemapGroupOrder(entries.map((e) => e.group))) {
    if (!SAFE_GROUP.test(group)) throw new Error(`Bad sitemap group name: ${JSON.stringify(group)}`);
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
