/**
 * Builds the guide pages: plain HTML pages Google can read, next to the app.
 *
 *   node --experimental-strip-types site/build.ts [outDir]   (default packages/web/dist)
 *
 * Each `site/pages/*.md` file becomes `<outDir>/<path>/index.html`. A page starts with a
 * front-matter block (`---` lines) giving its `title`, `description` and `path`, and
 * optionally `image` (its share card when it has no picture in site/img/guides: a file in site/img, or
 * `chart:example/kind` for that chart drawn as a 1200 × 630 card with the page's title, site/guideCharts.ts)
 * and `order` (its place in lists). A guide with a picture is shared with that picture.
 * The body is Markdown (the subset in `markdown` below); the paragraph under the # title is
 * shown as the page's introduction. Extras:
 *
 *   {{link:pr-example}}               the share link of an example design (site/examples.ts)
 *   [[Open this design|pr-example]]   a button opening that example in the app
 *   ![caption](chart:pr-example/excursion)   the app's own chart of that example, drawn at build
 *   ![caption](chart:a/spl|b/maxspl "A|B")   charts side by side, several examples or some designs (site/guideCharts.ts)
 *                                     (site/guideCharts.ts: response, spl, excursion, maxspl)
 *   {{num:pr-example/1/f3}}           a number from that example, worked out at build
 *   {{color:pr-example/1}}            a design's curve colour in words (site/liveNumbers.ts)
 *
 * Also writes a /guides/ index, the /validation/ page (site/validation.ts, from
 * docs/validation/results.json), the sitemaps (site/sitemap.ts) and robots.txt, and copies
 * site/img to /guides/img/.
 */
