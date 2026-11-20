// Service worker de la Bitácora: permite instalar la app y abrirla aunque no haya señal.
// Cambia VERSION cuando quieras forzar que los celulares descarguen todo de nuevo.
const VERSION = 'bitacora-v1';
const ARCHIVOS_APP = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(VERSION).then((cache) => cache.addAll(ARCHIVOS_APP)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((claves) => Promise.all(claves.filter((c) => c !== VERSION).map((c) => caches.delete(c))))
      .then(() => self.clients.claim())
  );
});

// Dominios que se guardan en caché además de los archivos propios (librerías, fuentes y tiles del mapa).
const CACHEABLES = ['unpkg.com', 'fonts.googleapis.com', 'fonts.gstatic.com', 'www.gstatic.com', 'basemaps.cartocdn.com'];

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return; // subidas a Drive, Firebase, etc. pasan directo
  const url = new URL(req.url);

  // La página: primero la red (para recibir actualizaciones), si no hay señal la copia guardada.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((resp) => { const copia = resp.clone(); caches.open(VERSION).then((c) => c.put('./index.html', copia)); return resp; })
        .catch(() => caches.match('./index.html'))
    );
    return;
  }

  const propio = url.origin === self.location.origin;
  const externoCacheable = CACHEABLES.some((d) => url.hostname === d || url.hostname.endsWith('.' + d));
  // No tocamos Firestore (usa streaming), Nominatim ni Google Apps Script.
  if (!propio && !externoCacheable) return;
  if (url.hostname === 'www.gstatic.com' && !url.pathname.startsWith('/firebasejs/')) return;

  // Resto: responde rápido desde caché y actualiza en segundo plano.
  event.respondWith(
    caches.open(VERSION).then(async (cache) => {
      const guardado = await cache.match(req);
      const deRed = fetch(req).then((resp) => {
        if (resp && (resp.ok || resp.type === 'opaque')) cache.put(req, resp.clone());
        return resp;
      }).catch(() => guardado);
      return guardado || deRed;
    })
  );
});
