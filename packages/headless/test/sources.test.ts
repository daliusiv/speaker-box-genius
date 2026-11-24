import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { after, test } from "node:test";
import { buildIndex, buildShards } from "../../db-tools/src/bundleData.ts";
import { loadDatabase } from "../../db-tools/src/load.ts";
import { defaultCacheDir, siteDatabase, treeDatabase, type DbIndex } from "../src/index.ts";

const EXAMPLES = resolve(import.meta.dirname, "../../../docs/examples");
const tmp: string[] = [];
const tempDir = () => {
  const d = mkdtempSync(join(tmpdir(), "sbg-headless-"));
  tmp.push(d);
  return d;
};
after(() => tmp.forEach((d) => rmSync(d, { recursive: true, force: true })));

test("treeDatabase reads a checkout and hands out the bundle shapes", async () => {
  const db = treeDatabase(EXAMPLES);
  assert.equal(db.label, EXAMPLES);
  const index = await db.index();
  assert.equal(index.drivers[0]!.id, "example-audio/ex10-4");
  const shard = await db.shard("example-audio");
  assert.ok(shard.drivers["example-audio/ex10-4"]);
  assert.ok(shard.passiveRadiators["example-audio/ex10-pr"]);
  await assert.rejects(db.shard("nope"), /No brand "nope"/);
});

test("treeDatabase throws with the errors when the database is invalid", async () => {
  const root = tempDir();
  mkdirSync(join(root, "drivers", "bad-brand"), { recursive: true });
  writeFileSync(join(root, "drivers", "bad-brand", "broken.json"), "{ nope");
  await assert.rejects(treeDatabase(root).index(), /has errors[\s\S]*invalid JSON/);
});

test("defaultCacheDir follows the platform conventions", () => {
  assert.equal(defaultCacheDir({ XDG_CACHE_HOME: "/x" }, "linux"), join("/x", "speaker-box-genius", "db"));
  assert.equal(defaultCacheDir({ LOCALAPPDATA: "C:\\L" }, "win32"), join("C:\\L", "speaker-box-genius", "db"));
});

/** An in-process site serving the example database; counts requests and can be told to fail. */
async function startSite() {
  const gen = { value: "2026-01-01T00:00:00.000Z" };
  const db = loadDatabase(EXAMPLES);
  const requests: { method: string; url: string; inm?: string }[] = [];
  const state = { down: false };
  const server: Server = createServer((req, res) => {
    requests.push({ method: req.method!, url: req.url!, inm: req.headers["if-none-match"] as string | undefined });
    if (state.down) return void req.socket.destroy();
    const url = new URL(req.url!, "http://x");
    if (url.pathname === "/db/index.json") {
      const etag = `"${gen.value}"`;
      if (req.headers["if-none-match"] === etag) return void res.writeHead(304, { etag }).end();
      return void res.writeHead(200, { etag, "content-type": "application/json" }).end(JSON.stringify(buildIndex(db, gen.value)));
    }
    const brand = url.pathname.match(/^\/db\/([a-z0-9-]+)\.json$/)?.[1];
    const shard = brand ? buildShards(db).get(brand) : undefined;
    if (!shard) return void res.writeHead(404).end();
    res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify(shard));
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}/db/`;
  return { base, gen, requests, state, close: () => new Promise((r) => (server.closeAllConnections(), server.close(r))) };
}

test("siteDatabase: caches, honours maxAge, revalidates with ETag, survives outages", async () => {
  const site = await startSite();
  try {
    const cacheDir = tempDir();
    const mk = (maxAgeMs = 60_000) => siteDatabase({ base: site.base, cacheDir, maxAgeMs });

    // First fetch writes the cache; every request is a plain GET.
    const a = mk();
    const index = (await a.index()) as DbIndex;
    assert.equal(index.generated, site.gen.value);
    assert.ok(existsSync(join(cacheDir, "index.json")));
    assert.deepEqual(site.requests.map((r) => r.url), ["/db/index.json"]);
    const shard = await a.shard("example-audio");
    assert.ok(shard.drivers["example-audio/ex10-4"]);
    assert.equal(site.requests[1]!.url, `/db/example-audio.json?v=${encodeURIComponent(site.gen.value)}`);
    assert.ok(site.requests.every((r) => r.method === "GET"));
    assert.deepEqual(readdirSync(cacheDir).sort(), ["example-audio.json", "index.json"], "no temp files left behind");

    // A new instance within maxAge: no requests at all.
    const n = site.requests.length;
    const b = mk();
    await b.index();
    await b.shard("example-audio");
    assert.equal(site.requests.length, n);

    // Past maxAge: revalidates with If-None-Match, gets 304, keeps the cache (and touches it).
    const old = new Date(Date.now() - 3_600_000);
    utimesSync(join(cacheDir, "index.json"), old, old);
    const c = mk();
    assert.equal((await c.index()).generated, site.gen.value);
    assert.equal(site.requests.length, n + 1);
    assert.equal(site.requests.at(-1)!.inm, `"${site.gen.value}"`);
    await c.shard("example-audio");
    assert.equal(site.requests.length, n + 1, "brand file still valid for this generation");
    await mk().index();
    assert.equal(site.requests.length, n + 1, "the 304 refreshed the cache age");

    // Network down: stale cache is used, whatever its age.
    utimesSync(join(cacheDir, "index.json"), old, old);
    site.state.down = true;
    const d = mk();
    assert.equal((await d.index()).generated, site.gen.value);
    assert.ok((await d.shard("example-audio")).drivers["example-audio/ex10-4"]);
    site.state.down = false;

    // New generation: index replaced, brand refetched; an unknown brand is a clear error.
    site.gen.value = "2026-02-02T00:00:00.000Z";
    utimesSync(join(cacheDir, "index.json"), old, old);
    const m = site.requests.length;
    const e = mk();
    assert.equal((await e.index()).generated, site.gen.value);
    await e.shard("example-audio");
    assert.equal(site.requests.length, m + 2);
    assert.match(site.requests.at(-1)!.url, /example-audio\.json\?v=2026-02-02/);
    await assert.rejects(e.shard("no-such-brand"), /No brand "no-such-brand"/);
    await assert.rejects(e.shard("../etc"), /No brand/);
  } finally {
    await site.close();
  }
});

test("siteDatabase: nothing cached and no network gives the clear error", async () => {
  const site = await startSite();
  site.state.down = true;
  try {
    await assert.rejects(siteDatabase({ base: site.base, cacheDir: tempDir() }).index(), /Can't reach speakerboxgenius\.com and nothing cached yet.*--db <repo checkout>/);
  } finally {
    await site.close();
  }
});

test("siteDatabase: offline reads the cache only and never fetches", async () => {
  const never = (() => {
    throw new Error("fetch called");
  }) as unknown as typeof fetch;
  await assert.rejects(siteDatabase({ cacheDir: tempDir(), offline: true, fetch: never }).index(), /nothing cached yet/);

  const site = await startSite();
  try {
    const cacheDir = tempDir();
    const online = siteDatabase({ base: site.base, cacheDir });
    await online.index();
    await online.shard("example-audio");
    const n = site.requests.length;
    const off = siteDatabase({ base: site.base, cacheDir, offline: true, fetch: never, maxAgeMs: 0 });
    assert.ok((await off.index()).drivers.length > 0);
    assert.ok((await off.shard("example-audio")).drivers["example-audio/ex10-4"]);
    assert.equal(site.requests.length, n);
  } finally {
    await site.close();
  }
});
