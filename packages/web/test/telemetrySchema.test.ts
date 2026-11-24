import { test } from "node:test";
import assert from "node:assert/strict";
import { EXPORT_FORMATS } from "../src/formats/registry.ts";
import { browserSaysNo, cleanEvent, EXPORT_FORMAT_IDS, referrerBucket, USAGE_EVENTS } from "../src/telemetrySchema.ts";

const sdk = { $current_url: "https://speakerboxgenius.com/app/#v2.design", $browser: "Firefox", token: "phc_x", distinct_id: "$posthog_cookieless" };

test("crash reports always pass, with the design stripped from every address", () => {
  const e = cleanEvent({ event: "$exception", properties: { ...sdk, $exception_list: [{ value: "at https://speakerboxgenius.com/#x" }] } }, false)!;
  assert.equal(e.properties!.$current_url, "https://speakerboxgenius.com/app/");
  assert.equal(e.properties!.token, "phc_x", "the SDK's own keys stay");
  assert.doesNotMatch(JSON.stringify(e), /#/);
});

test("usage events leave only with usage stats on, and only if listed", () => {
  assert.ok(cleanEvent({ event: "design_added", properties: { box_type: "pr" } }, true));
  assert.equal(cleanEvent({ event: "design_added", properties: { box_type: "pr" } }, false), null);
  for (const ev of ["$autocapture", "$rageclick", "$dead_click", "$$heatmap", "$web_vitals", "$snapshot"]) {
    assert.ok(cleanEvent({ event: ev, properties: {} }, true), ev);
    assert.equal(cleanEvent({ event: ev, properties: {} }, false), null, ev);
  }
  for (const ev of ["$pageview", "$identify", "$set", "survey shown", "my_event"]) {
    assert.equal(cleanEvent({ event: ev, properties: {} }, true), null, ev);
  }
  assert.equal(cleanEvent(null, true), null);
});

test("free text can't leave: unknown keys and values off the list are dropped", () => {
  const e = cleanEvent(
    { event: "design_added", properties: { ...sdk, box_type: "pr", shape: "My big sub box", driver: "UM18-22", box_types: ["pr", "sealed"], design_count: 3, app_version: "1.2.0", site: "live" } },
    true,
  )!;
  const p = e.properties!;
  assert.equal(p.box_type, "pr");
  assert.equal(p.shape, undefined, "a value not in the list");
  assert.equal(p.driver, undefined, "a key not in the schema");
  assert.deepEqual(p.box_types, ["pr", "sealed"]);
  assert.equal(p.design_count, 3);
  assert.equal(p.app_version, "1.2.0");
});

test("context is checked on crash reports too", () => {
  const p = cleanEvent({ event: "$exception", properties: { box_types: ["pr", "my box"], design_count: -1, panel: "boxes", chart: "port", driver_source: "database", app_version: "a b" } }, true)!.properties!;
  assert.equal(p.box_types, undefined, "one bad member drops the list");
  assert.equal(p.design_count, undefined);
  assert.equal(p.app_version, undefined);
  assert.equal(p.panel, "boxes");
  assert.equal(p.chart, "port");
  assert.equal(p.driver_source, "database");
});

test("the export list matches the app's export formats", () => {
  assert.deepEqual([...EXPORT_FORMAT_IDS].sort(), EXPORT_FORMATS.map((f) => f.id).sort());
  assert.deepEqual(USAGE_EVENTS.export_done.format, EXPORT_FORMAT_IDS);
});

test("referrers become a bucket, never an address", () => {
  const own = "speakerboxgenius.com";
  assert.equal(referrerBucket("", own), "none");
  assert.equal(referrerBucket("https://old.reddit.com/r/diysound/comments/abc", own), "reddit");
  assert.equal(referrerBucket("https://www.diyaudio.com/community/threads/x.1/", own), "diyaudio");
  assert.equal(referrerBucket("https://www.google.co.uk/", own), "google");
  assert.equal(referrerBucket("https://example.org/page", own), "other");
  assert.equal(referrerBucket("not a url", own), "other");
  assert.equal(referrerBucket("https://speakerboxgenius.com/guides/x/", own), "site");
  assert.equal(referrerBucket("https://notgoogle.example/", own), "other");
});

test("Do Not Track or Global Privacy Control turns everything off", () => {
  assert.ok(browserSaysNo({ globalPrivacyControl: true }));
  assert.ok(browserSaysNo({ doNotTrack: "1" }));
  assert.ok(browserSaysNo({}, { doNotTrack: "1" }));
  assert.ok(!browserSaysNo({ doNotTrack: "0" }));
  assert.ok(!browserSaysNo({}));
});

test("named events: warnings, settings and imports carry only listed values", () => {
  const w = cleanEvent({ event: "warning_shown", properties: { warning: "port", box_type: "vented", design: "Sub 1" } }, true)!.properties!;
  assert.deepEqual([w.warning, w.box_type, w.design], ["port", "vented", undefined]);
  const s = cleanEvent({ event: "setting_changed", properties: { key: "match", preset: "winisd" } }, true)!.properties!;
  assert.deepEqual([s.key, s.preset], ["match", "winisd"]);
  assert.equal(cleanEvent({ event: "setting_changed", properties: { key: "ampWatts", value: 350 } }, true)!.properties!.value, undefined, "setting values never leave");
  const f = cleanEvent({ event: "import_failed", properties: { kind: "winisd", reason: "Unexpected token < in JSON" } }, true)!.properties!;
  assert.equal(f.reason, undefined, "an error message is not a reason code");
  assert.equal(cleanEvent({ event: "share_used", properties: { action: "image_copy" } }, true)!.properties!.action, "image_copy");
});

test("every rule in the schema is a non-empty list or a known kind", () => {
  for (const [ev, props] of Object.entries(USAGE_EVENTS)) {
    for (const [k, rule] of Object.entries(props)) {
      const ok = rule === "count" || rule === "version" || (Array.isArray(rule) && rule.length > 0 && rule.every((v) => typeof v === "string"));
      assert.ok(ok, `${ev}.${k}`);
    }
  }
});

test("replay snapshots leave only with usage stats on, with the design stripped from the page address", () => {
  const snap = { event: "$snapshot", properties: { ...sdk, $snapshot_data: [{ type: 4, data: { href: "https://speakerboxgenius.com/app/#v2.design" } }] } };
  assert.equal(cleanEvent(snap, false), null);
  const e = cleanEvent(snap, true)!;
  assert.doesNotMatch(JSON.stringify(e), /#v2/);
});
