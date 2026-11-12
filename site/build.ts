/**
 * Builds the guide pages: plain HTML pages Google can read, next to the app.
 *
 *   node --experimental-strip-types site/build.ts [outDir]   (default packages/web/dist)
 *
 * Each `site/pages/*.md` file becomes `<outDir>/<path>/index.html`. A page starts with a
 * front-matter block (`---` lines) giving its `title`, `description` and `path`, and
 * optionally `image` (its share card, from site/img) and `order` (its place in lists).
 * The body is Markdown (the subset in `markdown` below); the paragraph under the # title is
 * shown as the page's introduction. Extras:
 *
 *   {{link:pr-example}}               the share link of an example design (site/examples.ts)
 *   [[Open this design|pr-example]]   a button opening that example in the app
 *   ![caption](chart:pr-example/excursion)   the app's own chart of that example, drawn at build
 *                                     (site/guideCharts.ts: response, spl, excursion, maxspl)
 *   {{num:pr-example/1/f3}}           a number from that example, worked out at build
 *   {{color:pr-example/1}}            a design's curve colour in words (site/liveNumbers.ts)
 *
 * Also writes a /guides/ index, the /validation/ page (site/validation.ts, from
 * docs/validation/results.json), the sitemaps (site/sitemap.ts) and robots.txt, and copies
 * site/img to /guides/img/.
 */
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";
import { exampleLinks } from "./examples.ts";
import { readReport, spiceNetlistHref, validationContent, VALIDATION_STYLE } from "./validation.ts";
import { SHOWCASE } from "../packages/engine/validation/spice-report.ts";
import { cirPath } from "../packages/engine/validation/spice/fixtures.ts";
import { validationLinks } from "./validationLinks.ts";
import { CHART_STYLE, chart } from "./chart.ts";
import { fillLive } from "./liveNumbers.ts";
import { guideCharts } from "./guideCharts.ts";
import { cardSvg, findChrome, Rasterizer } from "./og.ts";
import { CardCache, cardSalt } from "./cardCache.ts";
import { CALC_STYLE, fillCalc, portExampleValues, portForm, prExampleValues, prForm, viteScript } from "./calculators.ts";
import { LastmodStore, sitemapFiles, type SitemapEntry, type SitemapGroup } from "./sitemap.ts";
import { cardData, brandContent, brandPath, designDriver, driverContent, driverPath, driversIndexContent, DRIVERS_STYLE, loadDb, prCandidate, relatedDrivers, shareLink, type DriverPage, type PageLd } from "./drivers.ts";

export const SITE = "https://speakerboxgenius.com";
const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = "https://github.com/daliusiv/speaker-box-genius";
/** Visit counts (no cookies; see site/privacy.md). The app's index.html has the same tag. */
export const GOATCOUNTER = '<script data-goatcounter="https://speakerboxgenius.goatcounter.com/count" async src="https://gc.zgo.at/count.js"></script>';

export interface Page {
  title: string;
  description: string;
  path: string;
  image?: string;
  order: number;
  /** Which section of the guides index it's listed in (an id from GUIDE_GROUPS). */
  group?: string;
  body: string;
}

/** The guides index's sections, in order. Every guide names one in its front matter (`group:`). */
export const GUIDE_GROUPS = [
  { id: "start", title: "Start here", intro: "Pick a driver, choose a box type and learn the parameters that decide it." },
  { id: "switching", title: "Switching from WinISD or Hornresp", intro: "What carries over, what's different, and how to bring your files across." },
  { id: "ported", title: "Ported and passive radiator boxes", intro: "Port size and noise, tuning, passive radiators and protecting the driver below tuning." },
  { id: "sealed", title: "Sealed boxes, EQ and isobaric", intro: "Choosing Qtc, getting deep bass from a small box with EQ, and isobaric pairs." },
  { id: "lines", title: "Transmission lines and horns", intro: "Line types, length, stuffing and mass-loaded towers." },
  { id: "measuring", title: "Measuring and fine-tuning", intro: "When a built box doesn't match the simulation: losses, stuffing and measurements." },
] as const;

