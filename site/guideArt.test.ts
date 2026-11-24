import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { guideSlug, parsePage, withArt, withHero } from "./build.ts";

// The guides' illustrations (site/img/guides/<slug>.svg): one look for all of them.
// The rules are in docs/writing-guides.md; this test is what holds them.
const ART = join(import.meta.dirname, "img", "guides");
const PAGES = join(import.meta.dirname, "pages");
const PALETTE = new Set(["#11141a", "#4ed7e9", "#fb923c", "#8b93a3"]);
const svgs = () => readdirSync(ART).filter((f) => f.endsWith(".svg"));
// The calculators' pictures on the /calculators/ hub follow the same rules.
const CALC_ART = join(import.meta.dirname, "img", "calculators");
const calcSvgs = () => readdirSync(CALC_ART).filter((f) => f.endsWith(".svg"));

test("guide art: every picture follows the style rules", () => {
  assert.ok(svgs().length > 0);
  for (const [dir, f] of [...svgs().map((f) => [ART, f]), ...calcSvgs().map((f) => [CALC_ART, f])] as [string, string][]) {
    const svg = readFileSync(join(dir, f), "utf8");
    assert.ok(statSync(join(dir, f)).size <= 20_000, `${f}: over 20 KB`);
    assert.match(svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="0 0 1200 630">/, `${f}: viewBox must be 0 0 1200 630`);
    assert.match(svg, /<rect width="1200" height="630" fill="#11141a"\/>/, `${f}: starts with the page background`);
    // Words go in the guide and its alt text; pictures stay drawings that need no fonts.
    for (const tag of ["text", "image", "script", "foreignObject", "style", "filter", "use", "linearGradient", "radialGradient"]) {
      assert.doesNotMatch(svg, new RegExp(`<${tag}\\b`), `${f}: no <${tag}>`);
    }
    assert.doesNotMatch(svg, /href=|url\(|data:/, `${f}: no links or embedded files`);
    for (const c of svg.match(/#[0-9a-fA-F]{3,8}\b/g) ?? []) assert.ok(PALETTE.has(c.toLowerCase()), `${f}: colour ${c} isn't one of ${[...PALETTE].join(", ")}`);
    for (const w of svg.match(/stroke-width="[^"]*"/g) ?? []) assert.ok(Number(/"(.*)"/.exec(w)![1]) >= 4, `${f}: ${w} is thinner than 4 (too faint as a phone thumbnail)`);
  }
});

test("guide art: every guide has a picture with its alt text, and every picture belongs to a guide", () => {
  const guides = readdirSync(PAGES).filter((f) => f.endsWith(".md")).map((f) => withArt(parsePage(readFileSync(join(PAGES, f), "utf8"), f), f));
  const slugs = new Set(guides.map(guideSlug));
  for (const f of svgs()) assert.ok(slugs.has(f.replace(/\.svg$/, "")), `${f}: no guide has that path`);
  for (const g of guides) assert.ok(g.thumb, `${g.path}: no picture: draw site/img/guides/${guideSlug(g)}.svg (docs/writing-guides.md)`);
  for (const g of guides) assert.ok(g.art && g.art.length >= 20 && /\.$/.test(g.art), `${g.path}: "art:" should be a sentence saying what the picture shows`);
  assert.throws(() => withArt(parsePage("---\ntitle: T\ndescription: D\npath: guides/no-such-guide\nart: A box.\n---\nbody")), /no site\/img\/guides\/no-such-guide\.svg/);
});

test("calculator art: every calculator on the hub has a picture, and every picture belongs to a calculator", async () => {
  const { CALCULATORS, calcSlug, hubCards } = await import("./calculators.ts");
  const slugs = new Set(CALCULATORS.map((c) => calcSlug(c.path)));
  assert.ok(calcSvgs().length > 0);
  for (const f of calcSvgs()) assert.ok(slugs.has(f.replace(/\.svg$/, "")), `${f}: no calculator has that path`);
  for (const s of slugs) assert.ok(calcSvgs().includes(`${s}.svg`), `/calculators/${s}/: no picture: draw site/img/calculators/${s}.svg (docs/writing-guides.md, The picture)`);
  const hub = hubCards();
  for (const s of slugs) assert.ok(hub.includes(`<img class="thumb" src="/guides/img/calculators/${s}.svg" alt=""`), `hub card for ${s} shows its picture`);
});

test("guide art: the banner goes after the intro, before the open buttons", () => {
  const page = { ...parsePage("---\ntitle: T\ndescription: D\npath: guides/x\nart: A box & a port.\n---\nbody"), thumb: "/guides/img/guides/x.svg" };
  const html = withHero('<h1>T</h1>\n<p class="lede">Intro.</p>\n<p class="cta"><a class="button" href="#">Open</a></p>', page);
  assert.match(html, /<p class="lede">Intro\.<\/p>\n<figure class="hero"><img src="\/guides\/img\/guides\/x\.svg" alt="A box &amp; a port\." width="1200" height="630"><\/figure>\n<p class="cta">/);
  assert.equal(withHero("<h1>T</h1>", { ...page, thumb: undefined }), "<h1>T</h1>");
});
