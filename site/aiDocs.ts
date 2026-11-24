/**
 * Markdown twins of the site's pages, for AI assistants and anyone who wants the text without the
 * page around it: every guide, calculator and reference page is also written as `<path>.md`
 * (`/guides/port-tuning/` → `/guides/port-tuning.md`), plus `llms.txt` (the index, llmstxt.org
 * format) and `llms-full.txt` (every twin in one file). Built by site/build.ts from the same
 * source and the same numbers as the HTML page (placeholders already filled), so a twin can't
 * drift from its page. Charts become a caption and a table of key points, worked out by the same
 * engine run that draws them (site/guideCharts.ts `chartData`).
 */
import type { ChartData } from "./guideCharts.ts";

/** A twin's URL path: the page's path without its trailing slash, plus `.md`. */
export function twinPath(path: string): string {
  const p = path.replace(/\/+$/, "");
  if (!p) throw new Error("the home page has no twin");
  return `${p}.md`;
}

export interface TwinPage {
  title: string;
  description: string;
  path: string;
}

/** A page's twin as it appears in the indexes. */
export interface Twin extends TwinPage {
  md: string;
}

const SCHEME = /^[a-z][a-z0-9+.-]*:/i;

/** Makes one link target absolute: site-relative, in-page (#…), `img/…` and relative to the page's folder. */
export function absoluteUrl(href: string, pagePath: string, site: string): string {
  if (SCHEME.test(href) || href.startsWith("//")) return href;
  if (href.startsWith("#")) return `${site}${pagePath}${href}`;
  if (href.startsWith("/")) return `${site}${href}`;
  if (href.startsWith("img/")) return `${site}/guides/${href}`;
  const dir = pagePath.endsWith("/") ? pagePath : pagePath.replace(/[^/]*$/, "");
  return new URL(href, `${site}${dir}`).href;
}

