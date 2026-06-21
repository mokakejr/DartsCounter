// Context-agnostic (only uses indexedDB + fetch) so it can run from the page
// (focus/visibilitychange fallback) and from sw.js (the 'sync' event).

import { listQueuedGames, removeQueuedGame } from './offlineQueue.js';
import { postGameToServer } from './api/games.js';

export async function flushQueue() {
  const pending = await listQueuedGames();
  for (const item of pending) {
    const { queuedAt, ...payload } = item;
    try {
      await postGameToServer(payload);
      await removeQueuedGame(queuedAt);
    } catch {
      // Still offline (or backend down) — leave it queued, stop for now.
      break;
    }
  }
}
