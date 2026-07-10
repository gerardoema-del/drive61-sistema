/* Drive61 — Service Worker mínimo (habilita "instalar" y offline básico
   de la app del conductor). No interfiere con el panel admin: es
   network-first y solo cachea la app del conductor. */
const CACHE = 'drive61-cond-v1';
const ASSETS = ['/conductor.html', '/manifest.json'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).catch(()=>{}));
  self.skipWaiting();
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter(k=>k!==CACHE).map(k=>caches.delete(k)))));
  self.clients.claim();
});
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  // Solo gestiona los assets de la app del conductor; el resto pasa normal.
  if (ASSETS.includes(url.pathname)) {
    e.respondWith(
      fetch(e.request).then((r) => {
        const copy = r.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(()=>{});
        return r;
      }).catch(() => caches.match(e.request))
    );
  }
});
