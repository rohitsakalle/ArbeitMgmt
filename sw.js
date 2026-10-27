const CACHE = 'arbeitmgmt-dev-v1';
const FILES = ['/', '/index.html', '/manifest.webmanifest', '/icon.svg', '/icon-192.png', '/icon-512.png', '/src/main.js', '/src/model.js', '/src/storage.js', '/src/i18n.js', '/src/photos.js', '/src/pdf.js', '/src/style.css'];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(FILES)));
});
// Updates wait for existing tabs to close; never replace the running app during unsaved edits.
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('arbeitmgmt-') && key !== CACHE).map(key => caches.delete(key)))));
});
self.addEventListener('message', event => {
  if (event.data === 'offline-ready') {
    event.waitUntil(caches.open(CACHE).then(async cache => {
      const entries = await Promise.all(FILES.map(file => cache.match(file)));
      event.source?.postMessage({ type: 'offline-ready', ready: entries.every(Boolean) });
    }));
  }
});
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin) return;
  if (!FILES.includes(url.pathname) || url.search) return;
  event.respondWith(caches.open(CACHE).then(async cache => (await cache.match(url.pathname)) || fetch(event.request)));
});
