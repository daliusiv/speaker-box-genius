import { test } from "node:test";
import assert from "node:assert/strict";
import { absolutize, absoluteUrl, chartTable, htmlToMarkdown, llmsFull, llmsTxt, toAiMarkdown, twinPath } from "./aiDocs.ts";
import type { ChartData } from "./guideCharts.ts";

const SITE = "https://speakerboxgenius.com";

test("twinPath: the page's path without its slash, plus .md", () => {
  assert.equal(twinPath("/guides/port-tuning/"), "/guides/port-tuning.md");
  assert.equal(twinPath("/guides/"), "/guides.md");
  assert.equal(twinPath("/winisd-alternative/"), "/winisd-alternative.md");
  assert.throws(() => twinPath("/"));
});

test("absolutize: relative links, anchors and images, but not code or other schemes", () => {
  assert.equal(absoluteUrl("/guides/x/", "/a/", SITE), `${SITE}/guides/x/`);
  assert.equal(absoluteUrl("#sources", "/guides/x/", SITE), `${SITE}/guides/x/#sources`);
  assert.equal(absoluteUrl("img/a.png", "/guides/x/", SITE), `${SITE}/guides/img/a.png`);
  assert.equal(absoluteUrl("https://example.com/a", "/a/", SITE), "https://example.com/a");
  assert.equal(absoluteUrl("mailto:a@b.c", "/a/", SITE), "mailto:a@b.c");
  const md = "See [A](/guides/a/) and ![pic](img/p.svg) and [W](https://en.wikipedia.org/wiki/Passive_radiator_(speaker)).\n`[x](/code/)`\n```\n[y](/fence/)\n```";
  assert.equal(
    absolutize(md, "/guides/x/", SITE),
    `See [A](${SITE}/guides/a/) and ![pic](${SITE}/guides/img/p.svg) and [W](https://en.wikipedia.org/wiki/Passive_radiator_(speaker)).\n\`[x](/code/)\`\n\`\`\`\n[y](/fence/)\n\`\`\``,
  );
});

const data = (kind: string, series: ChartData["series"], extra: Partial<ChartData> = {}): ChartData => ({ kind, title: "T", unit: "mm", xUnit: "Hz", series, limits: [], ...extra });
const fr = [10, 20, 30, 40];

test("chartTable: a row per design, columns by chart kind", () => {
  const exc = chartTable(data("excursion", [{ label: "Sealed", x: fr, y: [1, 5, 3, 2], over: 12.3, f3: null, f6: null }, { label: "Ported", x: fr, y: [9, 4, 3, 2], f3: null, f6: null }], { limits: [{ label: "Xmax", value: 12.3 }] }));
  assert.match(exc, /^\| Design \| Peak \(mm @ Hz\) \| Limit \|\n\| --- \| --- \| --- \|\n\| Sealed \| 5\.00 @ 20 Hz \| 12\.3 mm \|\n\| Ported \| 9\.00 @ 10 Hz \| Xmax \(12\.3\) \|$/);
  const spl = chartTable(data("spl", [{ label: "A", x: fr, y: [80, 90, 91, 85], f3: 21.3, f6: 18.2 }], { unit: "dB" }));
  assert.match(spl, /\| A \| 21 \| 18 \| 91\.0 @ 30 Hz \|/);
  const imp = chartTable(data("impedance", [{ label: "Ported", x: [1, 2, 3, 4, 5, 6, 7], y: [4, 20, 6, 3, 5, 25, 8], f3: null, f6: null }], { unit: "Ω" }));
  assert.match(imp, /\| Ported \| 20\.0 @ 2\.0 Hz; 25\.0 @ 6\.0 Hz \| 3\.00 @ 4\.0 Hz \|/);
  assert.match(chartTable(data("air", [{ label: "A", x: null, y: null, f3: 30, f6: null }])), /\| A \| 30 \| – \| – \|/);
  assert.match(chartTable(data("figure", [{ label: "Curve one", x: fr, y: [-2, 1, 3, 0], f3: null, f6: null }], { unit: "dB" })), /\| Curve one \| 3\.00 @ 30 Hz \| −2\.00 @ 10 Hz \|/);
});