/** Links and images made absolute, outside code blocks and inline code. */
export function absolutize(md: string, pagePath: string, site: string): string {
  let fence = false;
  return md
    .split("\n")
    .map((line) => {
      if (line.startsWith("```")) {
        fence = !fence;
        return line;
      }
      if (fence) return line;
      return line
        .split(/(`[^`]*`)/)
        .map((part, i) => (i % 2 ? part : part.replace(/\]\(((?:[^()\s]|\([^()\s]*\))+)((?: "[^"]*")?)\)/g, (_, href: string, title: string) => `](${absoluteUrl(href, pagePath, site)}${title})`)))
        .join("");
    })
    .join("\n");
}

const minus = (s: string) => s.replace(/^-/, "−");
const num = (v: number) => minus(Math.abs(v) >= 100 ? v.toFixed(0) : Math.abs(v) >= 10 ? v.toFixed(1) : v.toFixed(2));
const hz = (f: number) => (f < 10 ? f.toFixed(1) : f.toFixed(0));
const unitText = (u: string) => (u ? ` ${u}` : "");

/** The largest and smallest finite values of a curve, with where they fall. */
function extremes(x: number[], y: number[]): { max: { x: number; y: number } | null; min: { x: number; y: number } | null } {
  let max: { x: number; y: number } | null = null;
  let min: { x: number; y: number } | null = null;
  for (let i = 0; i < y.length; i++) {
    const v = y[i]!;
    if (!Number.isFinite(v) || !Number.isFinite(x[i]!)) continue;
    if (!max || v > max.y) max = { x: x[i]!, y: v };
    if (!min || v < min.y) min = { x: x[i]!, y: v };
  }
  return { max, min };
}

/** The impedance curve's peaks (largest three, by frequency) and the dip between the first two (a ported box's tuning). */
function peaksOf(x: number[], y: number[]): { peaks: { x: number; y: number }[]; dip: { x: number; y: number } | null } {
  const { max, min } = extremes(x, y);
  if (!max || !min) return { peaks: [], dip: null };
  const floor = min.y + 0.15 * (max.y - min.y);
  const found: { i: number; x: number; y: number }[] = [];
  for (let i = 1; i < y.length - 1; i++) if (y[i]! > y[i - 1]! && y[i]! >= y[i + 1]! && y[i]! >= floor) found.push({ i, x: x[i]!, y: y[i]! });
  const top = found.sort((a, b) => b.y - a.y).slice(0, 3).sort((a, b) => a.x - b.x);
  let dip: { x: number; y: number } | null = null;
  if (top.length >= 2) {
    let at = top[0]!.i;
    for (let i = top[0]!.i; i <= top[1]!.i; i++) if (y[i]! < y[at]!) at = i;
    dip = { x: x[at]!, y: y[at]! };
  }
  return { peaks: top.map(({ x: px, y: py }) => ({ x: px, y: py })), dip };
}

const cell = (s: string) => s.replace(/\|/g, "\\|").replace(/\n/g, " ");
const row = (cells: string[]) => `| ${cells.map(cell).join(" | ")} |`;

/** One chart's key points as a Markdown table: a row per design (or curve), columns by the chart's kind. */
export function chartTable(d: ChartData): string {
  const at = (p: { x: number; y: number } | null, xu = "Hz") => (p ? `${num(p.y)} @ ${xu === "Hz" ? hz(p.x) : num(p.x)}${xu === "Hz" ? " Hz" : ""}` : "–");
  const curve = (s: ChartData["series"][number]) => (s.y ? extremes(s.x ?? s.y.map((_, i) => i), s.y) : { max: null, min: null });
  const f = (v: number | null) => (v === null ? "–" : hz(v));
  const u = d.unit;
  const head: string[] = ["Design"];
  const body: string[][] = [];
  const limit = (s: ChartData["series"][number]) => (s.over !== undefined ? `${num(s.over)}${unitText(u)}` : d.limits.length ? d.limits.map((l) => `${l.label} (${num(l.value)})`).join(", ") : "–");
  switch (d.kind) {
    case "response":
    case "spl":
      head.push("F3 (Hz)", "F6 (Hz)", `Peak (${u || "dB"} @ Hz)`);
      for (const s of d.series) body.push([s.label, f(s.f3), f(s.f6), at(curve(s).max)]);
      break;
    case "impedance":
      head.push(`Peaks (${u || "Ω"} @ Hz)`, `Dip between peaks, near Fb (${u || "Ω"} @ Hz)`);
      for (const s of d.series) {
        const p = s.y ? peaksOf(s.x ?? [], s.y) : { peaks: [], dip: null };
        body.push([s.label, p.peaks.length ? p.peaks.map((q) => at(q)).join("; ") : "–", at(p.dip)]);
      }
      break;
    case "excursion":
    case "port":
    case "pr":
    case "pressure":
      head.push(`Peak (${u} @ Hz)`, "Limit");
      for (const s of d.series) body.push([s.label, at(curve(s).max), limit(s)]);
      break;
    case "maxspl":
    case "maxvolts":
    case "maxamps":
      head.push("F3 (Hz)", `Highest (${u} @ Hz)`, `Lowest (${u} @ Hz)`);
      for (const s of d.series) body.push([s.label, f(s.f3), at(curve(s).max), at(curve(s).min)]);
      break;
    case "figure": {
      const xu = d.xUnit;
      head[0] = "Curve";
      head.push(`Highest (${u} @ ${xu})`, `Lowest (${u} @ ${xu})`);
      for (const s of d.series) body.push([s.label, at(curve(s).max, xu), at(curve(s).min, xu)]);
      break;
    }
    default:
      head.push("F3 (Hz)", "F6 (Hz)", `Peak (${u || "value"} @ Hz)`);
      for (const s of d.series) body.push([s.label, f(s.f3), f(s.f6), at(curve(s).max)]);
  }
  return [row(head), row(head.map(() => "---")), ...body.map(row)].join("\n");
}

/** A chart line (`![caption](chart:…)`) as its caption and a table per panel. */
function chartBlock(caption: string, panels: ChartData[]): string {
  const out = [`**Chart:** ${caption}`];
  for (const p of panels) {
    const label = p.label ?? (panels.length > 1 ? p.title : "");
    out.push("", ...(label ? [`*${label}* (${p.title})`, ""] : []), chartTable(p));
  }
  return out.join("\n");
}

const BUTTONS = /^(\[\[[^|\]]+\|[^\]]+\]\]\s*)+$/;
const CHART_LINE = /^!\[(.+)\]\(((?:chart|figure):[^)\s]+)(?: "([^"]*)")?\)\s*$/;

/**
 * A page's Markdown twin: its title, description and source line, then the body (placeholders
 * already filled) with charts as caption + table, buttons as links and every link absolute.
 */
export function toAiMarkdown(page: TwinPage, body: string, chartData: (src: string, title?: string) => ChartData[], o: { site: string; date: string }): string {
  const lines = body.replace(/\r\n/g, "\n").split("\n");
  // The body's own title line is replaced by the header.
  const h1 = lines.findIndex((l) => l.trim() !== "");
  if (h1 >= 0 && /^# /.test(lines[h1]!)) lines.splice(h1, 1);
  const out: string[] = [];
  let fence = false;
  for (const line of lines) {
    if (line.startsWith("```")) fence = !fence;
    if (fence || line.startsWith("```")) {
      out.push(line);
      continue;
    }
    const chart = CHART_LINE.exec(line);
    if (chart) {
      out.push(chartBlock(chart[1]!, chartData(chart[2]!, chart[3])));
      continue;
    }
    if (BUTTONS.test(line.trim())) {
      out.push([...line.matchAll(/\[\[([^|\]]+)\|([^\]]+)\]\]/g)].map((b) => `[${b[1]}](${b[2]})`).join(" · "));
      continue;
    }
    out.push(line.replace(/\[\[([^|\]]+)\|([^\]]+)\]\]/g, "[$1]($2)"));
  }
  const text = out.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  const head = `# ${page.title}\n\n> ${page.description}\n\nSource: ${o.site}${page.path} · Speaker Box Genius · built ${o.date}`;
  return absolutize(`${head}\n\n${text}`, page.path, o.site) + "\n";
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", rarr: "→", times: "×", minus: "−", ndash: "–", mdash: "—", ohm: "Ω", deg: "°", plusmn: "±", hellip: "…", middot: "·", ldquo: "“", rdquo: "”", lsquo: "‘", rsquo: "’" };
const decode = (s: string) => s.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (m, e: string) => (e[0] === "#" ? String.fromCodePoint(e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)) : (ENTITIES[e.toLowerCase()] ?? m)));

