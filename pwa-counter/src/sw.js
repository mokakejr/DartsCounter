import { precacheAndRoute } from 'workbox-precaching';
import { clientsClaim } from 'workbox-core';
import { flushQueue } from './flushQueue.js';

self.skipWaiting();
clientsClaim();

// App shell, injected by vite-plugin-pwa at build time.
precacheAndRoute(self.__WB_MANIFEST);

const SYNC_TAG = 'flush-games-queue';

// Background Sync: fires when connectivity returns, even if no tab is open.
self.addEventListener('sync', event => {
  if (event.tag === SYNC_TAG) event.waitUntil(flushQueue());
});
