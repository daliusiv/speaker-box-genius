import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { isLocalHost, scrubValue, stripHash } from "../src/errorScrub.ts";

test("a design after the # never leaves in a crash report", () => {
  assert.equal(stripHash("https://speakerboxgenius.com/#v2.abc~def"), "https://speakerboxgenius.com/");
  assert.equal(stripHash("https://speakerboxgenius.com/guides/x/"), "https://speakerboxgenius.com/guides/x/");
  assert.equal(stripHash("at https://speakerboxgenius.com/#d=1 and http://a.b/c#x"), "at https://speakerboxgenius.com/ and http://a.b/c");
  assert.equal(stripHash("C# sharp"), "C# sharp", "a # that isn't in an address stays");
});

test("every string in the report is cleaned, however deep", () => {
  const props = {
    $current_url: "https://speakerboxgenius.com/#design",
    $exception_list: [{ value: "bad at https://speakerboxgenius.com/#x", stacktrace: { frames: [{ filename: "https://speakerboxgenius.com/assets/main.js", lineno: 3 }] } }],
    n: 1,
    none: null,
  };
  const out = scrubValue(props);
  assert.equal(out.$current_url, "https://speakerboxgenius.com/");
  assert.equal(out.$exception_list[0]!.value, "bad at https://speakerboxgenius.com/");
  assert.equal(out.$exception_list[0]!.stacktrace.frames[0]!.lineno, 3);
  assert.equal(out.none, null);
  assert.equal(props.$current_url, "https://speakerboxgenius.com/#design", "the original isn't changed");
  assert.doesNotMatch(JSON.stringify(out), /#/);
});

test("never from a local host", () => {
  assert.ok(isLocalHost("localhost") && isLocalHost("127.0.0.1"));
  assert.ok(!isLocalHost("speakerboxgenius.com"));
});

test("the reporter is cookieless, EU-hosted, masks clicks and records no screens or page views", () => {
  const src = readFileSync(new URL("../src/telemetry.ts", import.meta.url), "utf8");
  for (const s of [
    'api_host: "https://eu.i.posthog.com"',
    'persistence: "memory"',
    'person_profiles: "never"',
    "capture_exceptions: true",
    "capture_pageview: false",
    "mask_all_text: true",
    "mask_all_element_attributes: true",
    "capture_copied_text: false",
    "network_timing: false",
    "disable_session_recording: !usage",
    "session_recording: REPLAY",
    "enable_recording_console_log: false",
    "maskAllInputs: true",
    'blockSelector: \'a[href*="#"], input[type="range"]\'',
    "recordBody: false",
    "disable_surveys: true",
    "advanced_disable_flags: false",
    "advanced_disable_feature_flags: true",
    "advanced_disable_feature_flags_on_first_load: true",
    "save_referrer: false",
    "respect_dnt: true",
    "before_send: (event) => cleanEvent(event, usage)",
  ]) {
    assert.ok(src.includes(s), s);
  }
  assert.doesNotMatch(src, /maskTextSelector/, "replays show the app's text; only inputs are masked");
  assert.doesNotMatch(src, /cookieless_mode:/, "replay needs it off; memory persistence keeps cookies and storage out");
  assert.doesNotMatch(src, /phc_/, "the project token comes from the build, not the code");
  const main = readFileSync(new URL("../src/main.tsx", import.meta.url), "utf8");
  assert.match(main, /^(\/\/.*\n)*import [^\n]*"\.\/telemetry\.ts";/, "loaded before anything else");
});
