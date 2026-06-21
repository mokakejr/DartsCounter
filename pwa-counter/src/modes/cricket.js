// Cricket — port fidèle de app/.../model/CricketModel.kt (état immuable, reducers).
// Cibles 20..15 + BULL(25). 3 marques = fermé. Au-delà de 3, on marque des points.
// NORMAL : plus haut score gagne · CUT_THROAT : plus bas gagne.

export const CRICKET_TARGETS = [20, 19, 18, 17, 16, 15, 25];
export const CRICKET_MODE = { NORMAL: 'NORMAL', CUT_THROAT: 'CUT_THROAT' };

const count = s => s.playerNames.length;
export const isClosed = (s, player, t) => s.marks[player][t] >= 3;
export const isGloballyClosed = (s, t) => s.playerNames.every((_, p) => isClosed(s, p, t));
export const targetValue = t => CRICKET_TARGETS[t]; // 25 reste 25

export function initialCricketState(playerNames, mode = CRICKET_MODE.NORMAL) {
  return {
    playerNames,
    marks: playerNames.map(() => CRICKET_TARGETS.map(() => 0)),
    points: playerNames.map(() => 0),
    currentPlayer: 0,
    winner: null,
    mode,
  };
}

// Ajoute `hits` marques sur une cible. Les checks isClosed/isGloballyClosed
// portent sur l'état AVANT le coup (comme le Kotlin), pour décider du scoring.
export function addHit(s, player, targetIdx, hits) {
  const marks = s.marks.map(r => r.slice());
  const points = s.points.slice();

  const current = marks[player][targetIdx];
  const newTotal = Math.min(current + hits, 99);
  marks[player][targetIdx] = newTotal;

  const scoringHits = Math.max(newTotal - 3, 0) - Math.max(current - 3, 0);
  if (scoringHits > 0 && !isGloballyClosed(s, targetIdx)) {
    const value = scoringHits * targetValue(targetIdx);
    if (s.mode === CRICKET_MODE.CUT_THROAT) {
      for (let opp = 0; opp < count(s); opp++) {
        if (opp !== player && !isClosed(s, opp, targetIdx)) points[opp] += value;
      }
    } else {
      const allOthersClosed = s.playerNames.every((_, i) => i === player || isClosed(s, i, targetIdx));
      if (!allOthersClosed) points[player] += value;
    }
  }

  const next = { ...s, marks, points };
  return { ...next, winner: checkWinner(next) };
}

export function checkWinner(s) {
  for (let p = 0; p < count(s); p++) {
    const closedAll = CRICKET_TARGETS.every((_, t) => s.marks[p][t] >= 3);
    if (!closedAll) continue;
    const my = s.points[p];
    const wins = s.mode === CRICKET_MODE.NORMAL
      ? s.playerNames.every((_, i) => i === p || s.points[i] <= my)
      : s.playerNames.every((_, i) => i === p || s.points[i] >= my);
    if (wins) return p;
  }
  return null;
}

export const nextPlayer = s => ({ ...s, currentPlayer: (s.currentPlayer + 1) % count(s) });
