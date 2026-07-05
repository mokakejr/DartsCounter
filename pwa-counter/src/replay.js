import { LAST_GAME_KEY } from './postGame.js';

// Revanche 1-clic (Epics 5.1 / 7.4): reconstruit l'état de navigation d'un
// écran de jeu depuis le dernier match stocké en local — bypass complet de
// /modes et /setup.
const SHANGHAI_VARIANT = {
  Shanghai: 'classic',
  ShanghaiBull: 'bull',
  ShanghaiRandom: 'random',
  ShanghaiCrazy: 'crazy',
};

export function lastGame(maxAgeHours = 24) {
  try {
    const raw = localStorage.getItem(LAST_GAME_KEY);
    if (!raw) return null;
    const g = JSON.parse(raw);
    if (Date.now() - g.playedAt > maxAgeHours * 3600 * 1000) return null;
    return g;
  } catch {
    return null;
  }
}

export function replayTarget(g) {
  if (!g || !Array.isArray(g.players) || g.players.length < 2) return null;
  const base = { players: g.players, isCasual: !!g.isCasual };
  if (g.mode in SHANGHAI_VARIANT) {
    return {
      route: '/shanghai',
      label: 'Shanghai',
      state: { ...base, mode: 'shanghai', variant: SHANGHAI_VARIANT[g.mode] },
    };
  }
  if (g.mode === 'Cricket' || g.mode === 'SuperCricket') {
    return {
      route: g.mode === 'Cricket' ? '/cricket' : '/super-cricket',
      label: g.mode === 'Cricket' ? 'Cricket' : 'Super Cricket',
      state: {
        ...base,
        mode: g.mode === 'Cricket' ? 'cricket' : 'superCricket',
        variant: g.variant === 'CutThroat' ? 'cutthroat' : 'normal',
      },
    };
  }
  if (g.mode === 'FiftyOne') {
    return { route: '/51', label: '51', state: { ...base, mode: 'fiftyOne' } };
  }
  return null; // solo / party modes: pas de revanche express
}
