/*! RemoveAudio COI Service Worker helper — enables SharedArrayBuffer on GitHub Pages */
(() => {
  // 'credentialless' enables SharedArrayBuffer (crossOriginIsolated) while allowing
  // third-party analytics scripts (GTM / GA4) to load without CORP blocking.
  const COEP_CREDENTIALLESS = true;

  /**
   * Wraps any same-origin Response with Cross-Origin Isolation headers
   * (COOP + COEP + CORP) so SharedArrayBuffer works on static hosts like GitHub Pages.
   */
  function coiWrapResponse(response, credentialless = COEP_CREDENTIALLESS) {
    if (!response || response.status === 0) {
      return response;
    }

    // Preserve redirects untouched
    if (response.status >= 300 && response.status < 400) {
      return response;
    }

    const newHeaders = new Headers(response.headers);
    newHeaders.set(
      'Cross-Origin-Embedder-Policy',
      credentialless ? 'credentialless' : 'require-corp'
    );
    newHeaders.set('Cross-Origin-Opener-Policy', 'same-origin');
    newHeaders.set('Cross-Origin-Resource-Policy', 'cross-origin');

    const isNullBodyStatus =
      response.status === 204 ||
      response.status === 205 ||
      response.status === 304;

    return new Response(isNullBodyStatus ? null : response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: newHeaders,
    });
  }

  // Service Worker global scope
  if (typeof window === 'undefined') {
    self.coiWrapResponse = coiWrapResponse;

    // When imported by /sw.js, sw.js owns lifecycle & fetch handling (offline + COI unified).
    // When registered standalone, act as a standard COI-only service worker.
    if (!self.__REMOVEAUDIO_UNIFIED_SW__) {
      self.addEventListener('install', () => self.skipWaiting());
      self.addEventListener('activate', (event) => {
        event.waitUntil(self.clients.claim());
      });
      self.addEventListener('fetch', (event) => {
        const request = event.request;
        if (request.cache === 'only-if-cached' && request.mode !== 'same-origin') {
          return;
        }
        event.respondWith(
          fetch(request)
            .then((response) => coiWrapResponse(response, COEP_CREDENTIALLESS))
            .catch((error) => {
              console.error('[coi-serviceworker] Fetch error:', error);
              throw error;
            })
        );
      });
    }
    return;
  }

  // Browser Window scope — register unified offline + COI Service Worker (/sw.js)
  const RELOAD_GUARD_KEY = 'removeaudio_coi_reloaded';

  const coi = {
    shouldRegister: () => 'serviceWorker' in navigator && window.isSecureContext,
    isIsolated: () => Boolean(window.crossOriginIsolated),
    reloading: false,
  };

  window.coi = coi;

  if (window.crossOriginIsolated) {
    try {
      window.sessionStorage.removeItem(RELOAD_GUARD_KEY);
    } catch {
      // Ignore storage errors in restricted contexts
    }
  }

  if (!coi.shouldRegister()) {
    return;
  }

  let hasReloadedBefore = false;
  try {
    hasReloadedBefore = window.sessionStorage.getItem(RELOAD_GUARD_KEY) === '1';
  } catch {
    hasReloadedBefore = false;
  }

  const triggerOneTimeCoiReload = () => {
    if (window.crossOriginIsolated || hasReloadedBefore || coi.reloading) {
      return;
    }
    coi.reloading = true;
    try {
      window.sessionStorage.setItem(RELOAD_GUARD_KEY, '1');
    } catch {
      // Ignore storage errors
    }
    window.location.reload();
  };

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!window.crossOriginIsolated) {
      triggerOneTimeCoiReload();
    }
  });

  navigator.serviceWorker
    .register('/sw.js', { scope: '/' })
    .then((registration) => {
      if (registration.active && !navigator.serviceWorker.controller && !window.crossOriginIsolated) {
        triggerOneTimeCoiReload();
      }
      registration.addEventListener('updatefound', () => {
        const installing = registration.installing;
        if (!installing) return;
        installing.addEventListener('statechange', () => {
          if (installing.state === 'activated' && !window.crossOriginIsolated) {
            triggerOneTimeCoiReload();
          }
        });
      });
    })
    .catch((err) => {
      console.warn('[RemoveAudio] Service worker registration skipped:', err);
    });
})();
