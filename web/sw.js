const CACHE_NAME = 'tramiteya-v1';
const SHELL_ASSETS = [
  '/',
  '/index.html',
  '/main.js',
  '/manifest.json',
  '/img/icon-192.png',
  '/img/icon-512.png'
];

// Instalar: cachear shell de la app
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(SHELL_ASSETS))
      .then(() => self.skipWaiting())
  );
});

// Activar: limpiar caches viejos
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Fetch: network-first para API, cache-first para shell
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);

  // API calls, pagos y páginas de retorno: siempre a la red (sin cache)
  if (['services', 'orders', 'payments_init', 'payments_confirm', 'notify', 'config_public', 'health']
      .some(ep => url.pathname.includes(ep))
      || url.pathname.includes('return.html')
      || url.pathname.includes('mockpay.html')) {
    return;
  }

  // Shell assets: cache first, fallback a red
  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;
      return fetch(e.request).then(response => {
        // Cache responses válidas de mismo origen
        if (response.ok && url.origin === self.location.origin) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(e.request, clone));
        }
        return response;
      }).catch(() => {
        // Offline fallback para navegación
        if (e.request.mode === 'navigate') {
          return caches.match('/index.html');
        }
      });
    })
  );
});