import { copyFileSync, cpSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
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
import { guideCardHtml, guideCharts, type ChartData } from "./guideCharts.ts";
import { htmlToMarkdown, llmsFull, llmsTxt, toAiMarkdown, twinPath, type LlmsEntry, type Twin, type TwinPage } from "./aiDocs.ts";
import { cardSvg, findChrome, Rasterizer } from "./og.ts";
import { CardCache, cardSalt } from "./cardCache.ts";
import { CALC_PAGES, CALC_STYLE, CALCULATORS, calcCardSvg, fillCalc, HUB_STYLE, hubCards, liveChartCss, viteScript } from "./calculators.ts";
import { LastmodStore, sitemapFiles, type SitemapEntry, type SitemapGroup } from "./sitemap.ts";
import { cardData, brandContent, brandPath, designDriver, driverContent, driverPath, driversIndexContent, DRIVERS_STYLE, hubSizes, loadDb, prCandidate, refFreq, relatedDrivers, sens283, shareLink, sizeContent, sizeLabel, sizePath, sizeSlug, type DriverPage, type PageLd, type PageLinks, type VariantLink, withPr } from "./drivers.ts";
import { substitutesFor } from "./similar.ts";
import { asCompare } from "../packages/web/src/state.ts";
import { variantFamilies, variantLabels } from "../packages/db-tools/src/variants.ts";

export const SITE = "https://speakerboxgenius.com";
const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = "https://github.com/daliusiv/speaker-box-genius";
/**
 * Visit counts (no cookies; see site/privacy.md). The app's index.html has the same tag.
 * GoatCounter's count.js doesn't check Do Not Track / Global Privacy Control, so this loads it only when
 * the browser hasn't asked not to be tracked (same test as telemetrySchema.ts browserSaysNo) and
 * Settings → Privacy → Help improve the app isn't off (telemetry.ts PREF, same origin as every site page).
 * A share link from the MCP server (?ref=mcp) is counted with referrer "mcp" and without the tag in the path
 * (the app then drops it from the address, main.tsx). Not loaded → window.goatcounter is undefined, so the guarded event counts (ask-ai) stop too.
 */
export const GOATCOUNTER =
  '<script>(function(){var n=navigator,w=window;if(n.globalPrivacyControl===true||n.doNotTrack==="1"||n.doNotTrack==="yes"||w.doNotTrack==="1")return;try{if(localStorage.getItem("sbg.usageStats")==="off")return}catch(e){}if(/[?&]ref=mcp(&|$)/.test(location.search))w.goatcounter={referrer:"mcp",path:location.pathname};var s=document.createElement("script");s.async=true;s.src="https://gc.zgo.at/count.js";s.setAttribute("data-goatcounter","https://speakerboxgenius.goatcounter.com/count");document.head.appendChild(s)})()</script>';

export interface Page {
  title: string;
  description: string;
  path: string;
  image?: string;
  order: number;
  /** Which section of the guides index it's listed in (an id from GUIDE_GROUPS). */
  group?: string;
  /** The guide's illustration's alt text (`art:` in the front matter); the picture is site/img/guides/<slug>.svg. */
  art?: string;
  /** Where the illustration is served, when the guide has one (set by `withArt`). */
  thumb?: string;
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
  return { title: meta.title!, description: meta.description!, path, image: meta.image, order: Number(meta.order ?? 99), group: meta.group, art: meta.art, body: m[2]! };
}

/** A guide's slug: the last part of its path (`/guides/port-chuffing/` → `port-chuffing`). */
export const guideSlug = (p: Page) => p.path.split("/").filter(Boolean).pop()!;

/**
 * Finds the guide's illustration, site/img/guides/<slug>.svg. A picture needs its alt text (`art:`)
 * and alt text needs its picture, so neither is forgotten when the other is added.
 */
export function withArt(page: Page, file = page.path): Page {
  const svg = join(HERE, "img", "guides", `${guideSlug(page)}.svg`);
  const has = existsSync(svg);
  if (has && !page.art) throw new Error(`${file}: site/img/guides/${guideSlug(page)}.svg needs its alt text: add "art: <what the picture shows>" to the front matter`);
  if (!has && page.art) throw new Error(`${file}: has "art:" but no site/img/guides/${guideSlug(page)}.svg`);
  return has ? { ...page, thumb: `/guides/img/guides/${guideSlug(page)}.svg` } : page;
}

/** The guide's illustration as a banner, placed after the intro (the lede), before the open buttons. */
export function withHero(content: string, page: Page): string {
  if (!page.thumb) return content;
  const hero = `<figure class="hero"><img src="${page.thumb}" alt="${escapeHtml(page.art!)}" width="1200" height="630"></figure>`;
  const lede = /<p class="lede">[\s\S]*?<\/p>/.exec(content) ?? /<h1>[\s\S]*?<\/h1>/.exec(content);
  if (!lede) return hero + "\n" + content;
  const at = lede.index + lede[0].length;
  return `${content.slice(0, at)}\n${hero}${content.slice(at)}`;
}

/**
 * What a guide's share card is drawn from: its picture (site/img/guides/<slug>.svg, already
 * 1200 × 630) when it has one, so link previews show the same drawing as the page; else its
 * `image: chart:example/kind` chart with the title; else null (a file `image:`, or the site's card).
 */
export async function shareCardSource(page: Page, file = page.path): Promise<{ source: string; html: boolean } | null> {
  if (page.thumb) return { source: readFileSync(join(HERE, "img", "guides", `${guideSlug(page)}.svg`), "utf8"), html: false };
  if (page.image?.startsWith("chart:")) return { source: await guideCardHtml(page.title, page.image, file), html: true };
  return null;
}

/** "Ask AI about this page" (#393): the borderless menu under a guide's or calculator's H1. */
export const ASK_AI_STYLE = `
.ask-ai{display:flex;justify-content:flex-end;margin:.2rem -.85rem 1rem 0}
.ask-ai-d{position:relative}
.ask-ai-btn{display:inline-flex;align-items:center;gap:.5rem;min-height:44px;padding:.45rem .85rem;border-radius:.6rem;color:var(--fg);font-size:.94rem;font-weight:600;cursor:pointer;list-style:none;user-select:none}
.ask-ai-btn::-webkit-details-marker{display:none}
.ask-ai-btn:hover,.ask-ai-d[open]>.ask-ai-btn{background:rgb(255 255 255 / .05)}
.ask-ai-btn:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
.ask-ai-btn svg{color:var(--muted)}
.ask-ai-caret{color:var(--muted);font-size:.8rem}
.ask-ai-menu{position:absolute;z-index:5;top:calc(100% + .4rem);right:0;width:20rem;padding:.35rem;background:var(--card);border:1px solid var(--border);border-radius:.7rem;display:flex;flex-direction:column}
main a.ask-ai-item,.ask-ai-item{display:flex;align-items:center;gap:.75rem;min-height:52px;padding:.5rem .7rem;border-radius:.5rem;color:var(--fg);text-align:left;text-decoration:none;cursor:pointer;width:100%}
.ask-ai-item:hover,.ask-ai-item:focus-visible{background:rgb(255 255 255 / .05);outline:none}
.ask-ai-idle,.ask-ai-done{display:flex;align-items:center;gap:.75rem}
.ask-ai-ic{display:flex;color:var(--muted)}
.ask-ai-ic.ok{color:var(--accent)}
.ask-ai-txt{display:flex;flex-direction:column;line-height:1.3}
.ask-ai-label{font-size:.95rem;font-weight:600}
.ask-ai-detail{font-size:.82rem;color:var(--muted)}
@media (max-width:520px){.ask-ai-d{position:static}.ask-ai{position:relative}.ask-ai-menu{width:auto;left:.85rem;right:0}}
`;

const SVG = (w: number, d: string) => `<svg viewBox="0 0 24 24" width="${w}" height="${w}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const ICON_CHAT = SVG(18, '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>');
const ICON_COPY = SVG(18, '<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>');
const ICON_OK = SVG(18, '<path d="M20 6 9 17l-5-5"/>');
const ICON_OUT = SVG(16, '<path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>');

/** The prompt the Claude / ChatGPT links start a chat with. */
export const askAiPrompt = (path: string) => `Read ${SITE}${twinPath(path)} from Speaker Box Genius so I can ask questions about it.`;

/** Copy fetches the twin and puts it on the clipboard (else opens it); outside click / Escape closes; counts go to GoatCounter when it's loaded. */
const ASK_AI_SCRIPT = `(()=>{const d=document.querySelector(".ask-ai-d");if(!d)return;const s=d.querySelector("summary");
const count=(k)=>{try{window.goatcounter&&window.goatcounter.count&&window.goatcounter.count({path:"ask-ai-"+k,title:location.pathname,event:true})}catch(e){}};
const c=d.querySelector('[data-ask-ai="copy"]');const done=c.querySelector(".ask-ai-done"),idle=c.querySelector(".ask-ai-idle");
c.addEventListener("click",(e)=>{e.preventDefault();count("copy");const url=c.getAttribute("href");
const text=()=>fetch(url).then((r)=>{if(!r.ok)throw new Error(r.status);return r.text()});
const ok=()=>{idle.hidden=true;done.hidden=false};const fail=()=>{window.open(url,"_blank","noopener")};
try{if(window.ClipboardItem&&navigator.clipboard&&navigator.clipboard.write){navigator.clipboard.write([new ClipboardItem({"text/plain":text().then((t)=>new Blob([t],{type:"text/plain"}))})]).then(ok,()=>text().then((t)=>navigator.clipboard.writeText(t)).then(ok,fail));return}}catch(e){}
if(navigator.clipboard&&navigator.clipboard.writeText){text().then((t)=>navigator.clipboard.writeText(t)).then(ok,fail)}else fail()});
d.querySelectorAll("[data-ask-ai]:not([data-ask-ai=copy])").forEach((a)=>a.addEventListener("click",()=>{count(a.getAttribute("data-ask-ai"));d.open=false}));
d.addEventListener("toggle",()=>{if(d.open){idle.hidden=false;done.hidden=true}});
document.addEventListener("click",(e)=>{if(d.open&&!d.contains(e.target))d.open=false});
document.addEventListener("keydown",(e)=>{if(e.key==="Escape"&&d.open){d.open=false;s.focus()}});})();`;

/** The Ask AI menu for a page: a <details> (opens without JS) with Copy page as Markdown, Open in Claude, Open in ChatGPT. */
export function askAi(path: string): string {
  const twin = twinPath(path);
  const q = encodeURIComponent(askAiPrompt(path));
  const item = (key: string, href: string, icon: string, label: string, detail: string, ext = true) =>
    `<a class="ask-ai-item" data-ask-ai="${key}" href="${href}"${ext ? ' target="_blank" rel="noopener"' : ""}><span class="ask-ai-ic">${icon}</span><span class="ask-ai-txt"><span class="ask-ai-label">${label}</span><span class="ask-ai-detail">${detail}</span></span></a>`;
  const copy = `<a class="ask-ai-item" data-ask-ai="copy" href="${twin}"><span class="ask-ai-idle"><span class="ask-ai-ic">${ICON_COPY}</span><span class="ask-ai-txt"><span class="ask-ai-label">Copy page as Markdown</span><span class="ask-ai-detail">For any AI chat</span></span></span><span class="ask-ai-done" hidden><span class="ask-ai-ic ok">${ICON_OK}</span><span class="ask-ai-txt"><span class="ask-ai-label">Copied</span><span class="ask-ai-detail">Paste it into any AI chat</span></span></span></a>`;
  return `<div class="ask-ai"><details class="ask-ai-d"><summary class="ask-ai-btn">${ICON_CHAT}<span>Ask AI about this page</span><span class="ask-ai-caret" aria-hidden="true">▾</span></summary><div class="ask-ai-menu" aria-label="Ask AI about this page">${copy}${item("claude", `https://claude.ai/new?q=${q}`, ICON_OUT, "Open in Claude", "Opens a chat that reads this page")}${item("chatgpt", `https://chatgpt.com/?q=${q}`, ICON_OUT, "Open in ChatGPT", "Opens a chat that reads this page")}</div></details></div>\n<script>${ASK_AI_SCRIPT}</script>`;
}

/** Puts the Ask AI menu right after the page's H1 (before the lede, hero and buttons). */
export function withAskAi(content: string, path: string): string {
  const h1 = /<h1>[\s\S]*?<\/h1>/.exec(content);
  if (!h1) throw new Error(`${path}: no <h1> for the Ask AI menu`);
  const at = h1.index + h1[0].length;
  return `${content.slice(0, at)}\n${askAi(path)}${content.slice(at)}`;
}

export const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Inline Markdown: code, images, links, bold, italics. */
function inline(s: string): string {
  const codes: string[] = [];
  let out = escapeHtml(s).replace(/`([^`]+)`/g, (_, c: string) => `\u0000${codes.push(c) - 1}\u0000`);
  out = out
    // Images live in site/img, served from /guides/img/ whatever page they're on.
    .replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (_, alt: string, src: string) => `<img src="${src.replace(/^img\//, "/guides/img/")}" alt="${alt}" loading="lazy">`)
    // A URL may hold one level of brackets (Wikipedia's `Passive_radiator_(speaker)`).
    .replace(/\[([^\]]+)\]\(((?:[^()\s]|\([^()\s]*\))+)\)/g, (_, text: string, href: string) => {
      const external = /^https?:/.test(href) && URL.parse(href)?.origin !== SITE;
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
export function markdown(md: string, charts?: (src: string, title?: string) => string): string {
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
    // A chart figure may carry a title: its charts' own labels, `"Left label|Right label"`.
    const img = /^!\[([^\]]+)\]\(([^)\s]+)(?: "([^"]*)")?\)$/.exec(text);
    // ![caption](chart:example/kind): the app's chart, drawn at build (site/guideCharts.ts).
    if (img && (img[2]!.startsWith("chart:") || img[2]!.startsWith("figure:"))) {
      if (!charts) throw new Error(`${img[2]}: charts are only drawn in guide pages`);
      out.push(`<figure class="guide-chart">${charts(img[2]!, img[3])}<figcaption>${inline(img[1]!)}</figcaption></figure>`);
      continue;
    }
    if (img?.[3] !== undefined) throw new Error(`${img[2]}: only chart figures take a title`);
    out.push(img ? `<figure>${inline(text)}<figcaption>${inline(img[1]!)}</figcaption></figure>` : `<p>${inline(text)}</p>`);
  }
  // The paragraph right under the page title is its introduction.
  if (out[0]?.startsWith("<h1>") && out[1]?.startsWith("<p>")) out[1] = out[1].replace("<p>", '<p class="lede">');
  // The numbered list under "## Sources" is set smaller and muted.
  const src = out.findIndex((b) => b.startsWith('<h2 id="sources">'));
  if (src >= 0 && out[src + 1]?.startsWith("<ol>")) out[src + 1] = out[src + 1]!.replace("<ol>", '<ol class="sources">');
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
.hero{margin:1.4rem 0 1.2rem}
.hero img{aspect-ratio:1200/630}
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
.cards li:has(.thumb){display:flex;flex-direction:column}
.cards .thumb{order:-1;display:block;width:calc(100% + 2.2rem);max-width:none;height:auto;aspect-ratio:1200/630;margin:-1rem -1.1rem .85rem;border-bottom:1px solid var(--border);border-radius:.8rem .8rem 0 0}
@media (max-width:767px){.cards li:has(.thumb){display:flow-root}.cards li:has(.thumb)>a{display:block;margin-bottom:.55rem}.cards .thumb{float:left;width:6rem;height:4.5rem;aspect-ratio:auto;margin:.2rem .9rem .35rem 0;object-fit:cover;border:1px solid var(--border);border-radius:.5rem}.cards li:has(.thumb) p{margin-top:0}}
.cards.small{grid-template-columns:repeat(auto-fill,minmax(min(15rem,100%),1fr));gap:.8rem}
.cards.small a{font-size:1rem}
.group-intro{color:var(--muted);margin:-.2rem 0 1rem}
.find{width:100%;margin:.4rem 0 .6rem;padding:.65rem .9rem;border:1px solid var(--border);border-radius:.6rem;background:var(--card);color:var(--fg);font:inherit}
.find:focus{outline:2px solid var(--accent);outline-offset:1px}
.related{margin-top:3rem}
footer{max-width:46rem;margin:0 auto;padding:1.5rem 1.1rem 3rem;border-top:1px solid var(--border);color:var(--muted);font-size:.9rem}
footer a{color:var(--muted)}
/* Readability: body content only (top-level headings and plain lists), so forms, card grids and sections keep their look. */
main>h2{margin:3rem 0 .8rem;padding-top:1.2rem;border-top:1px solid var(--border);scroll-margin-top:1rem}
main>h2:first-of-type{margin-top:2.2rem;padding-top:0;border-top:0}
main>h3{margin-top:1.9rem}
main>:is(ul,ol):not([class]){padding-left:1.35rem;margin:.8rem 0 1.3rem}
main>:is(ul,ol):not([class]) li{margin:.5rem 0}
main>:is(ul,ol):not([class]) li::marker{color:var(--muted)}
main strong{color:var(--fg)}
main p,main li{overflow-wrap:break-word}
main a:not(.button){text-underline-offset:3px;text-decoration-color:rgb(78 215 233 / .4)}
main a:not(.button):hover{text-decoration-color:var(--accent)}
/* A lone button is the page's action; a row of buttons is a set of equal choices. */
.cta .button:not(:only-child){background:transparent;color:var(--fg);box-shadow:inset 0 0 0 1px var(--input-border,#343b4a)}
.cta .button:not(:only-child):hover{box-shadow:inset 0 0 0 1px var(--accent)}
.note{margin:1.8rem 0;padding:.9rem 1.15rem;border:1px solid var(--border);border-left:3px solid var(--draw);border-radius:.6rem}
.note>:first-child{margin-top:0}
.note>:last-child{margin-bottom:0}
.table{margin:1.6rem 0;border:1px solid var(--border);border-radius:.7rem;background:var(--card)}
.table table{font-variant-numeric:tabular-nums}
.table th,.table td{padding:.65rem .85rem}
.table thead th{background:rgb(255 255 255 / .03)}
.table tbody tr:last-child>*{border-bottom:0}
ol.sources{padding-left:1.35rem;font-size:.88rem}
ol.sources li{margin:.4rem 0;color:var(--muted)}
figure>figcaption{margin-top:.65rem;line-height:1.55}
/* "On this page": the right-hand margin, wide screens only; the column stays centred. */
.toc{display:none}
@media (min-width:1240px){main{position:relative}.toc{display:block;position:absolute;top:0;bottom:0;left:calc(100% + 1.25rem);width:13rem}.toc-inner{position:sticky;top:1.5rem;max-height:calc(100vh - 3rem);overflow-y:auto;padding-top:1.35rem}.toc-h{margin:0 0 .5rem;color:var(--muted);font-size:.78rem;font-weight:600;letter-spacing:.06em;text-transform:uppercase}.toc ol{margin:0;padding:0;list-style:none;border-left:1px solid var(--border)}.toc li{margin:0}.toc a{display:block;margin-left:-1px;padding:.3rem 0 .3rem .8rem;border-left:2px solid transparent;color:var(--muted);font-size:.88rem;line-height:1.35;text-decoration:none}.toc a:hover{color:var(--fg);border-left-color:var(--accent)}}
`;

/**
 * Speaker Box Genius as a schema.org Organization: every page's author and publisher. The
 * @id, logo and sameAs match packages/web/index.html, so search engines tie the name to this
 * site and its repo (not to the Genius speaker brand).
 */
export const ORG = { "@type": "Organization", "@id": `${SITE}/#organization`, name: "Speaker Box Genius", url: `${SITE}/`, logo: `${SITE}/icons/icon-512.png`, sameAs: [REPO] };

/** The app (same @id as packages/web/index.html): what the WinISD and Hornresp alternative pages are about. */
export const APP_LD = {
  "@type": "WebApplication",
  "@id": `${SITE}/#app`,
  name: "Speaker Box Genius",
  url: `${SITE}/`,
  applicationCategory: "DesignApplication",
  operatingSystem: "Any (runs in a web browser)",
  isAccessibleForFree: true,
  offers: { "@type": "Offer", price: "0", priceCurrency: "GBP" },
  publisher: { "@id": `${SITE}/#organization` },
};

/** JSON for a <script> tag: "<" escaped so a name can never close the tag. */
const jsonLd = (x: unknown) => JSON.stringify(x).replace(/</g, "\\u003c");

/** A whole HTML page around some content. */
/** The top bar's sections; the one a page belongs to is marked as current. */
const NAV = [
  { href: "/drivers/", label: "Drivers", match: (p: string) => p.startsWith("/drivers/") },
  { href: "/guides/", label: "Guides", match: (p: string) => p.startsWith("/guides/") || p.endsWith("-alternative/") },
  { href: "/calculators/", label: "Calculators", match: (p: string) => p.startsWith("/calculators/") },
  // Left out below 520 px, so Drivers · Guides · Calculators fit on a phone (it's in the footer).
  { href: "/validation/", label: "Validation", match: (p: string) => p === "/validation/", cls: "wider" },
];

/** Block elements whose h2s belong to them (index groups, related guides, calculator forms), not to the page. */
const NESTS = new Set(["section", "form", "div", "aside", "figure", "nav", "details", "fieldset", "table", "ul", "ol", "header", "footer", "article"]);

/** The page's own h2s (with ids, not inside a block such as a section or form), in order. */
export function topHeadings(html: string): { id: string; text: string }[] {
  const out: { id: string; text: string }[] = [];
  let depth = 0;
  const tag = /<(\/?)([a-z][a-z0-9-]*)\b([^>]*)>/gi;
  for (let m = tag.exec(html); m; m = tag.exec(html)) {
    const name = m[2]!.toLowerCase();
    if (NESTS.has(name)) depth += m[1] ? -1 : 1;
    else if (name === "h2" && !m[1] && depth === 0) {
      const id = /\bid="([^"]+)"/.exec(m[3]!)?.[1];
      const end = html.indexOf("</h2>", tag.lastIndex);
      if (id && end >= 0) out.push({ id, text: html.slice(tag.lastIndex, end).replace(/<[^>]*>/g, "").trim() });
    }
  }
  return out;
}

