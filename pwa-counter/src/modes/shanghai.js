// Shanghai — port fidèle de app/.../model/ShanghaiModel.kt.
// 7 rounds ; au round N (1-indexé) la cible est le nombre N. 3 fléchettes/tour,
// zones 0=miss / 1=simple / 2=double / 3=triple. Points du tour = somme×round.
// Shanghai = simple + double + triple sur le même nombre dans un tour → victoire immédiate.

export const SHANGHAI_ROUNDS = 7;

const count = s => s.playerNames.length;

export function initialShanghaiState(playerNames) {
  return {
    playerNames,
    scores: playerNames.map(() => Array.from({ length: SHANGHAI_ROUNDS }, () => 0)),
    currentRound: 0, // 0-6
    currentPlayer: 0,
    finished: false,
    shanghaiWinner: null,
  };
}

export const totalScore = (s, player) => s.scores[player].reduce((a, b) => a + b, 0);

// darts : zones jouées ce tour (1=simple, 2=double, 3=triple).
export const isShanghai = darts =>
  darts.length === 3 && [1, 2, 3].every(z => darts.includes(z));

// points : score du tour déjà calculé (somme des zones × (round+1)).
export function addScore(s, player, round, points, shanghai = false) {
  const scores = s.scores.map(r => r.slice());
  scores[player][round] = points;

  if (shanghai) {
    return { ...s, scores, finished: true, shanghaiWinner: player };
  }

  const nextPlayer = (player + 1) % count(s);
  const nextRound = nextPlayer === 0 ? round + 1 : round;
  const done = nextRound >= SHANGHAI_ROUNDS;

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
