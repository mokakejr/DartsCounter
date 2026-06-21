import { ACHIEVEMENTS, computeAchievements } from './stats.js';
import { rarityTier } from './rarity.js';

// Build the enriched trophy list once: earners, lock state, rarity tier and
// progress toward locked ones. Pass `playerName` for a player-specific view
// (progress = that player's); otherwise global (progress = closest player).
export function buildTrophies(stats, playerName = null) {
  const earnedMap = computeAchievements(stats);
  const players = Object.values(stats);
  const total = players.length;

  return ACHIEVEMENTS.map(a => {
    const earners = earnedMap[a.id] || [];
    const unlocked = playerName
      ? earners.some(e => e.name === playerName)
      : earners.length > 0;
    const rarity = rarityTier(earners.length, total);

    let progress = null;
    if (!unlocked && a.prog) {
      if (playerName && stats[playerName]) {
        const [c, t] = a.prog(stats[playerName]);
        progress = [Math.max(0, Math.min(c, t)), t];
      } else {
        // global: how close is the roster's best?
        let bestCur = -1, target = null;
        for (const s of players) {
          const [c, t] = a.prog(s);
          if (c > bestCur) { bestCur = c; target = t; }
        }
        if (target != null) progress = [Math.max(0, Math.min(bestCur, target)), target];
      }
    }

    return { ...a, earners, unlocked, rarity, progress };
  });
}

export function unlockedCount(trophies, playerName = null) {
  return trophies.filter(t => (playerName
    ? t.earners.some(e => e.name === playerName)
    : t.earners.length > 0)).length;
}
