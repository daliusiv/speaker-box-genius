import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

/**
 * public/sw.js run against in-memory caches and a fake network: reading a site page online
 * must never replace the app's saved copy, and a site page not saved yet gets the offline page.
 */
const ORIGIN = "https://sbg.test";
const APP = `<!doctype html><title>App</title><script src="/assets/main-abc.js"></script><a href="/guides/">Guides</a>`;
const page = (title: string) => `<!doctype html><title>${title}</title>`;

function makeWorker() {
  const site: Record<string, string> = {
    "/": APP,
    "/assets/main-abc.js": "app()",
    "/guides/": page("Guides"),
    "/guides/port-tuning/": page("Port tuning"),
    "/drivers/": page("Drivers"),
    "/validation/": page("Validation"),
    "/about/": page("About"),
    "/privacy/": page("Privacy"),
    "/db/index.json": JSON.stringify({ brands: {} }),
  };
  let online = true;
  const stores = new Map<string, Map<string, Response>>();
  const key = (r: Request | string) => (typeof r === "string" ? r : r.url);
  const caches = {
    async open(name: string) {
      if (!stores.has(name)) stores.set(name, new Map());
      const m = stores.get(name)!;
      return {
        async match(r: Request | string, o?: { ignoreSearch?: boolean }) {
          let k = key(r);
          if (o?.ignoreSearch) k = k.split("?")[0]!;
          return m.get(k)?.clone();
        },
        async put(r: Request | string, res: Response) {
          m.set(key(r), res.clone());
        },
        async add(r: string) {
          const res = await fetchFn(r);
          m.set(r, res);
        },
        async addAll(rs: string[]) {
          for (const r of rs) m.set(r, await fetchFn(r));
        },
        async keys() {
          return [...m.keys()].map((u) => new Request(u));
        },
        async delete(r: Request | string) {
          return m.delete(key(r));
        },
      };
    },
    async keys() {
      return [...stores.keys()];
    },
    async delete(name: string) {
      return stores.delete(name);
    },
    async match(r: Request | string) {
      for (const m of stores.values()) {
        const hit = m.get(key(r));
        if (hit) return hit.clone();
      }
      return undefined;
    },
  };
  async function fetchFn(input: Request | URL | string): Promise<Response> {
    if (!online) throw new TypeError("Failed to fetch");
    const path = new URL(typeof input === "string" || input instanceof URL ? input : input.url).pathname;
    const body = site[path];
    return body === undefined ? new Response("missing", { status: 404 }) : new Response(body, { headers: { "Content-Type": "text/html" } });
  }
  const listeners: Record<string, (e: unknown) => void> = {};
  const self = {
    location: new URL(`${ORIGIN}/sw.js`),
    addEventListener: (t: string, f: (e: unknown) => void) => (listeners[t] = f),
    skipWaiting: async () => {},
    clients: { claim: async () => {} },
  };
  runInNewContext(readFileSync(new URL("../public/sw.js", import.meta.url), "utf8"), {
    self,
    caches,
    fetch: fetchFn,
    URL,
    Request,
    Response,
    Set,
    Promise,
    Object,
  });

  async function lifecycle(type: "install" | "activate") {
    const waits: Promise<unknown>[] = [];
    listeners[type]!({ waitUntil: (p: Promise<unknown>) => waits.push(p) });
    await Promise.all(waits);
  }
  /** A page navigation; resolves to the page's <title>. */
  async function navigate(path: string): Promise<{ title: string; status: number }> {
    let res: Promise<Response> | undefined;
    const waits: Promise<unknown>[] = [];
    const request = { url: `${ORIGIN}${path}`, method: "GET", mode: "navigate" };
    listeners.fetch!({ request, respondWith: (r: Promise<Response>) => (res = r), waitUntil: (p: Promise<unknown>) => waits.push(p) });
    const r = await res!;
    const html = await r.text();
    await new Promise((d) => setTimeout(d, 0));
    await Promise.all(waits);
    return { title: /<title>([^<]*)<\/title>/.exec(html)?.[1] ?? "", status: r.status };
  }
  return { lifecycle, navigate, setOnline: (v: boolean) => (online = v) };
}

test("a site page read online never replaces the app offline", async () => {
  const sw = makeWorker();
  await sw.lifecycle("install");
  await sw.lifecycle("activate");
  await sw.navigate("/");
  await sw.navigate("/guides/port-tuning/");
  sw.setOnline(false);
  assert.equal((await sw.navigate("/")).title, "App");
  assert.equal((await sw.navigate("/#share-link")).title, "App");
  assert.equal((await sw.navigate("/guides/port-tuning/")).title, "Port tuning");
});

test("the menu's site pages are saved with the app", async () => {
  const sw = makeWorker();
  await sw.lifecycle("install");
  await sw.lifecycle("activate");
  sw.setOnline(false);
  for (const [path, title] of [
    ["/guides/", "Guides"],
    ["/drivers/", "Drivers"],
    ["/validation/", "Validation"],
    ["/about/", "About"],
    ["/privacy/", "Privacy"],
  ]) {
    assert.equal((await sw.navigate(path!)).title, title);
  }
});

test("a site page not saved yet gets the offline page, with a way back to the app", async () => {
  const sw = makeWorker();
  await sw.lifecycle("install");
  await sw.lifecycle("activate");
  sw.setOnline(false);
  const r = await sw.navigate("/guides/port-tuning/");
  assert.equal(r.title, "Offline · Speaker Box Genius");
  assert.equal(r.status, 503);
});
