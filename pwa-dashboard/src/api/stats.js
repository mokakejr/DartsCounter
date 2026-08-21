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

// Mur à trophées calculé côté backend (D4). player: omis = vue globale (tous
// les trophées, earners = détenteurs) ; un nom = vue profil (unlocked/progress
// relatifs à ce joueur). season: omis = saison active, un id, ou 'all'.
// Réponse par trophée : {id, cat, ico, name, desc, earners, unlocked, rarity,
// progress, my_value}.
export function fetchAchievements({ player, season } = {}) {
  return apiGet('/stats/achievements', {
    ...(player ? { player } : {}),
    ...(season ? { season } : {}),
  });
}
