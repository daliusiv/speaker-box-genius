/**
 * SEAS importer.
 *
 * SEAS gave permission (9 Nov 2026) to include the Thiele/Small parameters of their
 * drivers under CC BY-NC-SA 4.0, credited to SEAS with a link to each product page.
 * They have no file to share: the values are in the PDF datasheets on seas.no. See
 * docs/data-permissions.md. robots.txt allows the product pages and /images/ (where
 * the datasheets are); it is checked again on every run.
 *
 *   node … seas.ts            read seas.no and write drivers/seas/*.json (and passive-radiators/seas/)
 *   node … seas.ts --dry-run  read and report only
 *
 * Needs `pdftotext` (poppler-utils). seas.no serves an incomplete certificate chain:
 * the workflow fetches the missing intermediate and passes it in NODE_EXTRA_CA_CERTS.
 *
 * Product pages list their specs as an image, so the numbers come from each driver's
 * English datasheet (`pdftotext -layout`), whose table reads "Label   value unit" in
 * two columns. Every entry links to its product page and datasheet. Tweeters are left
 * out; the series pages without a type (Orbit, Lotus, Vintage) get one from the data.
 */
import { execFileSync } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import https from "node:https";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { validateDriver, validatePassiveRadiator, type Driver, type PassiveRadiator } from "../../schema/src/index.ts";
import { checkConsistency } from "../../engine/src/ts.ts";
import { CONSISTENCY_ERROR, REPO_ROOT } from "./load.ts";
import { dropImplausible, firstNumber, keepExisting, reconcile, slugOf } from "./dayton.ts";

export const SITE = "https://www.seas.no";
export const PERMISSION_NOTE =
  "SEAS datasheet values, used with SEAS' permission (9 Nov 2026) under CC BY-NC-SA 4.0, credited to SEAS.";
const BRAND = "SEAS";
const BRAND_FILE = { name: BRAND, website: SITE, country: "NO" };

type Kind = Driver["type"] | "passive-radiator" | "coaxial" | "auto";

/** The site's product categories (Joomla category ids) and what each holds. Tweeters aren't listed. */
export const CATEGORIES: Record<number, { name: string; kind: Kind }> = {
  91: { name: "Exotic woofers", kind: "woofer" },
  93: { name: "Exotic full-range", kind: "full-range" },
  49: { name: "Excel woofers", kind: "woofer" },
  109: { name: "Excel midranges", kind: "midrange" },
  60: { name: "Excel coaxials", kind: "coaxial" },
  44: { name: "Prestige woofers", kind: "woofer" },
  46: { name: "Prestige midranges", kind: "midrange" },
  53: { name: "Prestige full-range", kind: "full-range" },
  52: { name: "Prestige coaxials", kind: "coaxial" },
  54: { name: "Prestige passive radiators", kind: "passive-radiator" },
  97: { name: "Extreme woofers", kind: "woofer" },
  98: { name: "Extreme passive radiators", kind: "passive-radiator" },
  100: { name: "Orbit", kind: "auto" },
  61: { name: "Lotus", kind: "auto" },
  25: { name: "Vintage", kind: "auto" },
};

