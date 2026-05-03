const CACHE_NAME = 'tramiteya-v4';

// Archivos que NUNCA se cachean — siempre se leen frescos del APK/hosting
const NO_CACHE = ['/', '/index.html', '/main.js'];

// Archivos estáticos que sí se pueden cachear (imágenes, manifest)
const STATIC_ASSETS = [
  '/manifest.json',
  '/img/icon-192.png',
  '/img/icon-512.png'
];

// Instalar: cachear solo recursos estáticos, NO el shell HTML/JS
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting())
  );
});

// Activar: limpiar caches viejos y tomar control inmediato
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Fetch
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);

  // API calls y páginas especiales: pasar directo a la red, sin SW
  if (['services', 'orders', 'payments_init', 'payments_confirm', 'notify', 'config_public', 'health', 'admin_upload']
      .some(ep => url.pathname.includes(ep))
      || url.pathname.includes('mockpay.html')
      || url.pathname.includes('admin.html')) {
    return;
  }

  // Shell (index.html, main.js, raíz): SIEMPRE network-first — nunca cache
  // En APK la "red" es el WebViewAssetLoader que lee directamente del APK bundleado
  if (NO_CACHE.some(p => url.pathname === p || url.pathname === '')) {
    e.respondWith(
      fetch(e.request).catch(() => caches.match('/index.html'))
    );
    return;
  }

  // Recursos estáticos (imágenes, etc.): cache-first con fallback a red
  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;
      return fetch(e.request).then(response => {
        if (response.ok && url.origin === self.location.origin) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(e.request, clone));
        }
        return response;
      });
    })
  );
});
