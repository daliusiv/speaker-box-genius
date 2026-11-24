import { test } from "node:test";
import assert from "node:assert/strict";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { treeDatabase } from "@sbg/headless";
import { createServer } from "../src/server.ts";

async function connect() {
  const server = createServer(treeDatabase());
  const client = new Client({ name: "test", version: "0" });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(a), client.connect(b)]);
  return client;
}

const json = (r: unknown) => JSON.parse(((r as { content: { text: string }[] }).content)[0]!.text);

test("lists the seven read-only tools, resources and the prompt", async () => {
  const c = await connect();
  const { tools } = await c.listTools();
  assert.deepEqual(tools.map((t) => t.name), ["search_drivers", "get_driver", "simulate", "suggest_boxes", "find_passive_radiators", "read_share_link", "box_volume"]);
  assert.ok(tools.every((t) => t.annotations?.readOnlyHint === true));
  const { resources } = await c.listResources();
  assert.deepEqual(resources.map((r) => r.uri), ["sbg://about", "sbg://schema/sim-request"]);
  const schema = await c.readResource({ uri: "sbg://schema/sim-request" });
  assert.equal(JSON.parse((schema.contents[0] as { text: string }).text).required[0], "driver");
  const p = await c.getPrompt({ name: "design_a_box", arguments: { driver: "Dayton RSS315HF-4", goal: "under 60 L" } });
  assert.match((p.messages[0]!.content as { text: string }).text, /RSS315HF-4.*under 60 L/s);
  assert.match(c.getInstructions() ?? "", /share_link/);
});

test("search → get → simulate → read the link back", async () => {
  const c = await connect();
  const found = json(await c.callTool({ name: "search_drivers", arguments: { query: "dayton rss315hf-4" } }));
  assert.equal(found.drivers[0].id, "dayton-audio/rss315hf-4");
  const rec = json(await c.callTool({ name: "get_driver", arguments: { id: "dayton-audio/rss315hf-4" } }));
  assert.equal(rec.brand, "Dayton Audio");
  assert.ok(rec.sources.length > 0 && rec.licence);
  const sim = await c.callTool({ name: "simulate", arguments: { driver: { id: "dayton-audio/rss315hf-4" }, drive: "rated", designs: [{ kind: "vented", vb_l: 60, fb_hz: 25 }] } });
  assert.ok(!sim.isError);
  const r = sim.structuredContent as { share_link: string; designs: { fb_hz: number; f3_hz: number }[] };
  assert.ok(Math.abs(r.designs[0]!.fb_hz - 25) < 0.1);
  const back = json(await c.callTool({ name: "read_share_link", arguments: { url: r.share_link } }));
  assert.equal(back.result.designs[0].f3_hz, r.designs[0]!.f3_hz);
  assert.equal(back.request.driver.id, "dayton-audio/rss315hf-4");
});

test("suggest_boxes sizes at the power rating and picks a PR", async () => {
  const c = await connect();
  const r = json(await c.callTool({ name: "suggest_boxes", arguments: { driver: { id: "dayton-audio/rss315hf-4" } } }));
  assert.equal(r.drive, "400 W");
  assert.deepEqual(r.designs.map((d: { kind: string }) => d.kind), ["Sealed", "Ported", "Passive radiators"]);
  assert.ok(r.notes.some((n: string) => / × .*added each/.test(n)), r.notes.join("\n"));
});

test("find_passive_radiators ranks PRs that pass", async () => {
  const c = await connect();
  const r = json(await c.callTool({ name: "find_passive_radiators", arguments: { driver: { id: "dayton-audio/rss315hf-4" }, vb_l: 60, fb_hz: 24 } }));
  assert.ok(r.passing > 0);
  assert.ok(r.results.every((x: { ok: boolean }) => x.ok));
  assert.ok(Math.abs(r.results[0].fb_hz - 24) < 0.5);
});

test("box_volume matches the volume calculator", async () => {
  const c = await connect();
  const r = json(await c.callTool({ name: "box_volume", arguments: { shape: { kind: "box", width_cm: 40, height_cm: 50, depth_cm: 45 }, wall_mm: 18, drivers: { count: 1, displacement_l: 1.8 } } }));
  // (40 − 3.6) × (50 − 3.6) × (45 − 3.6) cm³ = 69.92 L, less the driver.
  assert.equal(r.gross_l, 69.92);
  assert.equal(r.net_l, 68.12);
});

test("mistakes come back as errors the model can fix", async () => {
  const c = await connect();
  const bad = await c.callTool({ name: "simulate", arguments: { driver: { id: "dayton-audio/rss315hf-4" }, designs: [{ kind: "vented", vb: 60 }] } });
  assert.ok(bad.isError);
  assert.match((bad.content as { text: string }[])[0]!.text, /did you mean `vb_l`/);
  const missing = await c.callTool({ name: "simulate", arguments: { driver: { id: "dayton-audio/rss315hf4" }, designs: [{ kind: "sealed", vb_l: 40 }] } });
  assert.ok(missing.isError);
  assert.match((missing.content as { text: string }[])[0]!.text, /Close ones: dayton-audio\/rss315hf-4/);
  const link = await c.callTool({ name: "read_share_link", arguments: { url: "https://example.com/" } });
  assert.ok(link.isError);
});