/** Splits a page file into its front matter and Markdown body. */
export function parsePage(text: string, file = "page"): Page {
  const m = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(text.replace(/\r\n/g, "\n"));
  if (!m) throw new Error(`${file}: missing the --- front matter block`);
  const meta: Record<string, string> = {};
  for (const line of m[1]!.split("\n")) {
    const kv = /^(\w+):\s*(.*)$/.exec(line);
    if (kv) meta[kv[1]!] = kv[2]!.trim().replace(/^"(.*)"$/, "$1");
  }
  for (const k of ["title", "description", "path"]) if (!meta[k]) throw new Error(`${file}: front matter needs "${k}"`);
  const path = `/${meta.path!.replace(/^\/+|\/+$/g, "")}/`;
  if (meta.group && !GUIDE_GROUPS.some((g) => g.id === meta.group)) throw new Error(`${file}: unknown group "${meta.group}" (one of ${GUIDE_GROUPS.map((g) => g.id).join(", ")})`);
  return { title: meta.title!, description: meta.description!, path, image: meta.image, order: Number(meta.order ?? 99), group: meta.group, body: m[2]! };
}

export const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Inline Markdown: code, images, links, bold, italics. */
function inline(s: string): string {
  const codes: string[] = [];
  let out = escapeHtml(s).replace(/`([^`]+)`/g, (_, c: string) => `\u0000${codes.push(c) - 1}\u0000`);
  out = out
    // Images live in site/img, served from /guides/img/ whatever page they're on.
    .replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (_, alt: string, src: string) => `<img src="${src.replace(/^img\//, "/guides/img/")}" alt="${alt}" loading="lazy">`)
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, text: string, href: string) => {
      const external = /^https?:/.test(href) && !href.startsWith(SITE);
      return `<a href="${href}"${external ? ' rel="noopener"' : ""}>${text}</a>`;
    })
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[^*\w])\*([^*\s][^*]*)\*(?!\w)/g, "$1<em>$2</em>");
  return out.replace(/\u0000(\d+)\u0000/g, (_, i: string) => `<code>${codes[Number(i)]}</code>`);
}

/**
 * Block Markdown: headings (#–###), paragraphs, - and 1. lists (nested by indenting), > notes, | tables |,
 * ``` code blocks, and button lines ([[Label|example]]), already resolved to links.
 */
export function markdown(md: string, charts?: (src: string) => string): string {
  const lines = md.replace(/\r\n/g, "\n").split("\n");
  const out: string[] = [];
  let i = 0;
  const isBlockStart = (l: string) => /^(#{1,3} |[-*] |\d+\. |> |\||```|\[\[)/.test(l);
  while (i < lines.length) {
    const line = lines[i]!;
    if (line.trim() === "") {
      i++;
      continue;
    }
    if (line.startsWith("```")) {
      const code: string[] = [];
      for (i++; i < lines.length && !lines[i]!.startsWith("```"); i++) code.push(lines[i]!);
      i++;
      out.push(`<pre><code>${escapeHtml(code.join("\n"))}</code></pre>`);
      continue;
    }
    const h = /^(#{1,3}) (.*)$/.exec(line);
    if (h) {
      const level = h[1]!.length;
      const id = h[2]!.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
      out.push(`<h${level}${level > 1 ? ` id="${id}"` : ""}>${inline(h[2]!)}</h${level}>`);
      i++;
      continue;
    }
    // A line of one or more [[Label|link]] buttons.
    if (/^(\[\[[^|\]]+\|[^\]]+\]\]\s*)+$/.test(line.trim())) {
      const buttons = [...line.matchAll(/\[\[([^|\]]+)\|([^\]]+)\]\]/g)].map(
        (b) => `<a class="button" href="${escapeHtml(b[2]!)}">${inline(b[1]!)} →</a>`,
      );
      out.push(`<p class="cta">${buttons.join(" ")}</p>`);
      i++;
      continue;
    }
    if (/^[-*] /.test(line) || /^\d+\. /.test(line)) {
      const ordered = /^\d+\. /.test(line);
      const items: string[] = [];
      while (i < lines.length && (ordered ? /^\d+\. /.test(lines[i]!) : /^[-*] /.test(lines[i]!))) {
        let item = lines[i]!.replace(/^([-*]|\d+\.) /, "");
        // Continuation lines (indented) belong to the item; an indented list starts a nested
        // list, which takes every indented line after it.
        const nested: string[] = [];
        for (i++; i < lines.length && /^ {2,}\S/.test(lines[i]!); i++) {
          if (nested.length === 0 && !/^ {2,}([-*]|\d+\.) /.test(lines[i]!)) item += " " + lines[i]!.trim();
          else nested.push(lines[i]!);
        }
        const indent = nested.length ? /^ */.exec(nested[0]!)![0].length : 0;
        const sub = nested.length ? markdown(nested.map((l) => l.slice(Math.min(indent, /^ */.exec(l)![0].length))).join("\n"), charts) : "";
        items.push(`<li>${inline(item)}${sub}</li>`);
      }
      out.push(ordered ? `<ol>${items.join("")}</ol>` : `<ul>${items.join("")}</ul>`);
      continue;
    }
    if (line.startsWith("> ")) {
      const quote: string[] = [];
      for (; i < lines.length && lines[i]!.startsWith(">"); i++) quote.push(lines[i]!.replace(/^> ?/, ""));
      out.push(`<aside class="note">${markdown(quote.join("\n"))}</aside>`);
      continue;
    }
    if (line.startsWith("|")) {
      const rows: string[][] = [];
      for (; i < lines.length && lines[i]!.startsWith("|"); i++) {
        const cells = lines[i]!.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
        if (cells.every((c) => /^:?-+:?$/.test(c))) continue; // the --- row under the header
        rows.push(cells);
      }
      const [head, ...body] = rows;
      out.push(
        `<div class="table"><table><thead><tr>${head!.map((c) => `<th>${inline(c)}</th>`).join("")}</tr></thead>` +
          `<tbody>${body.map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`,
      );
      continue;
    }
    const para: string[] = [];
    for (; i < lines.length && lines[i]!.trim() !== "" && !(para.length > 0 && isBlockStart(lines[i]!)); i++) para.push(lines[i]!.trim());
    const text = para.join(" ");
    // A paragraph that is only an image becomes a figure, with its alt text as the caption.
    const img = /^!\[([^\]]+)\]\(([^)\s]+)\)$/.exec(text);
    // ![caption](chart:example/kind): the app's chart, drawn at build (site/guideCharts.ts).
    if (img && img[2]!.startsWith("chart:")) {
      if (!charts) throw new Error(`${img[2]}: charts are only drawn in guide pages`);
      out.push(`<figure class="guide-chart">${charts(img[2]!)}<figcaption>${inline(img[1]!)}</figcaption></figure>`);
      continue;
    }
    out.push(img ? `<figure>${inline(text)}<figcaption>${inline(img[1]!)}</figcaption></figure>` : `<p>${inline(text)}</p>`);
  }
  // The paragraph right under the page title is its introduction.
  if (out[0]?.startsWith("<h1>") && out[1]?.startsWith("<p>")) out[1] = out[1].replace("<p>", '<p class="lede">');
  return out.join("\n");
}

