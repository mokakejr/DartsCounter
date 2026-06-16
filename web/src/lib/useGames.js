import { useEffect, useMemo, useState } from 'react';
import { loadGames } from './data.js';
import { computePlayerStats } from './stats.js';

// Loads games once and derives the per-player stats map. Returns ranked array
// (by wins) plus raw games for feeds/charts.
export function useGames() {
  const [games, setGames] = useState(null); // null = loading

  useEffect(() => {
    let alive = true;
    loadGames().then(g => { if (alive) setGames(g); });
    return () => { alive = false; };
  }, []);

  const stats = useMemo(() => (games ? computePlayerStats(games) : {}), [games]);

  const ranked = useMemo(
    () =>
      Object.values(stats).sort(
        (a, b) => b.wins - a.wins || b.games - a.games || a.name.localeCompare(b.name)
      ),
    [stats]
  );

  return { games, stats, ranked, loading: games === null };
}
