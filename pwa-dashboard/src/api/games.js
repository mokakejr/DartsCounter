import { apiGet } from './client.js';

// The legacy games.json was capped at the 200 most recent entries; mirror
// that here so the existing stats/achievements code (which assumes it sees
// the full visible history) keeps working unchanged.
const GAMES_LIMIT = 200;

// The backend's GameRead nests per-player score/position. Flatten it back
// into the legacy {players: [name], scores: [int]} shape that
// achievements-core.mjs and lib/stats.js already expect.
function toLegacyShape(game) {
  return {
    id: game.id,
    date: game.date,
    mode: game.mode,
    variant: game.variant,
    duration: game.duration,
    winner: game.winner,
    isCasual: game.is_casual,
    extra: game.extra,
    players: game.players.map(p => p.name),
    scores: game.players.map(p => p.score),
  };
}

export async function fetchGames() {
  const games = await apiGet('/games', { limit: GAMES_LIMIT });
  return games.map(toLegacyShape);
}
