import { test } from "node:test";
import assert from "node:assert/strict";
import { IMPORT_ACCEPT, PROJECT_EXT, ago, importKind, importUses } from "../src/formats/imports.ts";

test("files are recognised by name and first bytes", () => {
  assert.equal(importKind("My box.sbgenius", '{\n  "app": "speaker-box-genius",'), "project");
  assert.equal(importKind("Old.SBGENIUS", "{"), "project");
  // Older saves, and a project renamed to .txt to get past a forum's upload filter.
  assert.equal(importKind("My box.sbg.json", '{\n  "app": "speaker-box-genius",'), "project");
  assert.equal(importKind("My box.txt", '{\n  "app": "speaker-box-genius",'), "project");
  assert.equal(importKind("sub.owpr", "{"), "winisd");
  assert.equal(importKind("driver.json", '{ "specs": {} }'), "winisd");
  assert.equal(importKind("Box.WPR", "[Driver]"), "winisd");
  assert.equal(importKind("woofer.wdr", "[Driver]"), "winisd");
  assert.equal(importKind("sweep.zma", "10 5.6 3"), "measurement");
  assert.equal(importKind("export.txt", "[Box]\r\n"), "winisd");
  assert.equal(importKind("photo.jpg", ""), null);
});

test("an impedance sweep asks; a response file doesn't", () => {
  assert.deepEqual(importUses("a.zma"), ["measure-driver", "overlay-impedance"]);
  assert.deepEqual(importUses("a.frd"), ["overlay-response"]);
  assert.equal(importUses("a.txt").length, 3);
});

test("save times read as how long ago", () => {
  const now = Date.parse("2026-11-11T12:00:00Z");
  assert.equal(ago("2026-11-11T11:59:50Z", now), "just now");
  assert.equal(ago("2026-11-11T11:55:00Z", now), "5 min ago");
  assert.equal(ago("2026-11-11T09:00:00Z", now), "3 h ago");
  assert.equal(ago("2026-11-09T12:00:00Z", now), "2 days ago");
  assert.equal(ago("nonsense", now), "");
});

test("the file picker takes project files on phones too", () => {
  assert.equal(PROJECT_EXT, ".sbgenius");
  for (const t of [".sbgenius", "application/vnd.speakerboxgenius+json", "application/json", ".json"]) {
    assert.ok(IMPORT_ACCEPT.split(",").includes(t), t);
  }
});
