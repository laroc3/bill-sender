const V = 'bill-sender-v1';
const SHELL = ['./', 'index.html', 'app.js', 'style.css', 'config.js', 'jszip.min.js',
  'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(V).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(ks => Promise.all(ks.filter(k => k !== V).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
// Network first (so updates arrive), cache fallback (so the app opens offline).
self.addEventListener('fetch', e => {
  const r = e.request;
  if (r.method !== 'GET' || new URL(r.url).origin !== location.origin) return;
  e.respondWith(
    fetch(r).then(res => {
      const copy = res.clone();
      caches.open(V).then(c => c.put(r, copy));
      return res;
    }).catch(() => caches.match(r, { ignoreSearch: true }))
  );
});
