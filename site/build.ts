/**
 * Builds the guide pages: plain HTML pages Google can read, next to the app.
 *
 *   node --experimental-strip-types site/build.ts [outDir]   (default packages/web/dist)
 *
 * Each `site/pages/*.md` file becomes `<outDir>/<path>/index.html`. A page starts with a
 * front-matter block (`---` lines) giving its `title`, `description` and `path`, and
 * optionally `image` (its share card, from site/img) and `order` (its place in lists).
 * The body is Markdown (the subset in `markdown` below); the paragraph under the # title is
 * shown as the page's introduction. Two extras:
 *
 *   {{link:pr-example}}               the share link of an example design (site/examples.ts)
 *   [[Open this design|pr-example]]   a button opening that example in the app
 *
 * Also writes a /guides/ index, the /validation/ page (site/validation.ts, from
 * docs/validation/results.json), sitemap.xml and robots.txt, and copies site/img to /guides/img/.
 */
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";
import { exampleLinks } from "./examples.ts";
import { readReport, validationContent, VALIDATION_STYLE } from "./validation.ts";
import { validationLinks } from "./validationLinks.ts";
import { CHART_STYLE, chart } from "./chart.ts";
import { cardSvg, findChrome, Rasterizer } from "./og.ts";
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
  body: string;
}

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
  return { title: meta.title!, description: meta.description!, path, image: meta.image, order: Number(meta.order ?? 99), body: m[2]! };
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
 * Block Markdown: headings (#–###), paragraphs, - and 1. lists, > notes, | tables |,
 * ``` code blocks, and button lines ([[Label|example]]), already resolved to links.
 */
export function markdown(md: string): string {
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
        // Continuation lines (indented) belong to the item.
        for (i++; i < lines.length && /^ {2,}\S/.test(lines[i]!); i++) item += " " + lines[i]!.trim();
        items.push(`<li>${inline(item)}</li>`);
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
:root{color-scheme:dark;--bg:#090a0f;--fg:#e8ebf2;--muted:#8e96aa;--accent:#fb923c;--card:#12141c;--border:#222634}
*{box-sizing:border-box}
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
@media (max-width:440px){.nav .wide:not([aria-current]){display:none}.nav .opt{display:none}}
.button{display:inline-block;padding:.55rem 1rem;border-radius:.6rem;background:var(--accent);color:#12141c;font-weight:650;text-decoration:none;white-space:nowrap}
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
.note{margin:1.4rem 0;padding:.2rem 1rem;border-left:3px solid var(--accent);border-radius:.4rem;background:var(--card)}
.table{overflow-x:auto;margin:1.2rem 0}
table{width:100%;border-collapse:collapse;font-size:.95rem}
th,td{padding:.45rem .6rem;border-bottom:1px solid var(--border);text-align:left;vertical-align:top}
th{color:var(--muted);font-weight:600}
.cta{display:flex;flex-wrap:wrap;gap:.6rem;margin:1.5rem 0}
.cta .button{white-space:normal}
.cards{display:grid;gap:1rem;padding:0;list-style:none}
.cards li{padding:1rem 1.1rem;border:1px solid var(--border);border-radius:.8rem;background:var(--card)}
.cards a{font-weight:650;font-size:1.1rem;text-decoration:none}
.cards p{margin:.3rem 0 0;color:var(--muted)}
footer{max-width:46rem;margin:0 auto;padding:1.5rem 1.1rem 3rem;border-top:1px solid var(--border);color:var(--muted);font-size:.9rem}
footer a{color:var(--muted)}
`;

/** JSON for a <script> tag: "<" escaped so a name can never close the tag. */
const jsonLd = (x: unknown) => JSON.stringify(x).replace(/</g, "\\u003c");

/** A whole HTML page around some content. */
/** The top bar's sections; the one a page belongs to is marked as current. */
const NAV = [
  { href: "/drivers/", label: "Drivers", match: (p: string) => p.startsWith("/drivers/") },
  { href: "/guides/", label: "Guides", match: (p: string) => p.startsWith("/guides/") || p.endsWith("-alternative/") },
  // Left out of the top bar on narrow phones (it's in the footer).
  { href: "/validation/", label: "Validation", match: (p: string) => p === "/validation/", wide: true },
];

export function layout(o: { title: string; description: string; path: string; image?: string; imagePath?: string; content: string; guides: Page[]; style?: string; moreGuides?: boolean; ld?: PageLd }): string {
  const url = `${SITE}${o.path}`;
  const image = `${SITE}${o.imagePath ?? (o.image ? `/guides/img/${o.image}` : "/og-image.png")}`;
  const ld = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: o.title,
    description: o.description,
    url,
    image,
    author: { "@type": "Person", name: "Dalius Ivanovas" },
    publisher: { "@type": "Organization", name: "Speaker Box Genius", url: SITE },
    ...(o.ld?.about ? { about: o.ld.about } : {}),
  };
  // Breadcrumbs (Google shows them in place of the URL): the last one is this page.
  const crumbs = o.ld?.crumbs?.length
    ? {
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        itemListElement: o.ld.crumbs.map((c, i) => ({ "@type": "ListItem", position: i + 1, name: c.name, item: `${SITE}${c.path ?? o.path}` })),
      }
    : null;
  const others = o.moreGuides === false ? [] : o.guides.filter((g) => g.path !== o.path);
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
<meta name="theme-color" content="#12141c">
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
<nav class="nav">${NAV.map((n) => `<a href="${n.href}"${"wide" in n ? ' class="wide"' : ""}${n.match(o.path) ? ' aria-current="page"' : ""}>${n.label}</a>`).join("")}<a class="button" href="/">Open<span class="opt"> the</span> app</a></nav>
</header>
<main>
${o.content}
</main>
<footer>
${others.length ? `<p>More guides: ${others.map((g) => `<a href="${g.path}">${escapeHtml(g.title)}</a>`).join(" · ")}</p>` : ""}
<p><a href="/">Speaker Box Genius</a>: a free, browser-based loudspeaker enclosure simulator · <a href="/drivers/">Drivers</a> · <a href="/guides/">Guides</a> · <a href="/validation/">Validation</a> · <a href="/about/">About</a> · <a href="/privacy/">Privacy</a> · <a href="${REPO}">GitHub</a> · <a href="${REPO}/blob/main/docs/data-sources.md">Driver data credits</a></p>
</footer>
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
  const cards = await startCards();
  try {
    for (const p of pages) {
      const page = driverContent(p, { all: await shareLink(SITE, p.state), related: relatedDrivers(p, pages) }, chart);
      let imagePath: string | undefined;
      if (cards) {
        // The page's share card, next to it; pages without one keep the site's card.
        imagePath = `${driverPath(p.id)}card.jpg`;
        mkdirSync(join(outDir, driverPath(p.id)), { recursive: true });
        writeFileSync(join(outDir, imagePath), await cards.image(cardSvg(cardData(p))));
      }
      write(driverPath(p.id), layout({ ...page, path: driverPath(p.id), imagePath, content: page.content, guides, style, moreGuides: false }));
    }
  } finally {
    await cards?.close();
  }
  const byBrand = [...new Set(pages.map((p) => p.brandSlug))]
    .map((slug) => ({ slug, name: db.brands.get(slug)?.name ?? pages.find((p) => p.brandSlug === slug)!.brand, pages: pages.filter((p) => p.brandSlug === slug) }))
    .sort((a, b) => a.name.localeCompare(b.name));
  for (const b of byBrand) {
    write(brandPath(b.slug), layout({ ld: { crumbs: [{ name: "Drivers", path: "/drivers/" }, { name: b.name }] }, title: `${b.name} drivers: box sizes and T/S parameters`, description: `Suggested sealed, ported and passive radiator boxes for ${b.pages.length} ${b.name} drivers.`, path: brandPath(b.slug), content: brandContent(b.name, b.pages), guides, style, moreGuides: false }));
  }
  write("/drivers/", layout({ title: "Driver box designs", description: `Suggested sealed, ported and passive radiator boxes for ${pages.length} drivers, with charts and live designs to open and change.`, path: "/drivers/", content: driversIndexContent(byBrand), guides, style, moreGuides: false }));
}

