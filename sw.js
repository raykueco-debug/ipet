// cache-first offline shell; bump VERSION when assets change
const VERSION = 'ipet-2026.10.29-3';
const CORE = ['./', 'index.html', 'manifest.json'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(CORE)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    fetch(e.request)
      .then(res => { if (res.ok) { const copy = res.clone(); caches.open(VERSION).then(c => c.put(e.request, copy)); } return res; })
      .catch(() => caches.match(e.request))
  );
});