const decode = (s: string) =>
  s
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ")
    .replace(/&rdquo;|&#8221;|&Prime;|&#8243;/g, "”")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();

/** Article links on a category page that belong to that category: article id → URL (the first seen). */
export function articleLinks(html: string, catid: number): Map<number, string> {
  const out = new Map<number, string>();
  for (const m of html.matchAll(/href="([^"]*view=article[^"]*)"/g)) {
    const href = m[1]!.replace(/&amp;/g, "&");
    if (/[?&](tmpl|print)=/.test(href)) continue;
    const id = href.match(/[?&]id=(\d+)/)?.[1];
    const cat = href.match(/[?&]catid=(\d+)/)?.[1];
    if (!id || Number(cat) !== catid) continue;
    if (!out.has(Number(id))) out.set(Number(id), new URL(href, SITE).toString());
  }
  return out;
}

/** Further pages of a category list (Joomla's start= / limitstart=). */
export function pageLinks(html: string, catid: number): string[] {
  const out = new Set<string>();
  for (const m of html.matchAll(/href="([^"]*view=category[^"]*)"/g)) {
    const href = m[1]!.replace(/&amp;/g, "&");
    if (href.match(/[?&]id=(\d+)/)?.[1] !== String(catid) || !/[?&](limit)?start=\d+/.test(href)) continue;
    out.add(new URL(href, SITE).toString());
  }
  return [...out];
}

export interface Article {
  title: string;
  catid?: number;
  pdf?: string;
  body: string;
}

/** Datasheet links to leave alone: Chinese editions, range brochures, papers. */
const NOT_A_DATASHEET = /[_-]cn\b|[_-]cn\.pdf|excel_datasheet|prestige_datasheet|white_?paper|app(lication)?_?note|press|kt_\d/i;

/** Title, category and English datasheet of a product (article) page. */
export function readArticle(html: string): Article {
  const title = decode(html.match(/<h2 itemprop="name">([\s\S]*?)<\/h2>/)?.[1] ?? html.match(/<title>([\s\S]*?)<\/title>/)?.[1] ?? "");
  const catid = Number(html.match(/class="category-name">[\s\S]*?view=category&(?:amp;)?id=(\d+)/)?.[1]) || undefined;
  const start = html.indexOf('itemprop="articleBody"');
  const bodyHtml = start >= 0 ? html.slice(start) : html;
  const pdfs = [...bodyHtml.matchAll(/href="([^"]+\.pdf)"/gi)].map((m) => m[1]!.replace(/&amp;/g, "&")).filter((u) => !NOT_A_DATASHEET.test(u));
  const pdf = pdfs.find((u) => /datasheet|data_sheet/i.test(u)) ?? pdfs[0];
  return {
    title,
    ...(catid ? { catid } : {}),
    ...(pdf ? { pdf: encodeURI(decodeURI(new URL(pdf, SITE).toString())) } : {}),
    body: decode(bodyHtml.slice(0, 20000)),
  };
}

/** "E0017-08S W18EX001" → code E0017-08S, name W18EX001; "X2-08 EXOTIC W8" → X2-08, Exotic W8. */
export function splitTitle(title: string): { code?: string; name: string } {
  const t = title.replace(/\s+/g, " ").trim();
  const m = t.match(/^([A-Z]{1,2}\d{1,5}\s?-\s?\d{2}[A-Z]?)\s+(.+)$/i);
  const name = (m ? m[2]! : t).replace(/\bEXOTIC\b/, "Exotic").trim();
  return m ? { code: m[1]!.replace(/\s/g, ""), name } : { name };
}

/** Labels in a SEAS datasheet table, each matching the start of a cell (the value follows). */
const LABELS = {
  nominal: /^Nominal Impedance\b/i,
  range: /^Recommended Frequency Range\b/i,
  re: /^(?:Voice Coil|DC) Resistance\b/i,
  le: /^Voice Coil Inductance\b/i,
  bl: /^Force Factor\b/i,
  fs: /^(?:Free Air Resonance|Resonance Frequency)\b/i,
  moving: /^Moving Mass\b/i,
  airLoad: /^Air Load Mass\b/i,
  cms: /^Suspension Compliance\b/i,
  sd: /^Effective (?:Piston|Cone|Radiating) Area\b/i,
  vas: /^(?:VAS|Equivalent Volume)\b/i,
  qms: /^QMS\b/i,
  qes: /^QES\b/i,
  qts: /^QTS\b/i,
  travel: /^Linear (?:Coil )?(?:Travel|Excursion)\b/i,
  maxTravel: /^Max(?:imum|\.)? (?:Coil )?(?:Travel|Excursion)\b/i,
  pe: /^Long Term (?:Max\.? )?Power(?: Handling)?\b/i,
} as const;
type Label = keyof typeof LABELS;

/**
 * The values in a datasheet's table. The text is `pdftotext -layout` output: two
 * label/value columns separated by runs of spaces. The first block wins (a coaxial's
 * woofer, if its table comes first).
 */
export function readTable(text: string): Partial<Record<Label, string>> {
  const out: Partial<Record<Label, string>> = {};
  for (const line of text.split("\n")) {
    const cells = line
      .trim()
      .split(/\s{2,}/)
      .map((c) => c.replace(/\(\s*p\s*-\s*p\s*\)/gi, "(p-p)").replace(/(\d)\s*,\s*(\d)/g, "$1.$2"))
      .filter(Boolean);
    for (let i = 0; i < cells.length; i++) {
      const cell = cells[i]!;
      for (const [key, re] of Object.entries(LABELS) as [Label, RegExp][]) {
        const m = cell.match(re);
        if (!m) continue;
        const rest = cell.slice(m[0].length).replace(/^[\s*:,]*(?:\(p-p\))?[\s*:]*/i, "").replace(/^In IEC Baffle\s*/i, "");
        let value = /\d/.test(rest) ? rest : undefined;
        if (value === undefined && i + 1 < cells.length && !Object.values(LABELS).some((r) => r.test(cells[i + 1]!))) value = cells[++i];
        if (value !== undefined && out[key] === undefined) out[key] = value.trim();
        break;
      }
    }
  }
  return out;
}

/** Nominal size from the description: '15cm (5”)', '8 inch', '6½"'. */
export function sizeFrom(text: string): number | undefined {
  const t = text.replace(/\s+/g, " ");
  const paren = t.match(/\d+(?:\.\d+)?\s?cm\s?\(\s?(\d+(?:[.,]\d+)?)(\s?½|\s\d\/\d)?\s?(?:["”″]|''|inch)/i);
  const inch = t.match(/\b(\d+(?:\.\d+)?)(½)?\s?(?:-\s?)?(?:inch\b|["”″])/i);
  const m = paren ?? inch;
  if (!m) return undefined;
  let v = Number(m[1]!.replace(",", "."));
  const frac = m[2]?.trim();
  if (frac === "½") v += 0.5;
  else if (frac) {
    const [a, b] = frac.split("/").map(Number);
    v += a! / b!;
  }
  return v >= 2 && v <= 21 ? v : undefined;
}

/** "60 - 3500 Hz" → [60, 3500]; "350 Hz - 10 kHz" → [350, 10000]. */
export function rangeHz(s: string | undefined): [number, number] | undefined {
  if (!s) return undefined;
  const [a, b] = s.split(/\s*[-–]\s*|\bto\b/);
  const lo = firstNumber(a);
  const hi = firstNumber(b);
  if (lo === undefined || hi === undefined) return undefined;
  const kHi = /khz/i.test(b!);
  // "1 - 5 kHz": the unit on the second number covers both.
  const kLo = /khz/i.test(a!) || (kHi && !/hz/i.test(a!));
  return [kLo ? lo * 1000 : lo, kHi ? hi * 1000 : hi];
}

/** A type for drivers on series pages that don't say (Orbit, Lotus, Vintage). */
export function guessType(range: [number, number] | undefined, size_in: number | undefined, fs: number): Driver["type"] {
  if (range && range[1] >= 15000 && (size_in === undefined || size_in <= 8)) return "full-range";
  if ((range && range[0] >= 150) || fs >= 150) return "midrange";
  return "woofer";
}

export interface Parsed {
  kind: "driver" | "passive-radiator" | "skip";
  reason?: string;
  notes: string[];
  model: string;
  driver?: Driver;
  pr?: PassiveRadiator;
}

const round = (v: number, d: number) => Math.round(v * 10 ** d) / 10 ** d;

/** mm/N, or µm/N converted. */
const cmsOf = (s: string | undefined) => {
  const v = firstNumber(s);
  return v === undefined ? undefined : /µm|μm|um\//i.test(s!) ? v / 1000 : v;
};

export function parseDatasheet(
  input: { title: string; kind: Kind; url: string; pdf: string; text: string; body?: string },
  retrieved: string,
): Parsed {
  const notes: string[] = [];
  const { code, name } = splitTitle(input.title);
  const model = name;
  const base = { notes, model };
  if (!model) return { kind: "skip", reason: "no model name", ...base };

  const s = readTable(input.text);
  const size_in = sizeFrom(input.text) ?? (input.body ? sizeFrom(input.body) : undefined);
  const sources: Driver["sources"] = [
    { kind: "datasheet", url: input.url, retrieved, note: `SEAS product page${code ? ` (${code})` : ""}. ${PERMISSION_NOTE}` },
    { kind: "datasheet", url: input.pdf, retrieved, note: "SEAS datasheet (PDF)." },
  ];

  const fs = firstNumber(s.fs);
  const sd = firstNumber(s.sd);
  const cms = cmsOf(s.cms);
  const vas = firstNumber(s.vas);
  const moving = firstNumber(s.moving);
  const airLoad = firstNumber(s.airLoad);
  const travel = firstNumber(s.travel);
  const maxTravel = firstNumber(s.maxTravel);
  const qms = firstNumber(s.qms);
  const found = () => Object.keys(s).join(", ") || "nothing";

  if (input.kind === "passive-radiator") {
    const mms = moving !== undefined ? round(moving + (airLoad ?? 0), 2) : undefined;
    const xmax = travel !== undefined ? round(travel / 2, 2) : maxTravel !== undefined ? round(maxTravel / 2, 2) : undefined;
    if (mms === undefined || sd === undefined || xmax === undefined)
      return { kind: "skip", reason: `passive radiator without moving mass, area and travel (found: ${found()})`, ...base };
    if (airLoad !== undefined) notes.push(`Mms ${mms} g is the published moving mass plus air load (${moving} + ${airLoad} g).`);
    notes.push(
      travel !== undefined
        ? `Xmax ${xmax} mm is half the published linear travel (${travel} mm peak to peak).`
        : `Xmax ${xmax} mm is half the published maximum travel (${maxTravel} mm peak to peak), not a linear limit.`,
    );
    const params: PassiveRadiator["params"] = { mms_g: mms, sd_cm2: sd, xmax_mm: xmax };
    if (fs !== undefined) params.fs = fs;
    if (qms !== undefined) params.qms = qms;
    if (vas !== undefined) params.vas_l = vas;
    if (cms !== undefined) params.cms_mm_per_n = cms;
    const pr: PassiveRadiator = {
      brand: BRAND,
      model,
      type: "passive-radiator",
      ...(size_in ? { size_in } : {}),
      params,
      sources,
      status: "community",
      ...(notes.length ? { notes: notes.join(" ") } : {}),
    };
    return { kind: "passive-radiator", pr, ...base };
  }

  const qes = firstNumber(s.qes);
  const re = firstNumber(s.re);
  const missing = Object.entries({ fs, qms, qes, vas, re, sd })
    .filter(([, v]) => v === undefined)
    .map(([key]) => key);
  if (missing.length) return { kind: "skip", reason: `missing ${missing.join(", ")} (found: ${found()})`, ...base };

  const ts: Driver["ts"] = { fs: fs!, qms: qms!, qes: qes!, vas_l: vas!, re: re!, sd_cm2: sd! };
  const qts = firstNumber(s.qts);
  if (qts !== undefined) ts.qts = qts;
  const le = firstNumber(s.le);
  if (le !== undefined) ts.le_mh = le;
  const bl = firstNumber(s.bl);
  if (bl !== undefined) ts.bl = bl;
  if (travel !== undefined) {
    ts.xmax_mm = round(travel / 2, 2);
    notes.push(`Xmax ${ts.xmax_mm} mm is half the published linear coil travel (${travel} mm peak to peak).`);
  }
  const pe = firstNumber(s.pe);
  if (pe !== undefined) ts.pe_w = pe;

  // SEAS lists moving mass without the air load and the air load (IEC baffle) beside it.
  // Mms includes both; if that disagrees with Fs and Cms but the bare figure agrees, keep the bare one.
  if (moving !== undefined) {
    const withAir = round(moving + (airLoad ?? 0), 2);
    const fromCms = cms !== undefined ? 1 / ((2 * Math.PI * fs!) ** 2 * (cms / 1000)) * 1000 : undefined;
    const near = (m: number) => fromCms !== undefined && Math.abs(m - fromCms) / fromCms < 0.05;
    if (airLoad !== undefined && !near(withAir) && near(moving)) {
      ts.mms_g = moving;
      notes.push(`Moving mass ${moving} g already agrees with Fs and Cms, so the air load (${airLoad} g) isn't added.`);
    } else {
      ts.mms_g = withAir;
      if (airLoad !== undefined) notes.push(`Mms ${withAir} g is the published moving mass plus air load (${moving} + ${airLoad} g).`);
    }
  }

  if (!reconcile(ts, cms, notes)) {
    return {
      kind: "skip",
      reason: `published values disagree (${checkConsistency(ts)
        .filter((i) => i.diff > CONSISTENCY_ERROR)
        .map((i) => i.message)
        .join("; ")})`,
      ...base,
    };
  }
  const physical: NonNullable<Driver["physical"]> = {};
  dropImplausible(ts, physical, notes, size_in);

  let type: Driver["type"];
  if (input.kind === "coaxial") {
    type = "midbass";
    notes.push("Coaxial: the woofer's parameters (the tweeter's are left out).");
  } else if (input.kind === "auto") {
    type = guessType(rangeHz(s.range), size_in, fs!);
    notes.push(`Type ${type} chosen from the recommended frequency range and size (the series page doesn't say).`);
  } else type = input.kind;

  const nominal = firstNumber(s.nominal) ?? (re! < 5 ? 4 : 8);
  const driver: Driver = {
    brand: BRAND,
    model,
    type,
    nominal_ohms: nominal,
    ...(size_in ? { size_in } : {}),
    ts,
    sources,
    status: "community",
    ...(notes.length ? { notes: notes.join(" ") } : {}),
  };
  return { kind: "driver", driver, ...base };
}

// ---------------------------------------------------------------------------
// robots.txt, crawling and writing
// ---------------------------------------------------------------------------

const UA = "SpeakerBoxGenius-importer/1.0 (+https://speakerboxgenius.com; data use permitted by SEAS)";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Disallowed path prefixes for our user agent (the "*" group, or one naming us). */
export function disallowed(robots: string): string[] {
  const groups: { agents: string[]; rules: string[] }[] = [];
  let cur: { agents: string[]; rules: string[] } | undefined;
  for (const raw of robots.split("\n")) {
    const line = raw.replace(/#.*/, "").trim();
    const m = line.match(/^([A-Za-z-]+)\s*:\s*(.*)$/);
    if (!m) continue;
    const [, field, value] = m;
    if (/^user-agent$/i.test(field!)) {
      if (!cur || cur.rules.length) groups.push((cur = { agents: [], rules: [] }));
      cur.agents.push(value!.toLowerCase());
    } else if (/^disallow$/i.test(field!) && cur && value) cur.rules.push(value);
  }
  const ours = groups.find((g) => g.agents.some((a) => a !== "*" && UA.toLowerCase().includes(a)));
  return (ours ?? groups.find((g) => g.agents.includes("*")))?.rules ?? [];
}

function get(url: string): Promise<{ status: number; body: Buffer; location?: string }> {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { "User-Agent": UA, Accept: "text/html,application/pdf;q=0.9,*/*;q=0.8" }, timeout: 60000 }, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (c: Buffer) => chunks.push(c));
      res.on("end", () => resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks), ...(res.headers.location ? { location: res.headers.location } : {}) }));
    });
    req.on("timeout", () => req.destroy(new Error(`timeout ${url}`)));
    req.on("error", reject);
  });
}