/**
 * Headless Chrome for the driver pages' share cards (site/og.ts), or null: when SBG_CARDS=0,
 * when there's no Chrome, or when it won't start (the pages then use the site's card).
 */
async function startCards(): Promise<Rasterizer | null> {
  if (process.env.SBG_CARDS === "0") return null;
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
  const write = (path: string, html: string) => {
    const dir = join(outDir, path);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "index.html"), html);
    written.push(path);
  };

  for (const { file, page } of pages) {
    write(page.path, layout({ ...page, content: markdown(resolveExamples(page.body, links, file)), guides }));
  }

  const index = [
    "<h1>Guides</h1>",
    '<p class="lede">How to design speaker boxes, with live examples you can open and change in Speaker Box Genius.</p>',
    `<ul class="cards">${guides.map((g) => `<li><a href="${g.path}">${escapeHtml(g.title)}</a><p>${escapeHtml(g.description)}</p></li>`).join("")}</ul>`,
  ].join("\n");
  write("/guides/", layout({ title: "Guides", description: "Speaker box design guides with live, editable examples.", path: "/guides/", content: index, guides }));

  const report = readReport();
  write(
    "/validation/",
    layout({
      title: "Validation against WinISD and Hornresp",
      description: "Every WinISD and Hornresp comparison Speaker Box Genius is tested against: the cases, how far apart the results are, and the known differences.",
      path: "/validation/",
      content: validationContent(report, { commit: buildCommit(), date: new Date(), links: await validationLinks(SITE, { winisd: report.winisd.cases, hornresp: report.hornresp.cases, boxes: report.hornresp.boxes.cases }) }),
      guides,
      style: CHART_STYLE + VALIDATION_STYLE,
    }),
  );

  write(
    "/about/",
    layout({
      title: "About",
      description: "A free speaker box simulator in your browser. What it is, who builds it, the licence in plain words (free for non-commercial use), and credits.",
      path: "/about/",
      content: markdown(readFileSync(join(HERE, "about.md"), "utf8")),
      guides,
      moreGuides: false,
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
      moreGuides: false,
    }),
  );

  await buildDriverPages(write, guides, outDir);

  const imgDir = join(HERE, "img");
  if (existsSync(imgDir)) {
    mkdirSync(join(outDir, "guides/img"), { recursive: true });
    for (const f of readdirSync(imgDir)) copyFileSync(join(imgDir, f), join(outDir, "guides/img", f));
  }

  const urls = ["/", ...written];
  writeFileSync(
    join(outDir, "sitemap.xml"),
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((u) => `  <url><loc>${SITE}${u}</loc></url>`).join("\n")}\n</urlset>\n`,
  );
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
