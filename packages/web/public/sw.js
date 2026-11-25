/*
 * Service worker: makes the app and the driver database work offline.
 *
 * - The app (/ and share links, which live in the URL hash): network first, so a
 *   new deploy shows up on the next visit; the saved copy is used offline.
 * - Site pages (guides, drivers, validation …): network first, each saved under its
 *   own address in a separate cache, so a page read once opens offline too. One not
 *   saved yet gets a short "You're offline" page with a way back to the app. (Before
 *   v3 they were saved as the app, so a guide read online replaced the app offline.)
 * - Driver database (db/*.json): network first too, falling back to the saved
 *   copy (the app adds ?v=… version tags, so those are ignored when matching).
 * - Everything else (hashed JS/CSS, icons): cache first; their names change
 *   whenever their content does.
 *
 * On install, and whenever a fresh copy of the page arrives, the files the
 * page links to and the whole database are saved, so the app works offline
 * after a single visit. Files from old versions are removed.
 */
// Bump when files with unchanged names change (v2: the cool theme's icons; v3: drop
// copies where a site page had been saved as the app).
const CACHE = "sbg-v3";
/** Site pages read online, keyed by their path. */
const PAGES = "sbg-pages-v1";
const SCOPE = new URL("./", self.location).href;
const PAGE = SCOPE; // index.html
const APP_PATHS = new Set([new URL(SCOPE).pathname, new URL("index.html", SCOPE).pathname]);
/** Site pages the app's ☰ menu links to: saved with the app so they open offline too. */
const MENU_PAGES = ["drivers/", "guides/", "validation/", "about/", "privacy/"];
const STATIC = ["manifest.webmanifest", "icons/icon-192.png", "icons/icon-512.png", "icons/apple-touch-icon.png"];

/** A site page's address (ends in "/"), not a file. */
const isPage = (href) => new URL(href).pathname.endsWith("/");

/** Same-origin files a page links to (scripts, styles, icons, manifest; with `pages`, site pages too). */
function linkedFiles(html, pages = false) {
  const out = new Set();
  for (const m of html.matchAll(/(?:src|href)="([^"#]+)"/g)) {
    const url = new URL(m[1], PAGE);
    if (url.origin === self.location.origin && url.href.startsWith(SCOPE)) out.add(url.href);
  }
  out.delete(PAGE);
  return [...out].filter((href) => pages || !isPage(href));
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
  // Site pages the app links to (its menu, its footer), each under its own address.
  const pages = await caches.open(PAGES);
  const sitePages = new Set([...linkedFiles(html, true).filter(isPage), ...MENU_PAGES.map((p) => new URL(p, SCOPE).href)]);
  await Promise.all(
    [...sitePages].map(async (url) => {
      try {
        const r = await fetch(url, { cache: "no-cache" });
        if (r.ok && !r.redirected) await pages.put(url, r);
      } catch {
        /* offline: keep the old copy */
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
  // Remove build files (hashed JS/CSS) that neither the app nor a saved site page links to.
  const keep = new Set([PAGE, ...linked, ...STATIC.map((s) => new URL(s, SCOPE).href)]);
  for (const req of await pages.keys()) {
    const r = await pages.match(req);
    if (r) for (const url of linkedFiles(await r.text())) keep.add(url);
  }
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
      for (const name of await caches.keys()) if (name !== CACHE && name !== PAGES) await caches.delete(name);
      await self.clients.claim();
    })(),
  );
});

async function networkFirst(request, cacheKey, onFresh, cacheName = CACHE) {
  const cache = await caches.open(cacheName);
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

  if (request.mode === "navigate" && APP_PATHS.has(url.pathname)) {
    // The app; the hash (share links) never reaches the network.
    event.respondWith(
      networkFirst(request, PAGE, (r) => event.waitUntil(r.text().then((html) => refresh(html)))),
    );
  } else if (request.mode === "navigate") {
    // A site page: its own saved copy offline, never the app's.
    event.respondWith(
      networkFirst(request, url.origin + url.pathname, undefined, PAGES).catch(() => offlinePage()),
    );
  } else if (url.pathname.includes("/db/")) {
    event.respondWith(networkFirst(request, url.origin + url.pathname));
  } else {
    event.respondWith(cacheFirst(request));
  }
});

/** For a site page not saved on this device: say so, with the way back to the app. */
function offlinePage() {
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Offline · Speaker Box Genius</title><meta name="color-scheme" content="dark light">
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;font:16px/1.5 system-ui,sans-serif;background:#11141a;color:#e6e9ef}
main{max-width:26rem;padding:1.5rem;text-align:center}svg{color:#8b93a3}h1{font-size:1.3rem;margin:.75rem 0 .5rem}p{color:#8b93a3;margin:0 0 1.25rem}
a,button{display:inline-flex;align-items:center;justify-content:center;min-height:44px;padding:0 1.1rem;border-radius:10px;font:inherit;font-weight:600;text-decoration:none;cursor:pointer}
a{background:#4ed7e9;color:#11141a;border:0}button{background:none;color:inherit;border:1px solid #282d37;margin-left:.5rem}
@media (prefers-color-scheme:light){body{background:#f6f7f9;color:#1b1e26}p,svg{color:#5b6372}button{border-color:#cfd4dc}}</style></head>
<body><main><svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h.01 M8.5 16.43a5 5 0 0 1 7 0 M5 12.86a10 10 0 0 1 5.17-2.69 M19 12.86a10 10 0 0 0-2.01-1.59 M2 8.82a15 15 0 0 1 4.18-2.65 M22 8.82a15 15 0 0 0-11.29-3.76 M2 2l20 20"/></svg>
<h1>You're offline</h1><p>This page isn't saved on this device yet. Pages you've opened before work offline, and so does the app.</p>
<a href="${SCOPE}">Back to the app</a><button type="button" onclick="location.reload()">Try again</button></main></body></html>`;
  return new Response(html, { status: 503, headers: { "Content-Type": "text/html; charset=utf-8" } });
}