/** Replaces {{link:name}} and [[Label|name]] references with the examples' share links. */
export function resolveExamples(body: string, links: Record<string, string>, file = "page"): string {
  const get = (name: string) => {
    const url = links[name.trim()];
    if (!url) throw new Error(`${file}: no example called "${name}" (see site/examples.ts)`);
    return url;
  };
  return body.replace(/\{\{link:([\w-]+)\}\}/g, (_, n: string) => get(n)).replace(/\[\[([^|\]]+)\|([\w-]+)\]\]/g, (_, label: string, n: string) => `[[${label}|${get(n)}]]`);
}

const STYLE = `
:root{color-scheme:dark;--bg:#11141a;--fg:#e6e9ef;--muted:#8b93a3;--accent:#4ed7e9;--draw:#fb923c;--card:#1a1e26;--border:#282d37}
*{box-sizing:border-box}
[hidden]{display:none!important}
html{background:var(--bg);color:var(--fg)}
body{margin:0;font:17px/1.65 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
a{color:var(--accent)}
.top{display:flex;align-items:center;justify-content:space-between;gap:.8rem;max-width:46rem;margin:0 auto;padding:1rem 1.1rem}
.brand{display:flex;align-items:center;gap:.6rem;color:var(--fg);font-weight:700;text-decoration:none}
.brand img{width:2rem;height:2rem;border-radius:.45rem}
.nav{display:flex;align-items:center;gap:1rem}
.nav a:not(.button){color:var(--muted);text-decoration:none;font-weight:600}
.nav a[aria-current]{color:var(--fg)}
@media (max-width:520px){.brand span{display:none}.nav{gap:.8rem}.nav .button{padding:.45rem .8rem}}
@media (max-width:400px){.top{padding:.9rem .8rem;gap:.5rem}.nav{gap:.65rem;font-size:.95rem}.nav .button{padding:.4rem .65rem}}
@media (max-width:440px){.nav .opt{display:none}}
@media (max-width:359px){.nav .wide:not([aria-current]){display:none}}
@media (max-width:520px){.nav .wider{display:none}}
.button{display:inline-block;padding:.55rem 1rem;border-radius:.6rem;background:var(--accent);color:#0b1220;font-weight:650;text-decoration:none;white-space:nowrap}
main{max-width:46rem;margin:0 auto;padding:.5rem 1.1rem 3rem}
h1{font-size:2.1rem;line-height:1.15;margin:1rem 0 .6rem;letter-spacing:-.01em}
h2{font-size:1.4rem;line-height:1.25;margin:2.2rem 0 .6rem}
h3{font-size:1.1rem;margin:1.6rem 0 .4rem}
.lede{color:var(--muted);font-size:1.12rem;margin-top:0}
p,li{color:#d3d8e2}
li{margin:.25rem 0}
code{padding:.05rem .3rem;border-radius:.3rem;background:var(--card);font-size:.92em}
pre{overflow-x:auto;padding:.8rem;border-radius:.6rem;background:var(--card)}
pre code{padding:0;background:none}
figure{margin:1.5rem 0}
figure img{display:block;width:100%;height:auto;border:1px solid var(--border);border-radius:.7rem}
main img{max-width:100%;height:auto}
figcaption{margin-top:.4rem;color:var(--muted);font-size:.9rem}
.note{margin:1.4rem 0;padding:.2rem 1rem;border-left:3px solid var(--draw);border-radius:.4rem;background:var(--card)}
.table{overflow-x:auto;margin:1.2rem 0}
table{width:100%;border-collapse:collapse;font-size:.95rem}
th,td{padding:.45rem .6rem;border-bottom:1px solid var(--border);text-align:left;vertical-align:top}
th{color:var(--muted);font-weight:600}
.cta{display:flex;flex-wrap:wrap;gap:.6rem;margin:1.5rem 0}
.cta .button{white-space:normal}
.cards{display:grid;gap:1rem;padding:0;list-style:none;grid-template-columns:repeat(auto-fill,minmax(min(19rem,100%),1fr))}
.cards li{position:relative;margin:0;padding:1rem 1.1rem;border:1px solid var(--border);border-radius:.8rem;background:var(--card);transition:border-color .15s,background-color .15s}
.cards li:hover,.cards li:focus-within{border-color:var(--accent)}
.cards a{font-weight:650;font-size:1.1rem;text-decoration:none}
.cards a::after{content:"";position:absolute;inset:0;border-radius:.8rem}
.cards a:focus-visible{outline:none}
.cards li:has(a:focus-visible){outline:2px solid var(--accent);outline-offset:2px}
.cards p{margin:.3rem 0 0;color:var(--muted)}
.cards.small{grid-template-columns:repeat(auto-fill,minmax(min(15rem,100%),1fr));gap:.8rem}
.cards.small a{font-size:1rem}
.group-intro{color:var(--muted);margin:-.2rem 0 1rem}
.find{width:100%;margin:.4rem 0 .6rem;padding:.65rem .9rem;border:1px solid var(--border);border-radius:.6rem;background:var(--card);color:var(--fg);font:inherit}
.find:focus{outline:2px solid var(--accent);outline-offset:1px}
.related{margin-top:3rem}
footer{max-width:46rem;margin:0 auto;padding:1.5rem 1.1rem 3rem;border-top:1px solid var(--border);color:var(--muted);font-size:.9rem}
footer a{color:var(--muted)}
`;

