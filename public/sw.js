/* VOXELSTRIKE service worker: network-first with cache fallback, so the
 * installed PWA keeps working offline but always picks up new deploys. */
const CACHE = 'voxelstrike-v1';

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(names.filter((n) => n !== CACHE).map((n) => caches.delete(n)));
      await self.clients.claim();
    })()
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || !req.url.startsWith(self.location.origin)) return;
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);
      try {
        const res = await fetch(req);
        if (res.ok) cache.put(req, res.clone());
        return res;
      } catch {
        const cached = await cache.match(req, { ignoreSearch: req.mode === 'navigate' });
        if (cached) return cached;
        return new Response('offline', { status: 503, statusText: 'offline' });
      }
    })()
  );
});
