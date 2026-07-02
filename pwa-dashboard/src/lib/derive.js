// Derived views over the games list for the home scenes & profile.
import { chronological, ALL_MODES } from './stats.js';

// Most recent games first (games.json is already newest-first, but be safe).
export function recentGames(games, n = 8) {
  return [...games]
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .slice(0, n);
}

// Count of games per mode → for the donut.
export function modeDistribution(games) {
  const counts = {};
  ALL_MODES.forEach(m => (counts[m] = 0));
  games.forEach(g => { counts[g.mode] = (counts[g.mode] || 0) + 1; });
  return ALL_MODES.map(m => ({ mode: m, value: counts[m] })).filter(d => d.value > 0);
}

// Cumulative wins per player across the season → for the line chart.
// Returns { data: [{i, label, [player]: cumWins}], players: [names] }.
export function winsOverTime(games, players) {
  const cum = {};
  players.forEach(p => (cum[p] = 0));
  const data = [];
  chronological(games).forEach((g, i) => {
    if (g.winner && cum[g.winner] !== undefined) cum[g.winner] += 1;
    const row = { i: i + 1 };
    players.forEach(p => (row[p] = cum[p]));
    data.push(row);
  });
  return { data, players };
}

// Bob's 27 (solo) — best-ever result for a player: the highest score among
// clean finishes (round 20 cleared without busting), or if they've never
// cleanly finished, the furthest round they've reached.
// Returns { type: 'score', value } | { type: 'round', value } | null.
export function bestBob27Result(games, playerName) {
  const attempts = games.filter(g => g.mode === 'Bob27' && g.players?.[0] === playerName);
  if (!attempts.length) return null;

  const clean = attempts.filter(g => g.extra && g.extra.busted === false);
  if (clean.length) {
    const best = Math.max(...clean.map(g => g.scores[0]));
    return { type: 'score', value: best };
  }
  const bestRound = Math.max(...attempts.map(g => g.extra?.rounds_completed ?? 0));
  return { type: 'round', value: bestRound };
}

// Round the Clock (solo) — fastest completion (seconds), or null if the
// player has never played it.
export function bestRoundTheClockTime(games, playerName) {
  const attempts = games.filter(g => g.mode === 'RoundTheClock' && g.players?.[0] === playerName);
  if (!attempts.length) return null;
  return Math.min(...attempts.map(g => g.duration));
}

// Head-to-head: for each unordered pair that shared games, who won more.
// Returns top rivalries by number of shared games.
export function rivalries(games, limit = 5) {
  const pair = {}; // "a|b" (sorted) -> { a, b, games, aWins, bWins }
  for (const g of games) {
    const ps = g.players || [];
    for (let i = 0; i < ps.length; i++) {
      for (let j = i + 1; j < ps.length; j++) {
        const [a, b] = [ps[i], ps[j]].sort();
        const key = `${a}|${b}`;
        if (!pair[key]) pair[key] = { a, b, games: 0, aWins: 0, bWins: 0 };
        const r = pair[key];
        r.games++;
        if (g.winner === a) r.aWins++;
        else if (g.winner === b) r.bWins++;
      }
    }
  }
  return Object.values(pair)
    .filter(r => r.games >= 2)
    .sort((x, y) => y.games - x.games || (y.aWins + y.bWins) - (x.aWins + x.bWins))
    .slice(0, limit);
}