test("toAiMarkdown: header, charts as captions and tables, buttons as links, absolute links", () => {
  const md = toAiMarkdown(
    { title: "Port tuning", description: "Why.", path: "/guides/port-tuning/" },
    "# Port tuning\n\nIntro with [a guide](/guides/x/).\n\n[[Open the example|https://speakerboxgenius.com/#z=abc]]\n\n![A caption, orange line.](chart:ex/excursion)\n\n| a | b |\n|---|---|\n| 1 | 2 |",
    (src) => {
      assert.equal(src, "chart:ex/excursion");
      return [data("excursion", [{ label: "Box", x: fr, y: [1, 2, 3, 4], f3: null, f6: null }])];
    },
    { site: SITE, date: "2026-11-20" },
  );
  assert.match(md, /^# Port tuning\n\n> Why\.\n\nSource: https:\/\/speakerboxgenius\.com\/guides\/port-tuning\/ · Speaker Box Genius · built 2026-11-20\n\nIntro/);
  assert.equal(md.match(/^# /gm)?.length, 1, "the body's own title line is dropped");
  assert.match(md, /\[a guide\]\(https:\/\/speakerboxgenius\.com\/guides\/x\/\)/);
  assert.match(md, /\n\[Open the example\]\(https:\/\/speakerboxgenius\.com\/#z=abc\)\n/);
  assert.match(md, /\*\*Chart:\*\* A caption, orange line\.\n\n\| Design \| Peak \(mm @ Hz\) \| Limit \|/);
  assert.match(md, /\| a \| b \|\n\|---\|---\|\n\| 1 \| 2 \|\n$/);
});

test("htmlToMarkdown: headings, paragraphs, lists, tables and links of a generated section", () => {
  const md = htmlToMarkdown(
    '<h1>Validation</h1>\n<p class="lede">A &amp; B, <strong>bold</strong>.</p><!--volatile--><p>Built <a href="https://x.y/z"><code>abc</code></a>.</p><!--/volatile-->\n<h2 id="s">Summary</h2><div class="table"><table><thead><tr><th>Case</th><th>OK</th></tr></thead><tbody><tr><td><a href="#c1">One</a></td><td>✓</td></tr></tbody></table></div><ul>\n<li><strong>Max SPL.</strong> WinISD&rsquo;s &ldquo;max&rdquo;</li>\n<li>Two</li></ul>',
  );
  assert.equal(
    md,
    "# Validation\n\nA & B, **bold**.\n\nBuilt [`abc`](https://x.y/z).\n\n## Summary\n\n| Case | OK |\n| --- | --- |\n| [One](#c1) | ✓ |\n\n- **Max SPL.** WinISD’s “max”\n- Two",
  );
});

test("llmsTxt and llmsFull: llmstxt.org layout, twins joined", () => {
  const txt = llmsTxt(
    [
      { section: "Guides", title: "A", description: "About a.", link: "/guides/a.md" },
      { section: "Reference", title: "B", description: "About\nb.", link: "/about.md" },
      { section: "Optional", title: "Drivers", description: "All.", link: "https://speakerboxgenius.com/drivers/" },
    ],
    SITE,
  );
  assert.match(txt, /^# Speaker Box Genius\n\n> .+\n\n.+\n\n## Guides\n\n- \[A\]\(https:\/\/speakerboxgenius\.com\/guides\/a\.md\): About a\.\n\n## Reference\n\n- \[B\]\(https:\/\/speakerboxgenius\.com\/about\.md\): About b\.\n\n## Optional\n\n- \[Drivers\]\(https:\/\/speakerboxgenius\.com\/drivers\/\): All\.\n$/);
  assert.doesNotMatch(txt, /## Calculators/, "an empty section is left out");
  assert.equal(llmsFull([{ title: "A", description: "", path: "/a/", md: "# A\n" }, { title: "B", description: "", path: "/b/", md: "# B\n" }]), "# A\n\n---\n\n# B\n");
});
