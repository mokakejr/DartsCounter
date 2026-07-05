import { postGameToServer } from './api/games.js';
import { enqueueGame } from './offlineQueue.js';
import { registerBackgroundSync } from './sync.js';

/**
 * Send a finished game to the backend. If the network is down, queue it in
 * IndexedDB instead of losing the result — see offlineQueue.js/sync.js for
 * the retry-on-reconnect side (Background Sync, with a focus/visibility
 * fallback for browsers that don't support it). The backend dispatches the
 * Google Chat/Discord notification itself once the game is actually
 * persisted — including for games that synced later from the offline queue.
 *
 * @param {object} opts
 * @param {string}   opts.mode      – 'Shanghai' | 'Cricket' | 'SuperCricket' | 'FiftyOne'
 * @param {string}   opts.variant   – 'Normal' | 'Shanghai Kill' | 'CutThroat'
 * @param {string[]} opts.players   – player names in original order
 * @param {number[]} opts.scores    – parallel to players
 * @param {string}   opts.winner    – winning player name, or '' for a tie
 * @param {number}   opts.startedAt – Date.now() captured when the game screen mounted
 * @param {boolean}  [opts.isCasual] – excluded from Elo when true (default false)
 * @param {object}   [opts.extra]    – generic per-mode metadata (e.g. Bob's 27 bust info)
 */
// Dernier match joué sur cet appareil — nourrit la "Revanche Rapide" 1-clic
// du PlayHome (Epics 5.1 / 7.4).
export const LAST_GAME_KEY = 'dartsLastGame';

export async function postGame({ mode, variant, players, scores, winner, startedAt, isCasual = false, extra }) {
  const now = Date.now();
  try {
    localStorage.setItem(LAST_GAME_KEY, JSON.stringify({
      mode, variant, players, isCasual, playedAt: now,
    }));
  } catch { /* stockage plein/désactivé : la revanche est un bonus */ }
  const duration = Math.round((now - startedAt) / 1000);
  const payload = {
    date: new Date(startedAt).toISOString(),
    mode,
    variant,
    players,
    scores,
    winner: winner || null,
    duration,
    is_casual: isCasual,
    ...(extra ? { extra } : {}),
  };

  try {
    await postGameToServer(payload);
  } catch {
    await enqueueGame(payload);
    await registerBackgroundSync();
  }
}
