import { apiGet } from './client.js';

// Le backend plafonne `limit` à 200 par requête : on pagine donc pour ramener
// tout l'historique (le calendrier d'activité et les stats de profil le veulent
// « depuis le début », pas seulement les 200 dernières parties). PAGE_SIZE est
// une taille de page, pas un plafond de résultats.
const PAGE_SIZE = 200;
// Garde-fou anti-boucle infinie (offset qui n'avance pas, backend en erreur…).
const MAX_GAMES = 10000;

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
  const all = [];
  for (let offset = 0; offset < MAX_GAMES; offset += PAGE_SIZE) {
    const page = await apiGet('/games', { limit: PAGE_SIZE, offset });
    all.push(...page);
    if (page.length < PAGE_SIZE) break; // dernière page atteinte
  }
  return all.map(toLegacyShape);
}
