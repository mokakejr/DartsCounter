import { useEffect, useMemo, useState } from 'react';
import { loadGames } from './data.js';
import { computePlayerStats } from './stats.js';

// Loads games once and derives per-player stats. Accepts an optional
// leaguePlayers array; when provided, only games where at least one
// player belongs to the league are counted.
export function useGames(leaguePlayers = null) {
  const [allGames, setAllGames] = useState(null); // null = loading
  const [error, setError] = useState(null);

  useEffect(() => {
    let alive = true;
    loadGames()
      .then(g => { if (alive) setAllGames(g); })
      .catch(e => { if (alive) { console.error('loadGames failed:', e); setError(e); } });
    return () => { alive = false; };
  }, []);

  // Filter semantics: include a game if ANY of its players is in the league.
  // This means non-league players who appeared alongside a league member are
  // also visible in filtered stats — intentional, so partial groups still make sense.
  // Memo depends on leaguePlayers array reference; updateLeague always creates a new
  // array via spread, so mutations-in-place would break this silently.
  const games = useMemo(() => {
    if (!allGames) return null;
    if (!leaguePlayers || leaguePlayers.length === 0) return allGames;
    return allGames.filter(g =>
      Array.isArray(g.players) && g.players.some(p => leaguePlayers.includes(p))
    );
  }, [allGames, leaguePlayers]);

  const stats = useMemo(() => (games ? computePlayerStats(games) : {}), [games]);

  const ranked = useMemo(
    () =>
      Object.values(stats).sort(
        (a, b) => b.wins - a.wins || b.games - a.games || a.name.localeCompare(b.name)
      ),
    [stats]
  );

  return { games, allGames, stats, ranked, loading: allGames === null && !error, error };
}
