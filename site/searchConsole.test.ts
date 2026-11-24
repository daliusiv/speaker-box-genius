import { test } from "node:test";
import assert from "node:assert/strict";
import { change, defaultEnd, formatReport, nearMisses, path, windows, type Row } from "../scripts/search-console.ts";

const row = (q: string, clicks: number, impressions: number, position: number): Row =>
  ({ keys: [q], clicks, impressions, ctr: impressions ? clicks / impressions : 0, position });

test("windows: 28 days ending on the end date, then the 28 before", () => {
  const { current, previous } = windows("2026-11-18");
  assert.deepEqual(current, { start: "2026-10-22", end: "2026-11-18" });
  assert.deepEqual(previous, { start: "2026-09-24", end: "2026-10-21" });
  assert.equal(defaultEnd(new Date("2026-11-21T10:00:00Z")), "2026-11-18");
});

test("change", () => {
  assert.equal(change(12, 10), "+20 %");
  assert.equal(change(5, 10), "−50 %");
  assert.equal(change(10, 10), "0 %");
  assert.equal(change(3, 0), "new");
  assert.equal(change(0, 0), "–");
});

test("near misses: page 1–2, often shown, rarely clicked", () => {
  const rows = [
    row("winisd online", 0, 300, 8.2), // in
    row("passive radiator calculator", 1, 120, 12), // in (0.8 %)
    row("speaker box genius", 40, 100, 1.2), // top position: out
    row("rare", 0, 20, 9), // too few impressions: out
    row("deep", 0, 500, 35), // page 4: out
    row("clicked", 5, 100, 6), // 5 % CTR: out
  ];
  assert.deepEqual(nearMisses(rows).map((r) => r.keys![0]), ["winisd online", "passive radiator calculator"]);
});

test("path", () => {
  assert.equal(path("https://speakerboxgenius.com/guides/port-tuning/"), "/guides/port-tuning/");
  assert.equal(path("https://speakerboxgenius.com"), "/");
});

test("formatReport: totals with change, escaped cells, query change vs before", () => {
  const md = formatReport({
    site: "sc-domain:speakerboxgenius.com",
    ...windows("2026-11-18"),
    totals: { current: row("", 30, 1000, 9), previous: row("", 20, 800, 11) },
    queries: [row("12|inch sub", 6, 100, 5), row("winisd", 2, 300, 8)],
    allQueries: [row("12|inch sub", 6, 100, 5), row("winisd", 2, 300, 8)],
    previousQueries: [row("winisd", 4, 200, 9)],
    pages: [row("https://speakerboxgenius.com/app/", 20, 400, 6)],
    devices: [row("MOBILE", 10, 500, 10)],
    countries: [row("ita", 3, 50, 7)],
    sitemaps: [{ path: "https://speakerboxgenius.com/sitemap.xml", lastDownloaded: "2026-11-17T03:00:00Z", errors: "0", warnings: "1", contents: [{ type: "web", submitted: "812" }] }],
  });
  assert.match(md, /^## Search Console 2026-11-18/);
  assert.match(md, /\| Clicks \| 30 \| 20 \| \+50 % \|/);
  assert.match(md, /\| 12\\\|inch sub \| 6 \| 100 \| 6\.0 % \| 5\.0 \| new \|/);
  assert.match(md, /\| winisd \| 2 \| 300 \| 0\.7 % \| 8\.0 \| −50 % \|/);
  assert.match(md, /\| \/app\/ \| 20 \|/);
  assert.match(md, /\| mobile \|/);
  assert.match(md, /\| ITA \|/);
  assert.match(md, /\| \/sitemap\.xml \| 2026-11-17 \| 0 \| 1 \| 812 \|/);
  assert.match(md, /Near misses[\s\S]*\| winisd \| 300 \|/);
});