/** Speaker Box Genius as a schema.org Organization: every page's author and publisher. */
const ORG = { "@type": "Organization", name: "Speaker Box Genius", url: SITE };

/** JSON for a <script> tag: "<" escaped so a name can never close the tag. */
const jsonLd = (x: unknown) => JSON.stringify(x).replace(/</g, "\\u003c");

/** A whole HTML page around some content. */
/** The top bar's sections; the one a page belongs to is marked as current. */
const NAV = [
  { href: "/drivers/", label: "Drivers", match: (p: string) => p.startsWith("/drivers/") },
  { href: "/guides/", label: "Guides", match: (p: string) => p.startsWith("/guides/") || p.endsWith("-alternative/") },
  // Left out of the top bar on narrow phones (it's in the footer).
  // Left out below 520 px, even on its own page (it's in the footer and linked from the port guides).
  { href: "/calculators/port-length/", label: "Port calculator", match: (p: string) => p.startsWith("/calculators/port-length/"), cls: "wider" },
  { href: "/validation/", label: "Validation", match: (p: string) => p === "/validation/", wide: true },
];

export function layout(o: { title: string; description: string; path: string; image?: string; imagePath?: string; content: string; guides: Page[]; style?: string; ld?: PageLd; scripts?: string[] }): string {
  const url = `${SITE}${o.path}`;
  const image = `${SITE}${o.imagePath ?? (o.image ? `/guides/img/${o.image}` : "/og-image.png")}`;
  const ld = {
    "@context": "https://schema.org",
    "@type": o.ld?.list ? "CollectionPage" : "Article",
    headline: o.title,
    description: o.description,
    url,
    image,
    // The site as author and publisher: no personal name in every page's data.
    author: ORG,
    publisher: ORG,
    ...(o.ld?.about ? { about: o.ld.about } : {}),
    // A list page (the guides index): its entries as an ItemList.
    ...(o.ld?.list
      ? { mainEntity: { "@type": "ItemList", itemListElement: o.ld.list.map((x, i) => ({ "@type": "ListItem", position: i + 1, name: x.name, url: `${SITE}${x.path}` })) } }
      : {}),
  };
  // Breadcrumbs (Google shows them in place of the URL): the last one is this page.
  const crumbs = o.ld?.crumbs?.length
    ? {
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        itemListElement: o.ld.crumbs.map((c, i) => ({ "@type": "ListItem", position: i + 1, name: c.name, item: `${SITE}${c.path ?? o.path}` })),
      }
    : null;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(o.title)} · Speaker Box Genius</title>
