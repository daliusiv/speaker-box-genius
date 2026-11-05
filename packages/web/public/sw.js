/*
 * Service worker: makes the app and the driver database work offline.
 *
 * - Pages (and share links, which live in the URL hash): network first, so a
 *   new deploy shows up on the next visit; the saved copy is used offline.
 * - Driver database (db/*.json): network first too, falling back to the saved
 *   copy (the app adds ?v=… version tags, so those are ignored when matching).
 * - Everything else (hashed JS/CSS, icons): cache first; their names change
 *   whenever their content does.
 *
 * On install, and whenever a fresh copy of the page arrives, the files the
 * page links to and the whole database are saved, so the app works offline
 * after a single visit. Files from old versions are removed.
 */
// Bump when files with unchanged names change (v2: the cool theme's icons).
const CACHE = "sbg-v2";
const SCOPE = new URL("./", self.location).href;
const PAGE = SCOPE; // index.html
const STATIC = ["manifest.webmanifest", "icons/icon-192.png", "icons/icon-512.png", "icons/apple-touch-icon.png"];

/** Same-origin files a page links to (scripts, styles, icons, manifest). */
function linkedFiles(html) {
  const out = new Set();
  for (const m of html.matchAll(/(?:src|href)="([^"#]+)"/g)) {
    const url = new URL(m[1], PAGE);
    if (url.origin === self.location.origin && url.href.startsWith(SCOPE)) out.add(url.href);
  }
  out.delete(PAGE);
  return [...out];
}

/** Save the page's files and the whole database; drop files no longer linked. */
async function refresh(html) {
  const cache = await caches.open(CACHE);
  const linked = linkedFiles(html);
  await Promise.all(
    linked.map(async (url) => {
      if (!(await cache.match(url))) {
        try {
          await cache.add(url);
        } catch {
          /* offline or missing: try again next time */
        }
      }
    }),
  );
  // Database: the index lists the brands; each brand is one file.
  try {
    const r = await fetch(new URL("db/index.json", SCOPE), { cache: "no-cache" });
    if (r.ok) {
      const index = await r.clone().json();
      await cache.put(new URL("db/index.json", SCOPE).href, r);
      await Promise.all(
        Object.keys(index.brands ?? {}).map(async (brand) => {
          const url = new URL(`db/${brand}.json`, SCOPE).href;
          try {
            const b = await fetch(url, { cache: "no-cache" });
            if (b.ok) await cache.put(url, b);
          } catch {
            /* keep the old copy */
          }
        }),
      );
    }
  } catch {
    /* offline: keep what we have */
  }
  // Remove build files (hashed JS/CSS) that the current page no longer links to.
  const keep = new Set([PAGE, ...linked, ...STATIC.map((s) => new URL(s, SCOPE).href)]);
  for (const req of await cache.keys()) {
    const url = req.url.split("?")[0];
    if (url.startsWith(new URL("assets/", SCOPE).href) && !keep.has(url)) await cache.delete(req);
  }
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      await cache.addAll(STATIC.map((s) => new URL(s, SCOPE).href)).catch(() => {});
      const r = await fetch(PAGE, { cache: "no-cache" });
      if (r.ok) {
        await cache.put(PAGE, r.clone());
        await refresh(await r.text());
      }
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      for (const name of await caches.keys()) if (name !== CACHE) await caches.delete(name);
      await self.clients.claim();
    })(),
  );
});

async function networkFirst(request, cacheKey, onFresh) {
  const cache = await caches.open(CACHE);
  try {
    const r = await fetch(request);
    if (r.ok) {
      await cache.put(cacheKey, r.clone());
      if (onFresh) onFresh(r.clone());
    }
    return r;
  } catch (err) {
    const hit = await cache.match(cacheKey, { ignoreSearch: true });
    if (hit) return hit;
    throw err;
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(request);
  if (hit) return hit;
  const r = await fetch(request);
  if (r.ok && r.type === "basic") await cache.put(request, r.clone());
  return r;
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || !url.href.startsWith(SCOPE)) return;

  if (request.mode === "navigate") {
    // All pages are the app; the hash (share links) never reaches the network.
    event.respondWith(
      networkFirst(request, PAGE, (r) => event.waitUntil(r.text().then((html) => refresh(html)))),
    );
  } else if (url.pathname.includes("/db/")) {
    event.respondWith(networkFirst(request, url.origin + url.pathname));
  } else {
    event.respondWith(cacheFirst(request));
  }
});
