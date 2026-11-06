// cache-first offline shell; bump VERSION when assets change
const VERSION = 'ipet-2026.11.06-3';
const CORE = ['./', 'index.html', 'manifest.json'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(CORE)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
// push (link.js push, supabase/functions/notify): shown as it comes; tapped, the app it's for opened (or brought up)
self.addEventListener('push', e => {
  let m = {};
  try { m = e.data ? e.data.json() : {}; } catch (err) { m = { body: e.data && e.data.text() }; }
  e.waitUntil(self.registration.showNotification(m.title || '小狐', {
    body: m.body || '', tag: m.tag || 'ipet', renotify: true, icon: 'icons/icon-192.png', badge: 'icons/icon-192.png',
    data: { url: new URL(m.url || './', self.registration.scope).href },
  }));
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = e.notification.data && e.notification.data.url || self.registration.scope;
  const page = u => new URL(u).pathname.replace(/\/index\.html$/, '/');
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
    const open = list.find(c => page(c.url) === page(url));
    return open ? open.focus() : self.clients.openWindow(url);
  }));
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
