const CACHE_NAME = 'fluxio-v1';
const ASSETS = [
  './',
  './index.html',
  './app.js',
  './stations.js',
  './style.css',
  './manifest.json',
  './favicon.png',
  './logo.png',
  './icons/android/launchericon-192x192.png',
  './icons/android/launchericon-512x512.png',
  './icons/ios/180.png',
  './icons/ios/152.png',
  './icons/ios/120.png',
  './browserconfig.xml'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
    )).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  // Only handle GET requests
  if (req.method !== 'GET') return;
  event.respondWith(
    caches.match(req).then(cached => {
      if (cached) return cached;
      return fetch(req).then(res => {
        // Ensure the response is valid
        if (!res || res.status !== 200 || res.type === 'error') {
          return res;
        }
        // Only cache successful same-origin requests
        if (req.url.startsWith(self.location.origin)) {
          const copy = res.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(req, copy));
        }
        return res;
      }).catch(err => {
        // On network failure, return cached version or a fallback
        return caches.match(req).then(cached => cached || caches.match('./index.html'));
      });
    })
  );
});
