const CACHE_NAME = 'fabsattire-shell-v18';

self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key.startsWith('fabsattire-') && key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.matchAll({ type: 'window' }))
      .then((clients) => clients.forEach((client) => client.postMessage({ type: 'FABSATTIRE_SW_READY' })))
  );
});

const isStaticAssetRequest = (url) => {
  return url.pathname.startsWith('/assets/') || /\.(?:js|css|png|jpe?g|gif|svg|webp|ico|woff2?|ttf|map|json|txt|wasm)$/i.test(url.pathname);
};

self.addEventListener('push', (event) => {
  if (!event.data) return;
  let payload = {};
  try {
    payload = event.data.json();
  } catch {
    payload = { notification: { body: event.data.text() } };
  }
  const data = payload.data || {};
  const notification = payload.notification || {};
  const title = notification.title || data.title || 'FABSATTIRE';
  const targetUrl = data.url || notification.data?.url || '/';
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
    if (windowClients.some(client => client.visibilityState === 'visible')) return;
    return self.registration.showNotification(title, {
      body: notification.body || data.body || 'You have a new marketplace update.',
      icon: notification.icon || '/logo.png',
      badge: notification.badge || '/favicon.svg',
      tag: notification.tag || data.tag || `fabsattire-${data.type || 'update'}`,
      data: { url: targetUrl },
      renotify: false,
    });
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  let targetUrl;
  try {
    targetUrl = new URL(event.notification.data?.url || '/', self.location.origin);
    if (targetUrl.origin !== self.location.origin) targetUrl = new URL('/', self.location.origin);
  } catch {
    targetUrl = new URL('/', self.location.origin);
  }
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async (windowClients) => {
    const client = windowClients.find(item => new URL(item.url).origin === self.location.origin);
    if (client) {
      await client.navigate(targetUrl.href);
      return client.focus();
    }
    return self.clients.openWindow(targetUrl.href);
  }));
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const requestUrl = new URL(event.request.url);
  if (requestUrl.origin !== self.location.origin) return;

  const isPublicDataRequest = ['/api/users', '/api/posts', '/api/promo-plans'].includes(requestUrl.pathname)
    || (!event.request.headers.has('Authorization')
      && ['/api/marketplace/feed', '/api/marketplace/trending'].includes(requestUrl.pathname));
  if (isPublicDataRequest) {
    event.respondWith(
      (async () => {
        try {
          const response = await fetch(event.request);
          if (response.ok) {
            const cache = await caches.open(CACHE_NAME);
            await cache.put(event.request, response.clone());
          } else {
            const cachedResponse = await caches.match(event.request);
            if (cachedResponse) return cachedResponse;
          }
          return response;
        } catch {
          return await caches.match(event.request) || new Response(
            JSON.stringify({ error: 'Marketplace data is unavailable offline.' }),
            { status: 503, headers: { 'Content-Type': 'application/json' } },
          );
        }
      })(),
    );
    return;
  }

  if (requestUrl.pathname.startsWith('/api/')) return;

  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          return response;
        })
        .catch(async () => await caches.match('/index.html') || new Response(
          '<!doctype html><title>Fabsattire is offline</title><p>Please reconnect and reload.</p>',
          { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } },
        ))
    );
    return;
  }

  if (isStaticAssetRequest(requestUrl)) {
    event.respondWith(
      fetch(event.request).catch(async () => await caches.match(event.request) || new Response('', {
        status: 503,
        statusText: 'Asset temporarily unavailable',
      }))
    );
    return;
  }

  event.respondWith(
    fetch(event.request).catch(async () => await caches.match('/index.html') || new Response('', { status: 503 }))
  );
});