let blocked: string[] = [];
async function fetchBuf(url: string): Promise<Buffer> {
  const path = new URL(url).pathname + new URL(url).search;
  if (blocked.some((p) => path.startsWith(p))) throw new Error(`robots.txt disallows ${path}`);
  for (let attempt = 1; ; attempt++) {
    let r = await get(url);
    for (let hops = 0; r.status >= 300 && r.status < 400 && r.location && hops < 5; hops++) r = await get(new URL(r.location, url).toString());
    if (r.status >= 200 && r.status < 300) return r.body;
    if (attempt >= 3 || r.status === 404 || r.status === 403) throw new Error(`${r.status} ${url}`);
    await sleep(5000 * attempt);
  }
}

function pdfText(pdf: Buffer, dir: string): string {
  const file = join(dir, "sheet.pdf");
  writeFileSync(file, pdf);
  return execFileSync("pdftotext", ["-layout", "-enc", "UTF-8", file, "-"], { encoding: "utf8", maxBuffer: 16 << 20 });
}

/** Notes every entry of a kind gets: kept on the entry, left out of the "check these" list. */
const ROUTINE = [/half the published linear (coil )?travel/, /moving mass plus air load/, /^Coaxial:/];

async function main() {
  const dry = process.argv.includes("--dry-run");
  const delay = Number(process.env.DELAY_MS ?? 1500);
  const today = new Date().toISOString().slice(0, 10);
  const tmp = mkdtempSync(join(tmpdir(), "seas-"));

  blocked = disallowed((await fetchBuf(`${SITE}/robots.txt`)).toString("utf8"));
  console.log(`robots.txt disallows: ${blocked.join(" ") || "nothing"}`);

  // Every product article, by id, with the category whose page lists it.
  const articles = new Map<number, { url: string; catid: number }>();
  const perCategory: string[] = [];
  for (const [id, cat] of Object.entries(CATEGORIES)) {
    const catid = Number(id);
    const queue = [`${SITE}/index.php?option=com_content&view=category&id=${catid}`];
    const seenPages = new Set<string>();
    let n = 0;
    while (queue.length && seenPages.size < 10) {
      const url = queue.shift()!;
      if (seenPages.has(url)) continue;
      seenPages.add(url);
      let html: string;
      try {
        html = (await fetchBuf(url)).toString("utf8");
      } catch (e) {
        perCategory.push(`${cat.name}: ${(e as Error).message}`);
        break;
      } finally {
        await sleep(delay);
      }
      for (const [aid, aurl] of articleLinks(html, catid)) {
        if (!articles.has(aid)) n++;
        if (!articles.has(aid)) articles.set(aid, { url: aurl, catid });
      }
      queue.push(...pageLinks(html, catid).filter((u) => !seenPages.has(u)));
    }
    perCategory.push(`${cat.name}: ${n}`);
  }
  console.log(`${articles.size} product pages\n${perCategory.join("\n")}`);

  const parsed: { r: Parsed; url: string; code?: string }[] = [];
  const skipped: string[] = [];
  for (const { url, catid } of articles.values()) {
    try {
      const art = readArticle((await fetchBuf(url)).toString("utf8"));
      await sleep(delay);
      const kind = CATEGORIES[art.catid ?? catid]?.kind ?? CATEGORIES[catid]!.kind;
      const line = `[${art.title || url}](${url})`;
      if (!art.pdf) {
        skipped.push(`${line} — no datasheet link on the page`);
        continue;
      }
      const text = pdfText(await fetchBuf(art.pdf), tmp);
      await sleep(delay);
      const r = parseDatasheet({ title: art.title, kind, url, pdf: art.pdf, text, body: art.body }, today);
      if (r.kind === "skip") skipped.push(`${line} — ${r.reason}`);
      else parsed.push({ r, url, ...(splitTitle(art.title).code ? { code: splitTitle(art.title).code } : {}) });
    } catch (e) {
      skipped.push(`${url} — ${(e as Error).message}`);
    }
  }
  rmSync(tmp, { recursive: true, force: true });

  // Same name, different impedance (E0049-04S and E0049-08S W16NX001): add the SEAS code.
  const count = new Map<string, number>();
  for (const { r } of parsed) count.set(r.model, (count.get(r.model) ?? 0) + 1);

  const written: string[] = [];
  const adjusted: string[] = [];
  const seen = new Set<string>();
  for (const { r, url, code } of parsed) {
    const data = r.kind === "driver" ? r.driver! : r.pr!;
    if ((count.get(r.model) ?? 0) > 1 && code) data.model = `${r.model} (${code})`;
    const slug = slugOf(data.model);
    const line = `[${data.model}](${url})`;
    if (seen.has(slug)) continue;
    seen.add(slug);
    const errs = r.kind === "driver" ? validateDriver(data) : validatePassiveRadiator(data);
    if (errs.length) {
      skipped.push(`${line} — ${errs.join("; ")}`);
      continue;
    }
    written.push(line);
    const check = r.notes.filter((n) => !ROUTINE.some((re) => re.test(n)));
    if (check.length) adjusted.push(`${line} — ${check.join(" ")}`);
    if (!dry) {
      const dir = join(REPO_ROOT, r.kind === "driver" ? "drivers" : "passive-radiators", "seas");
      mkdirSync(dir, { recursive: true });
      const file = join(dir, `${slug}.json`);
      if (existsSync(file)) keepExisting(data, JSON.parse(readFileSync(file, "utf8")));
      if (!existsSync(join(dir, "_brand.json"))) writeFileSync(join(dir, "_brand.json"), JSON.stringify(BRAND_FILE, null, 2) + "\n");
      writeFileSync(file, JSON.stringify(data, null, 2) + "\n");
    }
  }

  const report = [
    `## SEAS import (${today})`,
    "",
    `Product pages found: ${articles.size}. Written: ${written.length}. Adjusted or noted: ${adjusted.length}. Skipped: ${skipped.length}.`,
    "",
    "Source: the English PDF datasheets linked from each product page on seas.no, used with SEAS' permission under CC BY-NC-SA 4.0 (see docs/data-permissions.md). Tweeters aren't read.",
    "",
    "Routine, noted on each entry: Mms is SEAS' moving mass plus the air load they list beside it; Xmax is half the published linear coil travel; coaxials keep the woofer's values.",
    "",
    "### Product pages per category",
    ...perCategory.map((x) => `- ${x}`),
    "",
    "### Adjusted or noted (check these against the datasheet)",
    ...(adjusted.length ? adjusted.map((x) => `- ${x}`) : ["- none"]),
    "",
    "### Skipped",
    ...(skipped.length ? skipped.map((x) => `- ${x}`) : ["- none"]),
    "",
  ].join("\n");
  writeFileSync(join(REPO_ROOT, "seas-import-report.md"), report);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, report);
  console.log(report);
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
