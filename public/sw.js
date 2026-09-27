const CACHE_NAME = 'fabrilux-atelier-v7';
const APP_SHELL = ['/index.html', '/manifest.webmanifest'];

const isStaticAssetRequest = (url) => {
  return url.pathname.startsWith('/assets/') || /\.(?:js|css|png|jpe?g|gif|svg|webp|ico|woff2?|ttf|map|json|txt|wasm)$/i.test(url.pathname);
};

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL).catch(() => undefined))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys
        .filter((key) => key !== CACHE_NAME)
        .map((key) => caches.delete(key))
    ))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const requestUrl = new URL(event.request.url);
  if (requestUrl.origin !== self.location.origin) return;

  if (requestUrl.pathname.startsWith('/api/')) {
    return;
  }

  const isPublicDataRequest = ['/api/users', '/api/posts', '/api/promo-plans'].includes(requestUrl.pathname);
  if (isPublicDataRequest) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response.ok) {
            const responseClone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseClone));
          }
          return response;
        })
        .catch(() => caches.match(event.request).then((cachedResponse) => cachedResponse || new Response('[]', { headers: { 'Content-Type': 'application/json' } })))
    );
    return;
  }

  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response.ok) {
            const responseClone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put('/index.html', responseClone));
          }
          return response;
        })
        .catch(() => caches.match('/index.html'))
    );
    return;
  }

  if (isStaticAssetRequest(requestUrl)) {
    event.respondWith(
      caches.match(event.request).then((cachedResponse) => {
        if (cachedResponse) return cachedResponse;
        return fetch(event.request).then((networkResponse) => {
          if (networkResponse.ok) {
            const responseClone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseClone));
          }
          return networkResponse;
        });
      })
    );
    return;
  }

  event.respondWith(
    fetch(event.request).catch(() => caches.match('/index.html'))
  );
});
