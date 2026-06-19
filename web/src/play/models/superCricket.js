// Super Cricket — port fidèle de app/.../model/SuperCricketModel.kt.
// 10 cibles : les 7 du Cricket + DOUBLE(7), TRIPLE(8), BED(9).
// Les cibles standard se jouent comme au Cricket ; DOUBLE/TRIPLE/BED demandent
// un nombre (et un multiplicateur pour BED) → addSpecialMark + addSpecialScoring.

import { CRICKET_TARGETS } from './cricket.js';

export const SC_IDX_DOUBLE = 7;
export const SC_IDX_TRIPLE = 8;
export const SC_IDX_BED = 9;
export const SC_TARGET_COUNT = 10;
export const SC_MODE = { NORMAL: 'NORMAL', CUT_THROAT: 'CUT_THROAT' };

const count = s => s.playerNames.length;
const isClosed = (s, player, t) => s.marks[player][t] >= 3;
const isGloballyClosed = (s, t) => s.playerNames.every((_, p) => isClosed(s, p, t));
const standardValue = t => CRICKET_TARGETS[t]; // 25 reste 25

export function initialSuperCricketState(playerNames, mode = SC_MODE.NORMAL) {
  return {
    playerNames,
    marks: playerNames.map(() => Array.from({ length: SC_TARGET_COUNT }, () => 0)),
    points: playerNames.map(() => 0),
    mode,
    winner: null,
    currentPlayer: 0,
  };
}

function resolveWinner(s, marks, points) {
  for (let p = 0; p < count(s); p++) {
    const closedAll = marks[p].every(m => m >= 3);
    if (!closedAll) continue;
    const my = points[p];
    const wins = s.mode === SC_MODE.NORMAL
      ? !s.playerNames.some((_, i) => i !== p && points[i] > my)
      : !s.playerNames.some((_, i) => i !== p && points[i] < my);
    if (wins) return p;
  }
  return null;
}

export function addStandardHit(s, player, targetIdx) {
  const marks = s.marks.map(r => r.slice());
  const points = s.points.slice();
  const current = s.marks[player][targetIdx];
  const newTotal = Math.min(current + 1, 99);
  marks[player][targetIdx] = newTotal;

  const scoringHits = Math.max(newTotal - 3, 0) - Math.max(current - 3, 0);
  if (scoringHits > 0 && !isGloballyClosed(s, targetIdx)) {
    const value = scoringHits * standardValue(targetIdx);
    if (s.mode === SC_MODE.NORMAL) {
      const allOthersClosed = !s.playerNames.some((_, i) => i !== player && !isClosed(s, i, targetIdx));
      if (!allOthersClosed) points[player] += value;
    } else {
      for (let opp = 0; opp < count(s); opp++) {
        if (opp !== player && !isClosed(s, opp, targetIdx)) points[opp] += value;
      }
    }
  }
  return { ...s, marks, points, winner: resolveWinner(s, marks, points) };
}

// DOUBLE/TRIPLE/BED : on incrémente juste la marque (ouverture de la cible).
export function addSpecialMark(s, player, targetIdx) {
  const marks = s.marks.map(r => r.slice());
  marks[player][targetIdx] = Math.min(s.marks[player][targetIdx] + 1, 99);
  return { ...s, marks, winner: resolveWinner(s, marks, s.points) };
}

// DOUBLE/TRIPLE/BED : attribution des points (pts déjà calculés par l'appelant).
export function addSpecialScoring(s, player, targetIdx, pts) {
  const points = s.points.slice();
  if (s.mode === SC_MODE.NORMAL) {
    const allOthersClosed = !s.playerNames.some((_, i) => i !== player && !isClosed(s, i, targetIdx));
    if (allOthersClosed) return s;
    points[player] += pts;
  } else {
    const anyOpponentOpen = s.playerNames.some((_, i) => i !== player && !isClosed(s, i, targetIdx));
    if (!anyOpponentOpen) return s;
    for (let opp = 0; opp < count(s); opp++) {
      if (opp !== player && !isClosed(s, opp, targetIdx)) points[opp] += pts;
    }
  }
  return { ...s, points, winner: resolveWinner(s, s.marks, points) };
}

export const nextPlayer = s => ({ ...s, currentPlayer: (s.currentPlayer + 1) % count(s) });
