import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const ROOT = fileURLToPath(new URL("../../..", import.meta.url));
const CLI = fileURLToPath(new URL("../src/cli.ts", import.meta.url));

test("runs over stdio as an AI app starts it", async () => {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: ["--experimental-strip-types", "--disable-warning=ExperimentalWarning", CLI, "mcp", "--db", ROOT],
    stderr: "pipe",
  });
  const client = new Client({ name: "stdio-test", version: "0" });
  await client.connect(transport);
  try {
    assert.equal(client.getServerVersion()?.name, "speaker-box-genius");
    const r = await client.callTool({ name: "simulate", arguments: { driver: { id: "dayton-audio/rss315hf-4" }, designs: [{ kind: "sealed", vb_l: 40 }] } });
    assert.ok(!r.isError);
    assert.match((r.structuredContent as { share_link: string }).share_link, /#z=/);
  } finally {
    await client.close();
  }
});
