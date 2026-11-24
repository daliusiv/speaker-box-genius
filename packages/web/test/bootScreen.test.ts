import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// The "Loading the simulator…" text in index.html is replaced by the app. A vertical margin on it
// collapses through #root into <body>, so the whole page moved when the app started (CLS ~0.12 on
// computers). Padding keeps body at the top.
test("boot text spaces itself with padding, not a margin that moves body", () => {
  const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  const rule = /\.boot\{([^}]*)\}/.exec(html)?.[1];
  assert.ok(rule, "no .boot rule in index.html");
  const margin = /(?:^|;)margin:([^;]*)/.exec(rule)?.[1]?.trim().split(/\s+/) ?? [];
  assert.ok(margin.length === 0 || ["0", "0px"].includes(margin[0]!), `.boot margin-top must be 0, got "${margin.join(" ")}"`);
  assert.ok(!/margin-top:\s*[1-9]/.test(rule), ".boot has a margin-top");
});
