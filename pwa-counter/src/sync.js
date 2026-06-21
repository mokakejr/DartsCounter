// Page-side glue: ask the service worker to retry the offline queue via
// Background Sync when it's supported, and fall back to flushing on
// focus/visibilitychange/online for browsers that don't support it
// (Safari, Firefox).

import { flushQueue } from './flushQueue.js';

const SYNC_TAG = 'flush-games-queue';

export async function registerBackgroundSync() {
  if (!('serviceWorker' in navigator) || !('SyncManager' in window)) return false;
  try {
    const reg = await navigator.serviceWorker.ready;
    await reg.sync.register(SYNC_TAG);
    return true;
  } catch {
    return false;
  }
}

export function installFlushFallback() {
  window.addEventListener('online', flushQueue);
  window.addEventListener('focus', flushQueue);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') flushQueue();
  });
}
