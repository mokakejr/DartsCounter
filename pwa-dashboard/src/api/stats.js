import { apiGet } from './client.js';

// mode: omit for the global leaderboard, or pass a mode name (e.g.
// "Cricket") to scope games/wins/elo to just that mode.
// leagueId: restrict rows to that league's members — positions become
// league-relative, the elo value itself stays the global/mode rating.
export function fetchLeaderboard(mode, leagueId) {
  return apiGet('/stats/leaderboard', {
    ...(mode ? { mode } : {}),
    ...(leagueId ? { league_id: leagueId } : {}),
  });
}
