// Simple service worker for PWA installability
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', e => {
  if (e.request.url.includes('itunes.apple.com') || e.request.url.includes('rss.applemarketingtools.com')) return;
  e.respondWith(fetch(e.request).catch(() => new Response('Offline')));
});
