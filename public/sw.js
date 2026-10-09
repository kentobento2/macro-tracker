// Service worker: lets the installed app open offline.
// Same-origin GETs are network-first with a cache fallback. Supabase and food APIs are
// cross-origin and never cached here — the app keeps its own offline copy of your log.
const CACHE = 'macro-tracker-v3';
const APP_SHELL = ['/', '/manifest.json', '/icon.png', '/icon-192.png', '/apple-touch-icon.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;

  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok) {
          const copy = response.clone();
          // Don't cache OAuth callback URLs (they carry one-time codes).
          const key = request.mode === 'navigate' ? url.pathname : request;
          caches.open(CACHE).then((cache) => cache.put(key, copy));
        }
        return response;
      })
      .catch(async () => {
        if (request.mode === 'navigate') {
          // Any page boots the same client-side app, so fall back to the cached shell.
          return (await caches.match(url.pathname)) || (await caches.match('/'));
        }
        return caches.match(request);
      })
  );
});
