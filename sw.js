const CACHE_NAME = 'unpissed-v0.6.1.9.5';
const ASSETS = [
  './',
  './index.html',
  './privacy.html',
  './terms.html',
  './css/styles.css',
  './vendor/leaflet/leaflet.css',
  './vendor/leaflet/leaflet.js',
  './vendor/leaflet/images/marker-icon.png',
  './vendor/leaflet/images/marker-icon-2x.png',
  './vendor/leaflet/images/marker-shadow.png',
  './js/config.js',
  './js/vendor-fallback.js',
  './js/supabase-api.js',
  './js/app.js',
  './manifest.webmanifest',
  './assets/brand-mark.png',
  './assets/icon-192.png',
  './assets/icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      cache.addAll(ASSETS.map((asset) => new Request(asset, { cache: 'reload' })))
    )
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.map((key) => (key === CACHE_NAME ? null : caches.delete(key))))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const requestUrl = new URL(event.request.url);
  const isAppAsset = requestUrl.origin === self.location.origin;
  const isNavigation = event.request.mode === 'navigate';
  event.respondWith(
    caches.open(CACHE_NAME).then(async (cache) => {
      if (isAppAsset && isNavigation) {
        try {
          const fresh = await fetch(event.request);
          cache.put('./index.html', fresh.clone());
          return fresh;
        } catch {
          const cached = await caches.match('./index.html');
          return cached || caches.match('./');
        }
      }
      if (isAppAsset) {
        try {
          const fresh = await fetch(event.request);
          cache.put(event.request, fresh.clone());
          return fresh;
        } catch {
          const cached = await caches.match(event.request);
          return cached || caches.match('./index.html');
        }
      }
      const cached = await caches.match(event.request);
      return cached || fetch(event.request);
    })
  );
});
