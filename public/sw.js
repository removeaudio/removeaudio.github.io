/*! RemoveAudio Unified Offline PWA + Cross-Origin Isolation Service Worker */
self.__REMOVEAUDIO_UNIFIED_SW__ = true;
importScripts('/coi-serviceworker.js');

const APP_CACHE = 'removeaudio-app-v1';
const FFMPEG_CACHE = 'removeaudio-ffmpeg-v1';

const APP_SHELL_URLS = [
  '/',
  '/how-to-use/',
  '/privacy/',
  '/hire-me/',
  '/manifest.webmanifest',
  '/favicon.svg',
  '/coi-serviceworker.js',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon-maskable-512.png',
  '/icons/apple-touch-icon.png',
];

const FFMPEG_WORKER_URLS = [
  '/ffmpeg/worker/worker.js',
  '/ffmpeg/worker/const.js',
  '/ffmpeg/worker/errors.js',
];

const FFMPEG_VARIANT_URLS = {
  'core-mt': [
    '/ffmpeg/core-mt/ffmpeg-core.js',
    '/ffmpeg/core-mt/ffmpeg-core.wasm',
    '/ffmpeg/core-mt/ffmpeg-core.worker.js',
  ],
  'core-st': [
    '/ffmpeg/core-st/ffmpeg-core.js',
    '/ffmpeg/core-st/ffmpeg-core.wasm',
  ],
};

function wrapCoi(response) {
  return typeof self.coiWrapResponse === 'function'
    ? self.coiWrapResponse(response)
    : response;
}

async function cacheUrlsResilient(cacheName, urls) {
  const cache = await caches.open(cacheName);
  const results = await Promise.allSettled(
    urls.map(async (url) => {
      const existing = await cache.match(url);
      if (existing) return;
      const response = await fetch(new Request(url, { cache: 'reload' }));
      if (response.ok) {
        await cache.put(url, response);
      }
    })
  );
  return results.every((r) => r.status === 'fulfilled');
}

async function isFfmpegCached(variant) {
  const key = variant === 'core-st' ? 'core-st' : 'core-mt';
  const urls = [...FFMPEG_WORKER_URLS, ...FFMPEG_VARIANT_URLS[key]];
  const cache = await caches.open(FFMPEG_CACHE);
  const matches = await Promise.all(urls.map((u) => cache.match(u)));
  return matches.every(Boolean);
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    cacheUrlsResilient(APP_CACHE, APP_SHELL_URLS).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  const keep = new Set([APP_CACHE, FFMPEG_CACHE]);
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => !keep.has(k)).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', (event) => {
  const data = event.data;
  if (!data || typeof data !== 'object') return;

  if (data.type === 'SKIP_WAITING') {
    self.skipWaiting();
    return;
  }

  if (data.type === 'CACHE_FFMPEG') {
    const variant = data.variant === 'core-st' ? 'core-st' : 'core-mt';
    const urls = [...FFMPEG_WORKER_URLS, ...FFMPEG_VARIANT_URLS[variant]];
    event.waitUntil(
      cacheUrlsResilient(FFMPEG_CACHE, urls).then(async (ok) => {
        const ready = ok && (await isFfmpegCached(variant));
        const clients = await self.clients.matchAll({ type: 'window' });
        for (const client of clients) {
          client.postMessage({ type: 'FFMPEG_CACHED', variant, ready });
        }
      })
    );
    return;
  }

  if (data.type === 'GET_OFFLINE_STATUS') {
    const variant = data.variant === 'core-st' ? 'core-st' : 'core-mt';
    event.waitUntil(
      isFfmpegCached(variant).then((cached) => {
        if (event.source && 'postMessage' in event.source) {
          event.source.postMessage({ type: 'OFFLINE_STATUS', variant, cached });
        }
      })
    );
  }
});

self.addEventListener('fetch', (event) => {
  const request = event.request;

  // Ignore non-GET requests
  if (request.method !== 'GET') return;

  // Guard against Chromium DevTools only-if-cached bug
  if (request.cache === 'only-if-cached' && request.mode !== 'same-origin') {
    return;
  }

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) {
    return;
  }

  // 1. FFmpeg WASM & Worker assets: Cache-First (large immutable binaries)
  if (url.pathname.startsWith('/ffmpeg/')) {
    event.respondWith(
      caches.open(FFMPEG_CACHE).then(async (cache) => {
        const cached = await cache.match(request, { ignoreSearch: true });
        if (cached) {
          return wrapCoi(cached);
        }
        const networkResponse = await fetch(request);
        if (networkResponse.ok) {
          cache.put(request, networkResponse.clone());
        }
        return wrapCoi(networkResponse);
      })
    );
    return;
  }

  // 2. Hashed Astro static bundles: Cache-First
  if (url.pathname.startsWith('/_astro/')) {
    event.respondWith(
      caches.open(APP_CACHE).then(async (cache) => {
        const cached = await cache.match(request);
        if (cached) {
          return wrapCoi(cached);
        }
        const networkResponse = await fetch(request);
        if (networkResponse.ok) {
          cache.put(request, networkResponse.clone());
        }
        return wrapCoi(networkResponse);
      })
    );
    return;
  }

  // 3. HTML Navigation requests: Network-First with Offline Cache Fallback
  if (request.mode === 'navigate') {
    event.respondWith(
      caches.open(APP_CACHE).then(async (cache) => {
        try {
          const networkResponse = await fetch(request);
          if (networkResponse.ok) {
            cache.put(request, networkResponse.clone());
          }
          return wrapCoi(networkResponse);
        } catch {
          const cached =
            (await cache.match(request, { ignoreSearch: true })) ||
            (await cache.match('/'));
          if (cached) {
            return wrapCoi(cached);
          }
          return new Response('Offline — please reconnect once to load RemoveAudio.', {
            status: 503,
            headers: { 'Content-Type': 'text/plain; charset=utf-8' },
          });
        }
      })
    );
    return;
  }

  // 4. Other same-origin static assets: Stale-While-Revalidate
  event.respondWith(
    caches.open(APP_CACHE).then(async (cache) => {
      const cached = await cache.match(request);
      const fetchPromise = fetch(request)
        .then((networkResponse) => {
          if (networkResponse.ok) {
            cache.put(request, networkResponse.clone());
          }
          return networkResponse;
        })
        .catch(() => null);

      if (cached) {
        return wrapCoi(cached);
      }

      const networkResponse = await fetchPromise;
      if (networkResponse) {
        return wrapCoi(networkResponse);
      }

      return new Response('', { status: 504 });
    })
  );
});