/** "On this page" for pages with three or more sections; shown beside the column on wide screens (STYLE). */
export function contents(html: string): string {
  const hs = topHeadings(html);
  // Fewer than three sections, or the page already links to each one (the size pages' chips): none.
  if (hs.length < 3 || hs.every((h) => html.includes(`href="#${h.id}"`))) return "";
  return `<nav class="toc" aria-label="On this page"><div class="toc-inner"><p class="toc-h">On this page</p><ol>${hs.map((h) => `<li><a href="#${h.id}">${h.text}</a></li>`).join("")}</ol></div></nav>\n`;
}

export function layout(o: { title: string; description: string; path: string; image?: string; imagePath?: string; content: string; guides: Page[]; style?: string; ld?: PageLd; scripts?: string[]; alternate?: string }): string {
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
<link rel="canonical" href="${url}">${o.alternate ? `\n<link rel="alternate" type="text/markdown" href="${SITE}${o.alternate}">` : ""}
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
<nav class="nav">${NAV.map((n) => `<a href="${n.href}"${"cls" in n ? ` class="${n.cls}"` : ""}${n.match(o.path) ? ' aria-current="page"' : ""}>${n.label}</a>`).join("")}<a class="button" href="/">Open<span class="opt"> the</span> app</a></nav>
</header>
<main>
${contents(o.content)}${o.content}
</main>
<footer>
<p><a href="/">Speaker Box Genius</a>: a free, browser-based loudspeaker enclosure simulator · <a href="/drivers/">Drivers</a> · <a href="/guides/">Guides</a> · <a href="/calculators/">Calculators</a> · <a href="/validation/">Validation</a> · <a href="/about/">About</a> · <a href="/changelog/">Changelog</a> · <a href="/privacy/">Privacy</a> · <a href="${REPO}">GitHub</a> · <a href="${REPO}/blob/main/docs/data-sources.md">Driver data credits</a></p>
</footer>${(o.scripts ?? []).map((src) => `\n<script type="module" src="${src}"></script>`).join("")}
</body>
</html>
`;
}

/** /drivers/, one index per brand, and one page per driver with suggested boxes (site/drivers.ts). */
/**
 * Share cards for the whole build: one cache (so pruning sees every card) and one headless
 * Chrome, started only when a card has to be drawn.
 */
class Cards {
  readonly cache: CardCache | null;
  drawn = 0;
  private r: Rasterizer | null | undefined;
  constructor() {
    this.cache = process.env.SBG_CARDS !== "0" ? new CardCache(process.env.SBG_CARD_CACHE ?? join(HERE, "..", ".cache", "cards"), cardSalt(readFileSync(join(HERE, "og.ts"), "utf8"))) : null;
  }
  /** The card for this source (an SVG, or a whole HTML page), from the cache or drawn now; null without Chrome. */
  async jpeg(source: string, html = false): Promise<Uint8Array | null> {
    if (!this.cache) return null;
    let jpg: Uint8Array | null = this.cache.get(source);
    if (!jpg) {
      if (this.r === undefined) this.r = await startCards();
      if (this.r) {
        jpg = await this.r.image(source, { html });
        this.cache.put(source, jpg);
        this.drawn++;
      }
    }
    return jpg;
  }
  async close() {
    await this.r?.close();
    if (this.cache) console.log(`Share cards: ${this.cache.hits} reused, ${this.drawn} drawn${this.cache.misses > this.drawn ? `, ${this.cache.misses - this.drawn} left without one (no Chrome)` : ""}; ${this.cache.prune()} old ones removed from the cache.`);
  }
}

async function buildDriverPages(write: (path: string, html: string) => void, guides: Page[], outDir: string, cards: Cards): Promise<void> {
  const db = loadDb();
  const prs = db.passiveRadiators.map(prCandidate);
  const pages = db.drivers.map((e) => designDriver(e, prs)).filter((p): p is DriverPage => p !== null);
  const style = CHART_STYLE + DRIVERS_STYLE;
  // Other impedances and voice coils of each driver, among the drivers that got a page.
  const byId = new Map(pages.map((p) => [p.id, p]));
  const families = variantFamilies(db.drivers.filter((e) => byId.has(e.id)));
  const variantsOf = (id: string): VariantLink[] | undefined => {
    const ids = families.get(id);
    if (!ids) return undefined;
    const members = ids.map((i) => byId.get(i)!);
    const labels = variantLabels(members.map((m) => m.rec));
    return members.map((m, i) => ({ id: m.id, label: labels[i]!, re: m.rec.ts.re, sens: sens283(m.rec), wiring: m.rec.voice_coils === 2 ? (m.rec.ts_wiring ?? "parallel") : undefined, boxes: Object.fromEntries(m.designs.map((d) => [d.design.kind, d.vb_l])) }));
  };
  // Sizes with enough drivers get a page; a size's address must not be a brand's.
  const hubs = hubSizes(pages);
  const hubSet = new Set(hubs.map((h) => h.inches));
  const brandSlugs = new Set(pages.map((p) => p.brandSlug));
  for (const h of hubs) if (brandSlugs.has(sizeSlug(h.inches))) throw new Error(`Size page /drivers/${sizeSlug(h.inches)}/ has a brand's address`);
  // Scored substitutes per page (site/similar.ts): ranked by parameters, then simulated in the page's lead box.
  const subsStart = performance.now();
  const substitutes = new Map<string, NonNullable<PageLinks["substitutes"]>>();
  for (const p of pages) {
    const all = substitutesFor(p, pages, { includeRisky: true, at: refFreq(p) });
    const shown = all.filter((x) => x.tier !== "risky");
    const rows = await Promise.all(shown.map(async (sub) => ({ sub, page: byId.get(sub.id)!, compare: await shareLink(SITE, { ...p.state, compare: asCompare(byId.get(sub.id)!.state) }) })));
    substitutes.set(p.id, { rows, hidden: all.length - shown.length });
  }
  console.log(`Substitutes: ${pages.length} driver pages in ${((performance.now() - subsStart) / 1000).toFixed(1)} s`);
  for (const p of pages) {
    const family = families.get(p.id);
    const page = driverContent(p, { all: await shareLink(SITE, p.state), variants: variantsOf(p.id), sizeHub: p.rec.size_in !== undefined && hubSet.has(p.rec.size_in), related: relatedDrivers(p, pages, family && new Set(family)), substitutes: substitutes.get(p.id), prOthers: p.prOthers && (await Promise.all(p.prOthers.map((o) => shareLink(SITE, withPr(p.state, o))))), deep: p.deep && (await shareLink(SITE, p.deep.state)) }, chart);
    // The page's share card, next to it; pages without one keep the site's card.
    let imagePath: string | undefined;
    const jpg = await cards.jpeg(cardSvg(cardData(p)));
    if (jpg) {
      imagePath = `${driverPath(p.id)}card.jpg`;
      mkdirSync(join(outDir, driverPath(p.id)), { recursive: true });
      writeFileSync(join(outDir, imagePath), jpg);
    }
    write(driverPath(p.id), layout({ ...page, path: driverPath(p.id), imagePath, content: page.content, guides, style }));
  }
  const byBrand = [...new Set(pages.map((p) => p.brandSlug))]
    .map((slug) => ({ slug, name: db.brands.get(slug)?.name ?? pages.find((p) => p.brandSlug === slug)!.brand, pages: pages.filter((p) => p.brandSlug === slug) }))
    .sort((a, b) => a.name.localeCompare(b.name));
  for (const b of byBrand) {
    write(brandPath(b.slug), layout({ ld: { crumbs: [{ name: "Drivers", path: "/drivers/" }, { name: b.name }] }, title: `${b.name} drivers: box sizes and T/S parameters`, description: `Suggested sealed, ported and passive radiator boxes for ${b.pages.length} ${b.name} drivers.`, path: brandPath(b.slug), content: brandContent(b.name, b.pages, hubSet), guides, style }));
  }
  for (const h of hubs) {
    const group = pages.filter((p) => p.rec.size_in === h.inches);
    const words = sizeSlug(h.inches);
    const rows = [...group].sort((a, b) => a.rec.ts.fs - b.rec.ts.fs || `${a.brand} ${a.model}`.localeCompare(`${b.brand} ${b.model}`, "en", { numeric: true }));
    write(sizePath(h.inches), layout({
      ld: { crumbs: [{ name: "Drivers", path: "/drivers/" }, { name: words }], list: rows.map((p) => ({ name: `${p.brand} ${p.model}`, path: driverPath(p.id) })) },
      title: `${words} drivers: box sizes and T/S parameters`,
      description: `Suggested sealed, ported and passive radiator boxes for ${group.length} ${words} drivers, with their Thiele/Small parameters.`,
      path: sizePath(h.inches),
      content: sizeContent(h.inches, group, hubs),
      guides,
      style,
    }));
  }
  write("/drivers/", layout({ title: "Driver box designs", description: `Suggested sealed, ported and passive radiator boxes for ${pages.length} drivers, with charts and live designs to open and change.`, path: "/drivers/", content: driversIndexContent(byBrand, hubs), guides, style }));
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

// Title first (on phones it runs above the picture); on wide screens CSS puts the picture on top.
const card = (g: Page) => `<li><a href="${g.path}">${escapeHtml(g.title)}</a>${g.thumb ? `<img class="thumb" src="${g.thumb}" alt="" width="1200" height="630" loading="lazy">` : ""}<p>${escapeHtml(g.description)}</p></li>`;

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
  const pages = files.map((f) => ({ file: f, page: withArt(parsePage(readFileSync(join(pagesDir, f), "utf8"), f), f) }));
  const guides = pages.map((p) => p.page).sort((a, b) => a.order - b.order);
  const links = await exampleLinks(SITE);
  const written: string[] = [];
  const today = process.env.SBG_BUILD_DATE ?? new Date().toISOString().slice(0, 10);
  const lastmods = new LastmodStore(process.env.SBG_LASTMOD_STATE ?? join(HERE, "..", ".cache", "sitemap", "lastmod.json"), today, SITE);
  const guidePaths = new Set(["/guides/", ...guides.map((g) => g.path)]);
  const brandSlugs = new Set(loadDb().brands.keys());
  // Driver pages go in one sitemap per brand (Search Console then shows each brand's index rate);
  // the drivers list and any other /drivers/ page (size lists) share "drivers".
  const groupOf = (path: string): SitemapGroup => {
    if (path.startsWith("/drivers/")) {
      const brand = path.split("/")[2];
      return brand && brandSlugs.has(brand) ? `drivers-${brand}` : "drivers";
    }
    return guidePaths.has(path) ? "guides" : "pages";
  };
  const entries: SitemapEntry[] = [];
  const write = (path: string, html: string) => {
    const dir = join(outDir, path);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "index.html"), html);
    written.push(path);
    entries.push({ path, group: groupOf(path), lastmod: lastmods.date(path, html) });
  };

  // Markdown twins (site/aiDocs.ts): one per page, written with llms.txt and llms-full.txt after the pages.
  const twins = new Map<string, Twin>();
  const noCharts = (src: string): ChartData[] => {
    throw new Error(`${src}: charts are only in guides and calculators`);
  };
  const addTwin = (p: TwinPage, body: string, data: (src: string, title?: string) => ChartData[] = noCharts) => {
    twins.set(p.path, { title: p.title, description: p.description, path: p.path, md: toAiMarkdown(p, body, data, { site: SITE, date: today }) });
  };

  const cards = new Cards();
  try {
  for (const { file, page } of pages) {
    const body = fillLive(resolveExamples(page.body, links, file), file);
    const charts = await guideCharts(body, file);
    const related = relatedGuides(page, guides);
    const content = withAskAi(withHero(markdown(body, charts.draw), page), page.path) + related;
    addTwin(page, `${body}\n\n${htmlToMarkdown(related)}`, charts.chartData);
    // The page's share card (shareCardSource): its picture, else its `image: chart:…`, drawn now; without Chrome, a file `image:` or the site's card.
    let imagePath: string | undefined;
    const source = await shareCardSource(page, file);
    if (source) {
      const jpg = await cards.jpeg(source.source, source.html);
      if (jpg) {
        imagePath = `${page.path}card.jpg`;
        mkdirSync(join(outDir, page.path), { recursive: true });
        writeFileSync(join(outDir, imagePath), jpg);
      }
    }
    // The "switching" pages (WinISD / Hornresp alternative) are about the app itself.
    const ld = page.group === "switching" ? { about: APP_LD } : undefined;
    write(page.path, layout({ ...page, ld, image: page.image?.startsWith("chart:") ? undefined : page.image, imagePath, content, guides, alternate: twinPath(page.path), style: ASK_AI_STYLE + (charts.count ? charts.style : "") }));
  }

  const guidesPage = {
    title: "Speaker box design guides",
    description: "Free guides to designing sealed, ported, passive radiator and transmission line speaker boxes, each with live examples you can open and change.",
    path: "/guides/",
  };
  addTwin(
    guidesPage,
    `How to design speaker boxes, with live examples you can open and change in Speaker Box Genius. Each guide below is also a Markdown page (the link).\n\n${GUIDE_GROUPS.map((grp) => {
      const list = guides.filter((g) => g.group === grp.id).sort((a, b) => a.order - b.order);
      return list.length ? `## ${grp.title}\n\n${grp.intro}\n\n${list.map((g) => `- [${g.title}](${SITE}${twinPath(g.path)}): ${g.description}`).join("\n")}` : "";
    }).filter(Boolean).join("\n\n")}`,
  );
  write(
    "/guides/",
    layout({
      ...guidesPage,
      alternate: twinPath("/guides/"),
      content: guidesIndex(guides),
      guides,
      ld: { list: guides.map((g) => ({ name: g.title, path: g.path })) },
    }),
  );

  const report = readReport();
  const validationPage = {
    title: "Validation against WinISD, Hornresp and SPICE",
    description: "Every WinISD, Hornresp and circuit-simulator comparison Speaker Box Genius is tested against: the cases, how far apart the results are, and the known differences.",
    path: "/validation/",
  };
  const validationHtml = validationContent(report, { commit: buildCommit(), date: new Date(), links: await validationLinks(SITE, { winisd: report.winisd.cases, hornresp: report.hornresp.cases, boxes: report.hornresp.boxes.cases }) });
  // The twin carries the summary and the known differences, not the hundreds of per-case tables (the page's, from #winisd on).
  addTwin(validationPage, htmlToMarkdown(validationHtml.slice(0, validationHtml.indexOf('<h2 id="winisd">'))));
  write(
    "/validation/",
    layout({
      ...validationPage,
      alternate: twinPath("/validation/"),
      content: validationHtml,
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

  const aboutPage = {
    title: "About",
    description: "A free speaker box simulator in your browser. What it is, who builds it, the licence in plain words (free for non-commercial use), and credits.",
    path: "/about/",
  };
  addTwin(aboutPage, readFileSync(join(HERE, "about.md"), "utf8"));
  write(aboutPage.path, layout({ ...aboutPage, alternate: twinPath(aboutPage.path), content: markdown(readFileSync(join(HERE, "about.md"), "utf8")), guides }));

  const changelogPage = {
    title: "Changelog",
    description: "What's new in Speaker Box Genius: new features, fixes and driver data, by date.",
    path: "/changelog/",
  };
  addTwin(changelogPage, readFileSync(join(HERE, "..", "CHANGELOG.md"), "utf8"));
  write(changelogPage.path, layout({ ...changelogPage, alternate: twinPath(changelogPage.path), content: markdown(readFileSync(join(HERE, "..", "CHANGELOG.md"), "utf8")), guides }));

  const mcpPage = {
    title: "Speaker Box Genius for AI assistants (MCP server)",
    description: "Let Claude, Cursor or VS Code design speaker boxes with the simulator's own engine, on your computer: search drivers, size boxes, find passive radiators and get share links. Free, no account.",
    path: "/mcp/",
  };
  addTwin(mcpPage, readFileSync(join(HERE, "mcp.md"), "utf8"));
  write(mcpPage.path, layout({ ...mcpPage, alternate: twinPath(mcpPage.path), content: markdown(readFileSync(join(HERE, "mcp.md"), "utf8")), guides }));

  const privacyPage = {
    title: "Privacy",
    description: "No accounts, no cookies: your designs stay in your browser and your links. What the visit counter sees.",
    path: "/privacy/",
  };
  addTwin(privacyPage, readFileSync(join(HERE, "privacy.md"), "utf8"));
  write(privacyPage.path, layout({ ...privacyPage, alternate: twinPath(privacyPage.path), content: markdown(readFileSync(join(HERE, "privacy.md"), "utf8")), guides }));

  // Calculators (site/calculators.ts): the page text here, the live part from the app's build.
  const hubPage = {
    title: "Speaker box calculators: subwoofer, sealed and ported box size, ports and PRs",
    description: "Free speaker box calculators that run the simulator's own engine, checked against WinISD and Hornresp: subwoofer, sealed and ported box size, port length and air speed, passive radiator mass.",
    path: "/calculators/",
  };
  addTwin(
    hubPage,
    `Quick answers for box size, ports and passive radiators. Each one runs the simulator's own engine, the one checked against WinISD and Hornresp.\n\n## The calculators\n\n${CALCULATORS.map((c) => `- [${c.name}](${SITE}${twinPath(c.path)}): ${c.blurb}`).join("\n")}\n\n${readFileSync(join(HERE, "calculators", "index.md"), "utf8")}`,
  );
  write(
    "/calculators/",
    layout({
      ...hubPage,
      alternate: twinPath("/calculators/"),
      content: `<h1>Speaker box calculators</h1>\n<p class="lede">Quick answers for box size, ports and passive radiators. Each one runs the simulator's own engine, the one checked against WinISD and Hornresp on the <a href="/validation/">validation page</a>. Copy a link to share your numbers, or open the box in the simulator to see every chart.</p>\n${hubCards()}\n${markdown(readFileSync(join(HERE, "calculators", "index.md"), "utf8"))}`,
      guides,
      style: HUB_STYLE,
      ld: { list: CALCULATORS.map((c) => ({ name: c.name, path: c.path })) },
    }),
  );
  for (const c of CALC_PAGES) {
    const script = viteScript(outDir, c.entry);
    const md = fillCalc(readFileSync(join(HERE, "calculators", c.md), "utf8"), c.values());
    // A worked example may show the app's charts (![…](chart:example/response)), drawn as in the guides.
    const charts = await guideCharts(md, c.md);
    const extra = c.chartStyle?.() ?? "";
    addTwin(
      { title: c.h1, description: c.description, path: c.path },
      `${c.lede.replace(/<[^>]+>/g, "")}\n\nThe interactive calculator is at ${SITE}${c.path}; this page has its text and worked example.\n\n${md}`,
      charts.chartData,
    );
    // The page's share card: its picture (the hub's), drawn now; without Chrome, the site's card.
    let imagePath: string | undefined;
    const jpg = await cards.jpeg(calcCardSvg(c.path));
    if (jpg) {
      imagePath = `${c.path}card.jpg`;
      mkdirSync(join(outDir, c.path), { recursive: true });
      writeFileSync(join(outDir, imagePath), jpg);
    }
    write(
      c.path,
      layout({
        title: c.title,
        description: c.description,
        path: c.path,
        imagePath,
        alternate: twinPath(c.path),
        ld: { crumbs: [{ name: "Calculators", path: "/calculators/" }, { name: c.crumb }] },
        content: withAskAi(`<h1>${c.h1}</h1>\n<p class="lede">${c.lede}</p>\n${c.form()}\n${markdown(md, charts.draw)}`, c.path),
        guides,
        // A live chart's tip and cursor rules too (a still chart has neither).
        style: CALC_STYLE + ASK_AI_STYLE + (charts.count ? charts.style : "") + extra + liveChartCss(),
        ...(script ? { scripts: [script] } : {}),
      }),
    );
  }

  await buildDriverPages(write, guides, outDir, cards);
  } finally {
    await cards.close();
  }

  // The twins and their indexes, in llms.txt order. Not in the sitemaps (they are copies of pages the sitemaps list).
  const need = (path: string) => twins.get(path) ?? (() => { throw new Error(`no twin for ${path}`); })();
  const entry = (section: LlmsEntry["section"], path: string): LlmsEntry => ({ section, title: need(path).title, description: need(path).description, link: twinPath(path) });
  const entries2: LlmsEntry[] = [
    ...["/guides/", ...guides.map((g) => g.path)].map((p) => entry("Guides", p)),
    ...["/calculators/", ...CALCULATORS.map((c) => c.path)].map((p) => entry("Calculators", p)),
    ...["/about/", "/validation/", "/changelog/", "/privacy/"].map((p) => entry("Reference", p)),
    { section: "Optional", title: "Drivers", description: "Every driver in the database, by brand and size, with suggested boxes for each (web pages, not Markdown).", link: `${SITE}/drivers/` },
    { section: "Optional", title: "Driver data credits", description: "Where the driver data comes from and how it is licensed.", link: `${REPO}/blob/main/docs/data-sources.md` },
    ...(twins.has("/mcp/") ? [entry("Optional", "/mcp/")] : []),
  ];
  const ordered = entries2.map((e) => twins.get(e.link.startsWith("http") ? "" : e.link.replace(/\.md$/, "/"))).filter((t): t is Twin => !!t);
  for (const t of ordered) {
    const dest = join(outDir, twinPath(t.path));
    mkdirSync(dirname(dest), { recursive: true });
    writeFileSync(dest, t.md);
  }
  writeFileSync(join(outDir, "llms.txt"), llmsTxt(entries2, SITE));
  writeFileSync(join(outDir, "llms-full.txt"), llmsFull(ordered));
  console.log(`AI docs: ${ordered.length} Markdown twins, llms.txt, llms-full.txt (${Math.round(llmsFull(ordered).length / 1024)} KB)`);

  const imgDir = join(HERE, "img");
  if (existsSync(imgDir)) {
    mkdirSync(join(outDir, "guides/img"), { recursive: true });
    cpSync(imgDir, join(outDir, "guides/img"), { recursive: true });
  }

  // The app's home page isn't built here: dated by the app's index.html when it's there (the deploy builds the app first).
  const appIndex = join(outDir, "index.html");
  entries.unshift({ path: "/", group: "pages", lastmod: existsSync(appIndex) ? lastmods.date("/", readFileSync(appIndex, "utf8")) : today });
  for (const [name, xml] of Object.entries(sitemapFiles(SITE, entries))) writeFileSync(join(outDir, name), xml);
  lastmods.save(join(outDir, "sitemap-state.json"));
  console.log(`Sitemaps: ${entries.length} URLs, ${lastmods.changed} new or changed since the last saved build`);
  writeFileSync(join(outDir, "robots.txt"), `User-agent: *\nAllow: /\nDisallow: /sitemap-state.json\n\nSitemap: ${SITE}/sitemap.xml\n`);
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
