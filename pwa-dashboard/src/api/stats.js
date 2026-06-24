import { apiGet } from './client.js';

// mode: omit for the global leaderboard, or pass a mode name (e.g.
// "Cricket") to scope games/wins/elo to just that mode.
export function fetchLeaderboard(mode) {
  return apiGet('/stats/leaderboard', mode ? { mode } : {});
}
