// cache-first offline shell; bump VERSION when assets change
const VERSION = 'ipet-2026.11.05-5';
const CORE = ['./', 'index.html', 'manifest.json'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(CORE)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  // music and video left to the browser itself: Safari asks for them in parts (Range) and stalls on a whole answer
  if (e.request.headers.has('range') || e.request.destination === 'audio' || e.request.destination === 'video' || /\.(m4a|mp3|mp4|webm)(\?|$)/.test(e.request.url)) return;
  e.respondWith(
    fetch(e.request)
      .then(res => { if (res.ok) { const copy = res.clone(); caches.open(VERSION).then(c => c.put(e.request, copy)); } return res; })
      .catch(() => caches.match(e.request))
  );
});
