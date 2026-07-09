// Shanghai — port fidèle de app/.../model/ShanghaiModel.kt, généralisé pour
// couvrir les 3 variantes (Bull/Random/Crazy) en plus du Shanghai classique.
// `targets` est la liste des cibles jouées, dans l'ordre (round N = targets[N]).
// 3 fléchettes/tour, zones 0=miss / 1=simple / 2=double / 3=triple. Points du
// tour = somme(zones) × cible. La cible spéciale BULL (25 — simple bull=25,
// double bull=50, pas de triple bull) n'a que 2 zones possibles.
// Shanghai = simple+double+triple sur la même cible en un tour → victoire
// immédiate ; sur un round BULL (pas de triple possible), l'équivalent est
// 3 doubles-bull dans le même tour.

export const BULL = 25;

const count = s => s.playerNames.length;

export const isBullTarget = target => target === BULL;

export function initialShanghaiState(playerNames, targets) {
  return {
    playerNames,
    targets,
    scores: playerNames.map(() => targets.map(() => 0)),
    currentRound: 0,
    currentPlayer: 0,
    finished: false,
    shanghaiWinner: null,
  };
}

export const totalScore = (s, player) => s.scores[player].reduce((a, b) => a + b, 0);

// darts : zones jouées ce tour (1=simple, 2=double, 3=triple).
export function isInstantWin(darts, target) {
  if (darts.length !== 3) return false;
  return isBullTarget(target)
    ? darts.every(z => z === 2) // 3 doubles-bull
    : [1, 2, 3].every(z => darts.includes(z));
}

// points : score du tour déjà calculé (somme des zones × cible).
export function addScore(s, player, round, points, shanghai = false) {
  const scores = s.scores.map(r => r.slice());
  scores[player][round] = points;

  if (shanghai) {
    return { ...s, scores, finished: true, shanghaiWinner: player };
  }

  const nextPlayer = (player + 1) % count(s);
  const nextRound = nextPlayer === 0 ? round + 1 : round;
  const done = nextRound >= s.targets.length;

  return {
    ...s,
    scores,
    currentPlayer: done ? player : nextPlayer,
    currentRound: done ? round : nextRound,
    finished: done,
  };
}

export function leader(s) {
  if (!s.finished) return null;
  if (s.shanghaiWinner != null) return s.shanghaiWinner;
  const max = Math.max(...s.playerNames.map((_, p) => totalScore(s, p)));
  const top = s.playerNames.map((_, p) => p).filter(p => totalScore(s, p) === max);
  return top.length === 1 ? top[0] : null;
}
