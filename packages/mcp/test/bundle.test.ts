// The published file (dist/sbg.mjs from `pnpm mcp:build`) runs on its own, outside the repo.
// Skipped when it hasn't been built; CI builds it first.
import { test } from "node:test";
import assert from "node:assert/strict";
import { copyFileSync, existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const DIST = fileURLToPath(new URL("../dist/", import.meta.url));
const ROOT = fileURLToPath(new URL("../../..", import.meta.url));
const built = existsSync(join(DIST, "sbg.mjs"));

test("the bundle answers over stdio from a folder of its own", { skip: !built && "run pnpm mcp:build first" }, async () => {
  const dir = mkdtempSync(join(tmpdir(), "sbg-bundle-"));
  copyFileSync(join(DIST, "sbg.mjs"), join(dir, "sbg.mjs"));
  const client = new Client({ name: "bundle-test", version: "0" });
  await client.connect(new StdioClientTransport({ command: process.execPath, args: [join(dir, "sbg.mjs"), "mcp", "--db", ROOT], cwd: dir, stderr: "pipe" }));
  try {
    const { tools } = await client.listTools();
    assert.equal(tools.length, 7);
    const r = await client.callTool({ name: "suggest_boxes", arguments: { driver: { id: "dayton-audio/rss315hf-4" }, kinds: ["vented"] } });
    assert.ok(!r.isError, JSON.stringify(r.content));
    assert.equal((r.structuredContent as { designs: { vb_l: number }[] }).designs[0]!.vb_l, 75.6);
  } finally {
    await client.close();
  }
});

test("the npm package and the Claude Desktop extension carry the same version", { skip: !existsSync(join(DIST, "npm/package.json")) && "run pnpm mcp:build first" }, () => {
  const pkg = JSON.parse(readFileSync(join(DIST, "npm/package.json"), "utf8"));
  const manifest = JSON.parse(readFileSync(join(DIST, "mcpb/manifest.json"), "utf8"));
  assert.equal(pkg.name, "speaker-box-genius");
  assert.equal(pkg.bin["speaker-box-genius"], "sbg.mjs");
  assert.equal(manifest.version, pkg.version);
  assert.deepEqual(manifest.tools.map((t: { name: string }) => t.name), ["search_drivers", "get_driver", "simulate", "suggest_boxes", "find_passive_radiators", "read_share_link", "box_volume"]);
});
