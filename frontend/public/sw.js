// Bump on every deploy that must invalidate previously cached bundles.
const CACHE_NAME = 'cvboost-v5';
const PRECACHE = ['/', '/index.html'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE))
      .catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// --- Web push -------------------------------------------------------------
//
// `push` is only delivered when the tab is closed or backgrounded, which is the
// whole point: the in-app NotificationBell polls every 45s and cannot reach a
// user who is not looking at the page.
self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    // A non-JSON body still deserves a notification rather than a silent drop.
    payload = { title: 'CVBoost', body: event.data ? event.data.text() : '' };
  }

  const title = payload.title || 'CVBoost';
  const options = {
    body: payload.body || '',
    // A stable tag collapses repeats, so a burst of job alerts for one user
    // updates one notification instead of stacking several.
    tag: payload.tag || 'cvboost',
    data: { link: payload.link || '/' },
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    lang: payload.lang || 'en'
  };

  // vibrate is only honoured for certain; harmless where unsupported.
  if (self.Notification.prototype.vibrate) options.vibrate = [100, 50, 100];

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const link = (event.notification.data && event.notification.data.link) || '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // Focus an existing tab rather than opening a duplicate window.
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.navigate(link);
          return client.focus();
        }
      }
      return self.clients.openWindow(link);
    })
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  if (event.request.url.includes('/api/')) return;

  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  if (event.request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const response = await fetch(event.request);
        if (response && response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put('/', clone));
        }
        return response;
      } catch (err) {
        return (await caches.match('/index.html')) || new Response('', { status: 504 });
      }
    })());
    return;
  }

  // Content-hashed build assets are network-first, deliberately.
  //
  // Cache-first looks safe for hashed assets, and usually is: a new build
  // renames every file, so a cache miss is guaranteed. It stops being safe the
  // moment the network fails. A failed navigation falls back to the cached
  // shell, that shell names the previous entry chunk, and every chunk it
  // imports is cached as well — so the client boots an entire older build and
  // never revalidates any of it. A crash fixed in the new build stays broken
  // for that client indefinitely, which is exactly the failure this shape
  // causes. Network-first here means a client is never handed a bundle older
  // than the one the server is actually offering; the catch below still serves
  // from cache when the network is genuinely unreachable.
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith((async () => {
      try {
        const response = await fetch(event.request);
        if (response && response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      } catch (err) {
        const cached = await caches.match(event.request);
        if (cached) return cached;
        return new Response('', { status: 504 });
      }
    })());
    return;
  }

  event.respondWith((async () => {
    try {
      const cached = await caches.match(event.request);
      if (cached) return cached;

      const response = await fetch(event.request);
      if (response.status === 200) {
        const clone = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
      }
      return response;
    } catch (err) {
      return new Response('', { status: 504 });
    }
  })());
});
