// Minimal service worker. Its only job is to make the site installable as a
// PWA; it caches nothing. Without a respondWith() call, every request goes to
// the network exactly as it would without a service worker, so the wasm,
// content/ and the loader page always come from the latest deploy.
//
// Offline play would need a cache strategy here (and a cache version bump on
// each deploy); that is deliberately not done yet.

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', () => {});
