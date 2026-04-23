/* Minimal Service Worker for PWA installability. */

self.addEventListener("install", (event) => {
  // Activate immediately on first load.
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

// Network-first passthrough (no offline caching yet).
self.addEventListener("fetch", (event) => {});

