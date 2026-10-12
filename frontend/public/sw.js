/**
 * YT Music Online Player - Progressive Web App Service Worker
 *
 * Rules:
 * 1. Network-first with cache fallback for navigation requests (`mode === "navigate"`):
 *    - Updates the cached real app shell (`/`) upon successful 200 responses.
 *    - Serves the cached real app shell when offline, enabling full access to IndexedDB offline tracks.
 *    - Serves `/offline` ONLY if no cached app shell exists.
 * 2. Cache-first for immutable hashed static assets (`/_next/static/*`, `/icons/*`, `/manifest.webmanifest`).
 * 3. STRICT EXCLUSIONS:
 *    - Never intercept Range requests (byte streaming).
 *    - Never intercept `/api/stream/*`, `/api/files/*`, `/api/download/*`, `/api/health`, `/api/info`, `/api/search`.
 *    - Never intercept WebSockets (`/ws/*`).
 */

const CACHE_VERSION = "yt-music-v1";
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const SHELL_CACHE = `${CACHE_VERSION}-shell`;

const PRECACHE_ASSETS = [
  "/offline",
  "/manifest.webmanifest",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/maskable-512.png",
];

// Install: precache offline fallback and essential icons
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) => cache.addAll(PRECACHE_ASSETS))
      .then(() => self.skipWaiting()),
  );
});

// Activate: purge stale caches and claim clients immediately
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.map((key) => {
            if (key !== STATIC_CACHE && key !== SHELL_CACHE) {
              return caches.delete(key);
            }
          }),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

// Fetch: apply selective caching policies
self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // 1. Never intercept non-GET requests
  if (request.method !== "GET") {
    return;
  }

  // 2. Strict exclusions: byte Range requests, API routes, streaming, websocket
  if (
    request.headers.get("range") ||
    url.pathname.startsWith("/api/") ||
    url.pathname.startsWith("/ws")
  ) {
    return;
  }

  // 3. Navigation requests (HTML document): Network-first with cached shell fallback
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then(async (response) => {
          if (response.status === 200) {
            const copy = response.clone();
            const shellCache = await caches.open(SHELL_CACHE);
            // Cache root '/' as real app shell
            await shellCache.put("/", copy.clone());
            if (url.pathname !== "/") {
              await shellCache.put(request, copy);
            }
          }
          return response;
        })
        .catch(async () => {
          const shellCache = await caches.open(SHELL_CACHE);
          // 1st priority: cached real app shell so user has full app & offline tracks
          const cachedShell = (await shellCache.match("/")) || (await shellCache.match(request));
          if (cachedShell) {
            return cachedShell;
          }
          // 2nd priority: offline fallback page if no shell was ever cached
          const staticCache = await caches.open(STATIC_CACHE);
          const fallback = await staticCache.match("/offline");
          if (fallback) {
            return fallback;
          }
          return new Response("Offline", { status: 503, statusText: "Service Unavailable" });
        }),
    );
    return;
  }

  // 4. Static Next.js chunks & PWA icons: Cache-first
  if (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/icons/") ||
    url.pathname === "/manifest.webmanifest"
  ) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then(async (response) => {
          if (response.status === 200) {
            const cache = await caches.open(STATIC_CACHE);
            cache.put(request, response.clone());
          }
          return response;
        });
      }),
    );
    return;
  }

  // Default: pass through to network
});
