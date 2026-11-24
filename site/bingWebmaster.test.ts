import { test } from "node:test";
import assert from "node:assert/strict";
import { bingTime, byKey, formatBing, total, type BingRow } from "../scripts/bing-webmaster.ts";
import { windows } from "../scripts/search-console.ts";

const at = (day: string) => `/Date(${Date.parse(day + "T12:00:00Z")}-0800)/`;
const w = windows("2026-11-19");

test("bingTime reads .NET JSON dates and ISO dates", () => {
  assert.equal(bingTime("/Date(1316156400000-0700)/"), 1316156400000);
  assert.equal(bingTime("2026-11-01T00:00:00Z"), Date.parse("2026-11-01T00:00:00Z"));
});

test("totals count only the window's days", () => {
  const rows: BingRow[] = [
    { Date: at("2026-11-19"), Clicks: 3, Impressions: 30 },
    { Date: at("2026-10-23"), Clicks: 1, Impressions: 10 }, // first day of the current window
    { Date: at("2026-10-22"), Clicks: 5, Impressions: 50 }, // previous window
    { Date: at("2026-11-20"), Clicks: 9, Impressions: 90 }, // after the end
  ];
  assert.deepEqual(total(rows, w.current), { clicks: 4, impressions: 40 });
  assert.deepEqual(total(rows, w.previous), { clicks: 5, impressions: 50 });
});

test("byKey sums per query with impression-weighted position, most clicked first", () => {
  const rows: BingRow[] = [
    { Date: at("2026-11-01"), Query: "winisd online", Clicks: 1, Impressions: 10, AvgImpressionPosition: 4 },
    { Date: at("2026-11-08"), Query: "winisd online", Clicks: 2, Impressions: 30, AvgImpressionPosition: 8 },
    { Date: at("2026-11-08"), Query: "box calculator", Clicks: 5, Impressions: 20, AvgImpressionPosition: 2 },
    { Date: at("2026-09-01"), Query: "old", Clicks: 50, Impressions: 500, AvgImpressionPosition: 1 },
  ];
  const r = byKey(rows, w.current);
  assert.deepEqual(r.map((x) => x.key), ["box calculator", "winisd online"]);
  assert.equal(r[1].clicks, 3);
  assert.equal(r[1].position, 7);
});

test("formatBing: totals with change, pages as paths, escaped cells", () => {
  const md = formatBing({
    site: "https://speakerboxgenius.com/", ...w,
    traffic: [{ Date: at("2026-11-10"), Clicks: 4, Impressions: 100 }, { Date: at("2026-10-10"), Clicks: 2, Impressions: 50 }],
    queries: [{ Date: at("2026-11-10"), Query: "a|b", Clicks: 1, Impressions: 5, AvgImpressionPosition: 3 }],
    pages: [{ Date: at("2026-11-10"), Query: "https://speakerboxgenius.com/guides/port-tuning/", Clicks: 2, Impressions: 9, AvgImpressionPosition: 5 }],
  });
  assert.match(md, /\| Clicks \| 4 \| 2 \| \+100 % \|/);
  assert.match(md, /\| a\\\|b \| 1 \| 5 \| 20\.0 % \| 3\.0 \|/);
  assert.match(md, /\| \/guides\/port-tuning\/ \| 2 \|/);
});