function inlineMd(html: string): string {
  return decode(
    html
      .replace(/<(strong|b)\b[^>]*>([\s\S]*?)<\/\1>/g, "**$2**")
      .replace(/<(em|i)\b[^>]*>([\s\S]*?)<\/\1>/g, "*$2*")
      .replace(/<code\b[^>]*>([\s\S]*?)<\/code>/g, "`$1`")
      .replace(/<a\b[^>]*\bhref="([^"]*)"[^>]*>([\s\S]*?)<\/a>/g, (_, h: string, t: string) => `[${t.replace(/<[^>]+>/g, "")}](${decode(h)})`)
      .replace(/<br\s*\/?>/g, " ")
      .replace(/<[^>]+>/g, ""),
  )
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * The HTML of a generated page section (the validation page's summary) as Markdown: headings,
 * paragraphs, lists and tables, links kept. A small subset on purpose; anything else is dropped to text.
 */
export function htmlToMarkdown(html: string): string {
  const tables: string[] = [];
  let s = html
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<table\b[\s\S]*?<\/table>/g, (t) => {
      const rows = [...t.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/g)].map((r) => [...r[1]!.matchAll(/<t[hd]\b[^>]*>([\s\S]*?)<\/t[hd]>/g)].map((c) => cell(inlineMd(c[1]!))));
      if (!rows.length) return "";
      const lines = [row(rows[0]!), row(rows[0]!.map(() => "---")), ...rows.slice(1).map(row)];
      return `\n\n\u0000${tables.push(lines.join("\n")) - 1}\u0000\n\n`;
    });
  s = s
    .replace(/<(h[1-4])\b[^>]*>([\s\S]*?)<\/\1>/g, (_, h: string, t: string) => `\n\n${"#".repeat(Number(h[1]))} ${inlineMd(t)}\n\n`)
    .replace(/<li\b[^>]*>([\s\S]*?)<\/li>/g, (_, t: string) => `\n- ${inlineMd(t)}`)
    .replace(/<\/(ul|ol)>/g, "\n\n")
    .replace(/<p\b[^>]*>([\s\S]*?)<\/p>/g, (_, t: string) => `\n\n${inlineMd(t)}\n\n`)
    .replace(/<(script|style)\b[\s\S]*?<\/\1>/g, "");
  s = s.replace(/<[^>]+>/g, "");
  return decode(s)
    .replace(/\u0000(\d+)\u0000/g, (_, i: string) => tables[Number(i)]!)
    .replace(/[ \t]+\n/g, "\n")
    .replace(/(\n- [^\n]*)\n\n(?=- )/g, "$1\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export const LLMS_SECTIONS = ["Guides", "Calculators", "Reference", "Optional"] as const;
export interface LlmsEntry {
  section: (typeof LLMS_SECTIONS)[number];
  title: string;
  description: string;
  /** The twin's path, or an absolute URL for a page with no twin. */
  link: string;
}

const oneLine = (s: string) => s.replace(/\s+/g, " ").trim();

/** llms.txt (llmstxt.org): the site in a line, then every twin by section. */
export function llmsTxt(entries: LlmsEntry[], site: string): string {
  const url = (l: string) => (SCHEME.test(l) ? l : `${site}${l}`);
  const sections = LLMS_SECTIONS.map((name) => {
    const list = entries.filter((e) => e.section === name);
    return list.length ? `## ${name}\n\n${list.map((e) => `- [${oneLine(e.title)}](${url(e.link)}): ${oneLine(e.description)}`).join("\n")}` : "";
  }).filter(Boolean);
  return [
    "# Speaker Box Genius",
    "",
    "> A free speaker box simulator in the browser: sealed, ported, passive radiator, bandpass and transmission line boxes, with guides and calculators.",
    "",
    "Speaker Box Genius is free, runs in the browser and needs no account. Its engine is checked against WinISD, Hornresp and an independent circuit simulation (SPICE). Every guide, calculator and reference page below is also written as plain Markdown, with each chart as a caption and a table of its key numbers.",
    "",
    sections.join("\n\n"),
    "",
  ].join("\n");
}

/** llms-full.txt: every twin, in llms.txt order, one file. */
export const llmsFull = (twins: Twin[]): string => twins.map((t) => t.md.trim()).join("\n\n---\n\n") + "\n";
