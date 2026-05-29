/* ============================================================
   SERVICE WORKER
   Precaches the app shell for offline use and runtime-caches the
   CDN dependencies (Three.js, fonts) and downloaded skin textures
   with a stale-while-revalidate strategy.
   ============================================================ */
const VERSION = 'skinviewer-v1';
const SHELL = [
  './', './index.html', './styles.css',
  './main.js', './core.js', './editor.js', './skins.js',
  './media.js', './arcade.js', './ui.js',
  './icon.svg', './manifest.webmanifest',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const sameOrigin = url.origin === self.location.origin;

  // app shell: cache-first, refresh in background
  if (sameOrigin) {
    e.respondWith(
      caches.match(req).then(hit => {
        const net = fetch(req).then(res => {
          if (res && res.status === 200) caches.open(VERSION).then(c => c.put(req, res.clone()));
          return res;
        }).catch(() => hit);
        return hit || net;
      })
    );
    return;
  }

  // CDN + skins: stale-while-revalidate
  e.respondWith(
    caches.open(VERSION).then(c =>
      c.match(req).then(hit => {
        const net = fetch(req, { mode: req.mode === 'navigate' ? 'cors' : req.mode }).then(res => {
          if (res && (res.status === 200 || res.type === 'opaque')) c.put(req, res.clone());
          return res;
        }).catch(() => hit);
        return hit || net;
      })
    )
  );
});
