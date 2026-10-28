/* Offline app shell only: never cache Supabase requests or authenticated data. */
const CACHE = 'lemma-shell-@@BUILD_VERSION@@';
const SHELL = ['./', './index.html', './manifest.webmanifest', './icons/icon.svg'];
self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)));
  self.skipWaiting();
});
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((key) => key.startsWith('lemma-shell-') && key !== CACHE)
      .map((key) => caches.delete(key)));
    // Activation must not finish before this worker takes control of clients.
    await self.clients.claim();
  })());
});
self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;
  // Only the exact public files under this worker's registered scope are safe
  // to cache. Never cache arbitrary trailing-slash pages, account data or APIs.
  const base = new URL(self.registration.scope).pathname;
  const path = url.pathname;
  const isDocument = path === base || path === base + 'index.html';
  const isAsset = path === base + 'manifest.webmanifest' || path === base + 'icons/icon.svg';
  if (!isDocument && !isAsset) return;

  const remember = (response) => {
    if (response.ok) {
      const copy = response.clone();
      event.waitUntil(caches.open(CACHE).then((cache) => cache.put(request, copy)));
    }
    return response;
  };
  if (isDocument) {
    // Network-first for shell HTML; the install event is the only writer of
    // versioned document caches. An outgoing worker must never recreate its
    // retired cache while a replacement worker is claiming clients.
    event.respondWith(fetch(request).catch(() =>
      caches.match(request).then((cached) => cached || Response.error())));
  } else {
    // Static, public shell assets remain cache-first.
    event.respondWith(caches.match(request).then((cached) => cached ||
      fetch(request).then(remember)));
  }
});
