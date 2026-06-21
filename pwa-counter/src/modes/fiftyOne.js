// 51 — port fidèle de app/.../model/FiftyOneModel.kt.
// Atteindre exactement 51 « cinqs ». Saisie = somme des 3 fléchettes (0-180),
// doit être divisible par 5. Bust : si le total dépasserait 51, on ne marque rien.

export const FIFTY_ONE_TARGET = 51;

const count = s => s.playerNames.length;

export function initialFiftyOneState(playerNames) {
  return {
    playerNames,
    fives: playerNames.map(() => 0),
    currentPlayer: 0,
    winner: null,
  };
}

export function scoreTurn(s, player, turnTotal) {
  const fives = s.fives.slice();
  if (turnTotal > 0 && turnTotal % 5 === 0) {
    const fivesScored = turnTotal / 5;
    const newTotal = fives[player] + fivesScored;
    if (newTotal <= FIFTY_ONE_TARGET) fives[player] = newTotal; // sinon bust → rien
  }
  const next = { ...s, fives };
  return { ...next, winner: checkWinner(next) };
}

export function checkWinner(s) {
  const idx = s.playerNames.findIndex((_, p) => s.fives[p] === FIFTY_ONE_TARGET);
  return idx === -1 ? null : idx;
}

export const nextPlayer = s => ({ ...s, currentPlayer: (s.currentPlayer + 1) % count(s) });
