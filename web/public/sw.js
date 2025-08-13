// public/sw.js
const VERSION = "v3";
const STATIC_CACHE  = `impactqr-static-${VERSION}`;
const RUNTIME_CACHE = `impactqr-runtime-${VERSION}`;
const PRECACHE_URLS = ["/", "/manifest.webmanifest"];

self.addEventListener("install", (evt) => {
  self.skipWaiting();
  evt.waitUntil(caches.open(STATIC_CACHE).then((c) => c.addAll(PRECACHE_URLS)));
});

self.addEventListener("activate", (evt) => {
  evt.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => ![STATIC_CACHE, RUNTIME_CACHE].includes(k))
          .map((k) => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (evt) => {
  const req = evt.request;

  // Hanya tangani GET
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  const sameOrigin = url.origin === location.origin;

  // ❌ Jangan cache API, link download, atau request Range (file besar)
  if (
    url.pathname.startsWith("/api/") ||
    url.pathname.startsWith("/d/") ||
    req.headers.has("range")
  ) {
    return; // pass-through ke network
  }

  // 🔎 Navigasi (SPA) → network-first (fallback ke shell '/')
  if (req.mode === "navigate") {
    evt.respondWith(networkFirst(req));
    return;
  }

  // 📦 Asset statis → stale-while-revalidate
  if (
    sameOrigin &&
    (
      req.destination === "style" ||
      req.destination === "script" ||
      req.destination === "font" ||
      req.destination === "image" ||
      url.pathname.startsWith("/assets")
    )
  ) {
    evt.respondWith(staleWhileRevalidate(req));
    return;
  }

  // Lainnya (same-origin GET) → cache-first sederhana
  if (sameOrigin) {
    evt.respondWith(cacheFirst(req));
  }
});

// ---------- Helpers ----------
async function networkFirst(req) {
  try {
    const fresh = await fetch(req);
    const cache = await caches.open(RUNTIME_CACHE);
    cache.put(req, fresh.clone());
    return fresh;
  } catch {
    const cached = await caches.match(req) || (await caches.match("/"));
    return (
      cached ||
      new Response("Offline", { status: 503, statusText: "Offline" })
    );
  }
}

async function staleWhileRevalidate(req) {
  const cache = await caches.open(RUNTIME_CACHE);
  const cached = await cache.match(req);
  const fetching = fetch(req)
    .then((res) => {
      cache.put(req, res.clone());
      return res;
    })
    .catch(() => cached);
  return cached || fetching;
}

async function cacheFirst(req) {
  const cached = await caches.match(req);
  return cached || fetch(req);
}