<meta name="description" content="${escapeHtml(o.description)}">
<link rel="canonical" href="${url}">
<meta property="og:type" content="article">
<meta property="og:site_name" content="Speaker Box Genius">
<meta property="og:title" content="${escapeHtml(o.title)}">
<meta property="og:description" content="${escapeHtml(o.description)}">
<meta property="og:url" content="${url}">
<meta property="og:image" content="${image}">
<meta name="twitter:card" content="summary_large_image">
<meta name="theme-color" content="#1a1e26">
<meta name="color-scheme" content="dark">
<link rel="icon" type="image/png" sizes="32x32" href="/icons/favicon-32.png">
<link rel="apple-touch-icon" href="/icons/apple-touch-icon.png">
<script type="application/ld+json">${jsonLd(ld)}</script>${crumbs ? `\n<script type="application/ld+json">${jsonLd(crumbs)}</script>` : ""}
<style>${STYLE}${o.style ?? ""}</style>
${GOATCOUNTER}
</head>
<body>
<header class="top">
<a class="brand" href="/"><img src="/icons/icon-192.png" alt=""><span>Speaker Box Genius</span></a>
<nav class="nav">${NAV.map((n) => `<a href="${n.href}"${"wide" in n ? ' class="wide"' : "cls" in n ? ` class="${n.cls}"` : ""}${n.match(o.path) ? ' aria-current="page"' : ""}>${n.label}</a>`).join("")}<a class="button" href="/">Open<span class="opt"> the</span> app</a></nav>
</header>
<main>
${o.content}
</main>
<footer>
<p><a href="/">Speaker Box Genius</a>: a free, browser-based loudspeaker enclosure simulator · <a href="/drivers/">Drivers</a> · <a href="/guides/">Guides</a> · <a href="/calculators/port-length/">Port length calculator</a> · <a href="/calculators/passive-radiator/">Passive radiator calculator</a> · <a href="/validation/">Validation</a> · <a href="/about/">About</a> · <a href="/changelog/">Changelog</a> · <a href="/privacy/">Privacy</a> · <a href="${REPO}">GitHub</a> · <a href="${REPO}/blob/main/docs/data-sources.md">Driver data credits</a></p>
</footer>${(o.scripts ?? []).map((src) => `\n<script type="module" src="${src}"></script>`).join("")}
</body>
</html>
`;
}

/** /drivers/, one index per brand, and one page per driver with suggested boxes (site/drivers.ts). */
async function buildDriverPages(write: (path: string, html: string) => void, guides: Page[], outDir: string): Promise<void> {
  const db = loadDb();
  const prs = db.passiveRadiators.map(prCandidate);
  const pages = db.drivers.map((e) => designDriver(e, prs)).filter((p): p is DriverPage => p !== null);
  const style = CHART_STYLE + DRIVERS_STYLE;
  // Share cards: reused from the cache when unchanged (cardCache.ts); Chrome starts only when one has to be drawn.
  const cardsOn = process.env.SBG_CARDS !== "0";
  const cache = cardsOn ? new CardCache(process.env.SBG_CARD_CACHE ?? join(HERE, "..", ".cache", "cards"), cardSalt(readFileSync(join(HERE, "og.ts"), "utf8"))) : null;
  let cards: Rasterizer | null | undefined;
  let drawn = 0;
  const raster = async () => (cards === undefined ? (cards = await startCards()) : cards);
  try {
    for (const p of pages) {
      const page = driverContent(p, { all: await shareLink(SITE, p.state), related: relatedDrivers(p, pages) }, chart);
      let imagePath: string | undefined;
      if (cache) {
        // The page's share card, next to it; pages without one keep the site's card.
        const svg = cardSvg(cardData(p));
        let jpg: Uint8Array | null = cache.get(svg);
        if (!jpg) {
          const r = await raster();
          if (r) {
            jpg = await r.image(svg);
            cache.put(svg, jpg);
            drawn++;
          }
        }
        if (jpg) {
          imagePath = `${driverPath(p.id)}card.jpg`;
          mkdirSync(join(outDir, driverPath(p.id)), { recursive: true });
          writeFileSync(join(outDir, imagePath), jpg);
        }
      }
      write(driverPath(p.id), layout({ ...page, path: driverPath(p.id), imagePath, content: page.content, guides, style }));
    }
  } finally {
    await cards?.close();
  }
  if (cache) console.log(`Share cards: ${cache.hits} reused, ${drawn} drawn${cache.misses > drawn ? `, ${cache.misses - drawn} left without one (no Chrome)` : ""}; ${cache.prune()} old ones removed from the cache.`);
  const byBrand = [...new Set(pages.map((p) => p.brandSlug))]
    .map((slug) => ({ slug, name: db.brands.get(slug)?.name ?? pages.find((p) => p.brandSlug === slug)!.brand, pages: pages.filter((p) => p.brandSlug === slug) }))
    .sort((a, b) => a.name.localeCompare(b.name));
  for (const b of byBrand) {
    write(brandPath(b.slug), layout({ ld: { crumbs: [{ name: "Drivers", path: "/drivers/" }, { name: b.name }] }, title: `${b.name} drivers: box sizes and T/S parameters`, description: `Suggested sealed, ported and passive radiator boxes for ${b.pages.length} ${b.name} drivers.`, path: brandPath(b.slug), content: brandContent(b.name, b.pages), guides, style }));
  }
  write("/drivers/", layout({ title: "Driver box designs", description: `Suggested sealed, ported and passive radiator boxes for ${pages.length} drivers, with charts and live designs to open and change.`, path: "/drivers/", content: driversIndexContent(byBrand), guides, style }));
}

/**
 * Headless Chrome for the driver pages' share cards (site/og.ts), or null: when SBG_CARDS=0,
 * when there's no Chrome, or when it won't start (the pages then use the site's card).
 */
async function startCards(): Promise<Rasterizer | null> {
  const chrome = findChrome();
  if (!chrome) {
    console.warn("No Chrome found (set CHROME_PATH): driver pages use the site's share card.");
    return null;
  }
  try {
    return await Rasterizer.start(chrome);
  } catch (e) {
    console.warn(`Chrome didn't start (${(e as Error).message}): driver pages use the site's share card.`);
    return null;
  }
}

const card = (g: Page) => `<li><a href="${g.path}">${escapeHtml(g.title)}</a><p>${escapeHtml(g.description)}</p></li>`;

/**
 * The guides index: the guides in their sections (GUIDE_GROUPS), each sorted by `order`, with
 * a filter box. The box is hidden until its script runs, so without JavaScript the page is just
 * the sections.
 */
export function guidesIndex(guides: Page[]): string {
  const sections = GUIDE_GROUPS.map((grp) => {
    const list = guides.filter((g) => g.group === grp.id).sort((a, b) => a.order - b.order);
    if (!list.length) return "";
    return `<section class="group"><h2 id="${grp.id}">${escapeHtml(grp.title)}</h2>\n<p class="group-intro">${escapeHtml(grp.intro)}</p>\n<ul class="cards">${list.map(card).join("")}</ul></section>`;
  }).filter(Boolean);
  return [
    "<h1>Speaker box design guides</h1>",
    '<p class="lede">How to design speaker boxes, with live examples you can open and change in Speaker Box Genius. New to it? Start with the <a href="/guides/design-assistant/">design assistant</a> or <a href="/guides/sealed-vs-ported/">sealed, ported or passive radiator</a>.</p>',
    '<input class="find" type="search" placeholder="Search the guides" aria-label="Search the guides" hidden>',
    '<p class="none" hidden>No guide matches that. Try a shorter word.</p>',
    ...sections,
    `<script>${GUIDE_FILTER}</script>`,
  ].join("\n");
}

/** Filters the index's cards as you type: every word typed must start a word of a card's title or description. Empty sections hide. */
const GUIDE_FILTER = `(()=>{const f=document.querySelector(".find"),n=document.querySelector(".none");if(!f)return;f.hidden=false;f.addEventListener("input",()=>{const norm=t=>" "+t.toLowerCase().replace(/[^a-z0-9\\/]+/g," "),q=norm(f.value).split(" ").filter(Boolean);let any=false;for(const s of document.querySelectorAll(".group")){let shown=0;for(const li of s.querySelectorAll("li")){const t=norm(li.textContent),ok=q.every(w=>t.includes(" "+w));li.hidden=!ok;if(ok)shown++}s.hidden=!shown;if(shown)any=true}n.hidden=any})})();`;

/**
 * "Related guides" at the end of a guide: up to four from its own section (nearest `order`
 * first), topped up from "Start here" when the section is small.
 */
export function relatedGuides(page: Page, guides: Page[]): string {
  const others = guides.filter((g) => g.path !== page.path);
  const near = (a: Page, b: Page) => Math.abs(a.order - page.order) - Math.abs(b.order - page.order) || a.order - b.order;
  const same = others.filter((g) => page.group && g.group === page.group).sort(near);
  const start = others.filter((g) => g.group === "start" && !same.includes(g)).sort((a, b) => a.order - b.order);
  const pick = [...same, ...start].slice(0, 4);
  if (!pick.length) return "";
  return `\n<section class="related"><h2 id="related-guides">Related guides</h2>\n<ul class="cards small">${pick.map((g) => `<li><a href="${g.path}">${escapeHtml(g.title)}</a></li>`).join("")}</ul>\n<p><a href="/guides/">All guides →</a></p></section>`;
}

/** The commit being built: GitHub Actions' GITHUB_SHA, else git, else none. */
function buildCommit(): string | undefined {
  if (process.env.GITHUB_SHA) return process.env.GITHUB_SHA;
  try {
    return execSync("git rev-parse HEAD", { cwd: HERE, stdio: ["ignore", "pipe", "ignore"] }).toString().trim() || undefined;
  } catch {
    return undefined;
  }
}

export async function build(outDir: string): Promise<string[]> {
  const pagesDir = join(HERE, "pages");
  const files = readdirSync(pagesDir).filter((f) => f.endsWith(".md")).sort();
  const pages = files.map((f) => ({ file: f, page: parsePage(readFileSync(join(pagesDir, f), "utf8"), f) }));
  const guides = pages.map((p) => p.page).sort((a, b) => a.order - b.order);
  const links = await exampleLinks(SITE);
  const written: string[] = [];
  const today = process.env.SBG_BUILD_DATE ?? new Date().toISOString().slice(0, 10);
  const lastmods = new LastmodStore(process.env.SBG_LASTMOD_STATE ?? join(HERE, "..", ".cache", "sitemap", "lastmod.json"), today);
  const guidePaths = new Set(["/guides/", ...guides.map((g) => g.path)]);
  const groupOf = (path: string): SitemapGroup => (path.startsWith("/drivers/") ? "drivers" : guidePaths.has(path) ? "guides" : "pages");
  const entries: SitemapEntry[] = [];
  const write = (path: string, html: string) => {
    const dir = join(outDir, path);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "index.html"), html);
    written.push(path);
    entries.push({ path, group: groupOf(path), lastmod: lastmods.date(path, html) });
  };

  for (const { file, page } of pages) {
    const body = fillLive(resolveExamples(page.body, links, file), file);
    const charts = await guideCharts(body, file);
    const content = markdown(body, charts.draw) + relatedGuides(page, guides);
    write(page.path, layout({ ...page, content, guides, ...(charts.count ? { style: charts.style } : {}) }));
  }

  write(
    "/guides/",
    layout({
      title: "Speaker box design guides",
      description: "Free guides to designing sealed, ported, passive radiator and transmission line speaker boxes, each with live examples you can open and change.",
      path: "/guides/",
      content: guidesIndex(guides),
      guides,
      ld: { list: guides.map((g) => ({ name: g.title, path: g.path })) },
    }),
  );

  const report = readReport();
  write(
    "/validation/",
    layout({
      title: "Validation against WinISD, Hornresp and SPICE",
      description: "Every WinISD, Hornresp and circuit-simulator comparison Speaker Box Genius is tested against: the cases, how far apart the results are, and the known differences.",
      path: "/validation/",
      content: validationContent(report, { commit: buildCommit(), date: new Date(), links: await validationLinks(SITE, { winisd: report.winisd.cases, hornresp: report.hornresp.cases, boxes: report.hornresp.boxes.cases }) }),
      guides,
      style: CHART_STYLE + VALIDATION_STYLE,
    }),
  );
  // The netlists of the cases drawn on the page, to download.
  for (const { id } of SHOWCASE) {
    const dest = join(outDir, spiceNetlistHref(id));
    mkdirSync(dirname(dest), { recursive: true });
    copyFileSync(cirPath(id), dest);
  }

  write(
    "/about/",
    layout({
      title: "About",
      description: "A free speaker box simulator in your browser. What it is, who builds it, the licence in plain words (free for non-commercial use), and credits.",
      path: "/about/",
      content: markdown(readFileSync(join(HERE, "about.md"), "utf8")),
      guides,
    }),
  );

  write(
    "/changelog/",
    layout({
      title: "Changelog",
      description: "What's new in Speaker Box Genius: new features, fixes and driver data, by date.",
      path: "/changelog/",
      content: markdown(readFileSync(join(HERE, "..", "CHANGELOG.md"), "utf8")),
      guides,
    }),
  );

  write(
    "/privacy/",
    layout({
      title: "Privacy",
      description: "No accounts, no cookies: your designs stay in your browser and your links. What the visit counter sees.",
      path: "/privacy/",
      content: markdown(readFileSync(join(HERE, "privacy.md"), "utf8")),
      guides,
    }),
  );

  // Calculators (site/calculators.ts): the page text here, the live part from the app's build.
  {
    const script = viteScript(outDir, "src/calculators/portLength.ts");
    const md = fillCalc(readFileSync(join(HERE, "calculators", "port-length.md"), "utf8"), portExampleValues());
    write(
      "/calculators/port-length/",
      layout({
        title: "Port length calculator: round and slot ports, with air speed",
        description: "Work out a speaker port's length for any box and tuning, round or slot, with flares, end corrections and the port's own volume. Then check its air speed with your driver.",
        path: "/calculators/port-length/",
        content: `<h1>Port length calculator</h1>\n<p class="lede">The length of a round or slot port for your box and tuning, worked out with the simulator's own port model. Pick your driver to see whether the port will chuff.</p>\n${portForm()}\n${markdown(md)}`,
        guides,
        style: CALC_STYLE,
        ...(script ? { scripts: [script] } : {}),
      }),
    );
  }
  {
    const script = viteScript(outDir, "src/calculators/passiveRadiator.ts");
    const md = fillCalc(readFileSync(join(HERE, "calculators", "passive-radiator.md"), "utf8"), prExampleValues());
    write(
      "/calculators/passive-radiator/",
      layout({
        title: "Passive radiator calculator: added mass, tuning and PR travel",
        description: "Work out how much mass to add to a passive radiator for any box and tuning, from the PR database or your own values. Then check the PRs keep up with your driver.",
        path: "/calculators/passive-radiator/",
        content: `<h1>Passive radiator calculator</h1>\n<p class="lede">The added mass that tunes your box, worked out with the simulator's own PR model. Pick your driver to see whether the PRs run out of travel before the cone does.</p>\n${prForm()}\n${markdown(md)}`,
        guides,
        style: CALC_STYLE,
        ...(script ? { scripts: [script] } : {}),
      }),
    );
  }

  await buildDriverPages(write, guides, outDir);

  const imgDir = join(HERE, "img");
  if (existsSync(imgDir)) {
    mkdirSync(join(outDir, "guides/img"), { recursive: true });
    for (const f of readdirSync(imgDir)) copyFileSync(join(imgDir, f), join(outDir, "guides/img", f));
  }

  // The app's home page isn't built here: dated by the app's index.html when it's there (the deploy builds the app first).
  const appIndex = join(outDir, "index.html");
  entries.unshift({ path: "/", group: "pages", lastmod: existsSync(appIndex) ? lastmods.date("/", readFileSync(appIndex, "utf8")) : today });
  for (const [name, xml] of Object.entries(sitemapFiles(SITE, entries))) writeFileSync(join(outDir, name), xml);
  lastmods.save();
  console.log(`Sitemaps: ${entries.length} URLs, ${lastmods.changed} new or changed since the last saved build`);
  writeFileSync(join(outDir, "robots.txt"), `User-agent: *\nAllow: /\n\nSitemap: ${SITE}/sitemap.xml\n`);
  return written;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const out = process.argv[2] ?? join(HERE, "../packages/web/dist");
  build(out).then(
    (paths) => console.log(`Built ${paths.length} pages (${paths.filter((p) => p.startsWith("/drivers/")).length} driver pages)`),
    (e) => {
      console.error(e);
      process.exit(1);
    },
  );
}
