/**
 * Where the database comes from on a machine with a file system: a repo checkout, or the public
 * site with a local cache. NODE ONLY (node:fs, node:os, node:path, global fetch); don't import
 * this file from browser code. The browser app has its own loader in packages/web/src/library.ts.
 *
 * The site source only ever sends GET requests for the public db files (index.json, <brand>.json),
 * with an If-None-Match header for the index. Nothing else leaves the machine.
 */
import { mkdirSync, readFileSync, renameSync, statSync, utimesSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { buildIndex, buildShards } from "../../db-tools/src/bundleData.ts";
import { loadDatabase, REPO_ROOT } from "../../db-tools/src/load.ts";
import type { Database, DbIndex, Shard } from "./database.ts";

export { REPO_ROOT };

/** A repo checkout (a folder holding drivers/ and passive-radiators/), read and validated on first use. */
export function treeDatabase(root: string = REPO_ROOT): Database {
  let loaded: { index: DbIndex; shards: Map<string, Shard> } | undefined;
  const load = () => {
    if (loaded) return loaded;
    const db = loadDatabase(root);
    if (db.errors.length > 0) throw new Error(`The database in ${root} has errors:\n${db.errors.join("\n")}`);
    loaded = {
      index: buildIndex(db) as unknown as DbIndex,
      shards: buildShards(db) as unknown as Map<string, Shard>,
    };
    return loaded;
  };
  return {
    label: root,
    index: async () => load().index,
    shard: async (brand) => {
      const s = load().shards.get(brand);
      if (!s) throw new Error(`No brand "${brand}" in the database`);
      return s;
    },
  };
}

export const DEFAULT_SITE_DB = "https://speakerboxgenius.com/db/";
const HOUR_MS = 60 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 15_000;
const UNREACHABLE =
  "Can't reach speakerboxgenius.com and nothing cached yet: run once online, or pass --db <repo checkout>";

/** Per-user cache folder: %LOCALAPPDATA% on Windows, else $XDG_CACHE_HOME or ~/.cache, + speaker-box-genius/db. */
export function defaultCacheDir(env: NodeJS.ProcessEnv = process.env, platform: string = process.platform): string {
  const root =
    platform === "win32"
      ? env.LOCALAPPDATA || join(homedir(), "AppData", "Local")
      : env.XDG_CACHE_HOME || join(homedir(), ".cache");
  return join(root, "speaker-box-genius", "db");
}

export interface SiteDatabaseOptions {
  /** Folder URL of the db files. Default https://speakerboxgenius.com/db/ */
  base?: string;
  cacheDir?: string;
  /** Use the cache only; never touch the network. */
  offline?: boolean;
  fetch?: typeof fetch;
  /** How long a cached index counts as fresh. Default 1 hour. */
  maxAgeMs?: number;
}

const BRAND_SLUG = /^[a-z0-9][a-z0-9-]*$/;

function readJson<T>(path: string): T | undefined {
  try {
    return JSON.parse(readFileSync(path, "utf8")) as T;
  } catch {
    return undefined;
  }
}

/** Write via a temp file and rename, so a reader (or a crash) never sees half a file. */
function writeAtomic(path: string, text: string) {
  const tmp = `${path}.${process.pid}.${Math.random().toString(36).slice(2)}.tmp`;
  writeFileSync(tmp, text);
  renameSync(tmp, path);
}

interface CachedIndex {
  etag?: string;
  index: DbIndex;
}
interface CachedShard {
  generated: string;
  shard: Shard;
}

/** The public site's database, with a local cache that also serves when the network is down. */
export function siteDatabase(opts: SiteDatabaseOptions = {}): Database {
  let base = opts.base ?? DEFAULT_SITE_DB;
  if (!base.endsWith("/")) base += "/";
  const cacheDir = opts.cacheDir ?? defaultCacheDir();
  const maxAge = opts.maxAgeMs ?? HOUR_MS;
  const doFetch = opts.fetch ?? fetch;
  const indexFile = join(cacheDir, "index.json");

  const get = (url: string, headers?: Record<string, string>) =>
    doFetch(url, { method: "GET", headers, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });

  let memo: { index: DbIndex; at: number } | undefined;
  let pending: Promise<DbIndex> | undefined;

  async function loadIndex(): Promise<DbIndex> {
    const cached = readJson<CachedIndex>(indexFile);
    if (opts.offline) {
      if (!cached) throw new Error(UNREACHABLE);
      return cached.index;
    }
    let ageMs = Infinity;
    if (cached) {
      try {
        ageMs = Date.now() - statSync(indexFile).mtimeMs;
      } catch {
        /* treat as stale */
      }
      if (ageMs >= 0 && ageMs < maxAge) return cached.index;
    }
    try {
      const r = await get(`${base}index.json`, cached?.etag ? { "If-None-Match": cached.etag } : undefined);
      if (r.status === 304 && cached) {
        const now = new Date();
        utimesSync(indexFile, now, now);
        return cached.index;
      }
      if (!r.ok) throw new Error(`index.json: ${r.status}`);
      const index = (await r.json()) as DbIndex;
      const etag = r.headers.get("etag") ?? undefined;
      mkdirSync(cacheDir, { recursive: true });
      writeAtomic(indexFile, JSON.stringify({ ...(etag ? { etag } : {}), index } satisfies CachedIndex));
      return index;
    } catch {
      if (cached) return cached.index; // any age beats nothing
      throw new Error(UNREACHABLE);
    }
  }

  const shardFetches = new Map<string, Promise<Shard>>();

  async function loadShard(brand: string, generated: string): Promise<Shard> {
    const file = join(cacheDir, `${brand}.json`);
    const cached = readJson<CachedShard>(file);
    if (cached && cached.generated === generated) return cached.shard;
    if (opts.offline) throw new Error(`Brand "${brand}" isn't cached and offline mode is on`);
    const r = await get(`${base}${brand}.json?v=${encodeURIComponent(generated)}`).catch(() => {
      throw new Error(`Can't reach speakerboxgenius.com to fetch brand "${brand}"`);
    });
    if (r.status === 404) throw new Error(`No brand "${brand}" in the database`);
    if (!r.ok) throw new Error(`${brand}.json: ${r.status}`);
    const shard = (await r.json()) as Shard;
    mkdirSync(cacheDir, { recursive: true });
    writeAtomic(file, JSON.stringify({ generated, shard } satisfies CachedShard));
    return shard;
  }

  const index = async () => {
    if (memo && (opts.offline || Date.now() - memo.at < maxAge)) return memo.index;
    pending ??= loadIndex()
      .then((i) => (memo = { index: i, at: Date.now() }).index)
      .finally(() => (pending = undefined));
    return pending;
  };

  return {
    label: opts.offline ? `cache ${cacheDir}` : base,
    index,
    shard: async (brand) => {
      if (!BRAND_SLUG.test(brand)) throw new Error(`No brand "${brand}" in the database`);
      const generated = (await index()).generated ?? "";
      const key = `${brand}@${generated}`;
      let p = shardFetches.get(key);
      if (!p) {
        p = loadShard(brand, generated);
        shardFetches.set(key, p);
        p.catch(() => shardFetches.delete(key));
      }
      return p;
    },
  };
}
