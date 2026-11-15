/* Service Worker PWA — Un Parco per Me */
const CACHE_NAME = 'un-parco-per-me-pwa-v1.5.0';

const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './apple-touch-icon.png',
  './icon-192.png',
  './icon-512.png',
];

const EXCLUDED_HOSTS = [
  'supabase.co',
  'openstreetmap.org',
  'overpass-api.de',
  'overpass.kumi.systems',
  'overpass.private.coffee',
  'wikimedia.org',
  'wikipedia.org',
  'sentry.io',
  'posthog.com',
];

const STATIC_EXT_RE = /\.(?:js|css|png|jpg|jpeg|webp|svg|ico|woff2?|ttf|otf|json)$/i;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) =>
        Promise.all(
          APP_SHELL.map((asset) =>
            cache.add(new Request(asset, { cache: 'reload' })).catch(() => undefined),
          ),
        ),
      )
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  let url;
  try {
    url = new URL(request.url);
  } catch {
    return;
  }

  if (url.origin !== self.location.origin) return;
  if (EXCLUDED_HOSTS.some((host) => url.hostname.includes(host))) return;
  if (url.pathname.endsWith('/sw.js')) return;

  // Navigazioni: Network-First per ricevere subito i nuovi deploy, con fallback offline all'App Shell.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response && response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(async () => {
          const cachedRoute = await caches.match(request);
          if (cachedRoute) return cachedRoute;
          const cachedIndex = await caches.match('./index.html');
          if (cachedIndex) return cachedIndex;
          return (await caches.match('./')) || Response.error();
        }),
    );
    return;
  }

  const isHashedBundle = url.pathname.includes('/_expo/static/');
  const isStaticAsset =
    isHashedBundle ||
    url.pathname.includes('/assets/') ||
    STATIC_EXT_RE.test(url.pathname);

  if (!isStaticAsset) return;

  if (isHashedBundle) {
    // Asset con hash immutabile: Cache-First.
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((response) => {
          if (response && response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          }
          return response;
        });
      }),
    );
    return;
  }

  // Manifest, icone, font: Stale-While-Revalidate.
  event.respondWith(
    caches.match(request).then((cached) => {
      const networkFetch = fetch(request)
        .then((response) => {
          if (response && response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => cached);

      return cached || networkFetch;
    }),
  );
});
