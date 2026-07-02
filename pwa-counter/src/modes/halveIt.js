// Halve It — round-based party game, always casual. Each round targets a
// specific number, or "any double"/"any triple"/"bull". Score entry is a
// turn total (not per-dart taps, since the special rounds' target varies per
// dart — a fixed zone-button row like Shanghai's doesn't generalize here).
// Scoring 0 in a round halves the player's running total (rounded down);
// any hit at all (>0) just adds normally.

export const HALVEIT_SEQUENCES = {
  standard: [20, 19, 18, 'doubles', 17, 16, 'triples', 15, 'bull'],
  short: [20, 19, 'doubles', 18, 'triples', 'bull'],
};

export function roundLabel(target) {
  if (target === 'doubles') return 'DOUBLES';
  if (target === 'triples') return 'TRIPLES';
  if (target === 'bull') return 'BULL';
  return String(target);
}

const count = s => s.playerNames.length;

export function initialHalveItState(playerNames, sequence) {
  return {
    playerNames,
    sequence,
    scores: playerNames.map(() => 0),
    currentRound: 0,
    currentPlayer: 0,
    finished: false,
  };
}

// points: total points scored this turn. 0 -> halve (rounded down); >0 -> add.
export function scoreRound(state, player, points) {
  const round = state.currentRound;
  const scores = state.scores.slice();
  scores[player] = points > 0 ? scores[player] + points : Math.floor(scores[player] / 2);

  const nextPlayer = (player + 1) % count(state);
  const nextRound = nextPlayer === 0 ? round + 1 : round;
  const done = nextRound >= state.sequence.length;

  return {
    ...state,
    scores,
    currentPlayer: done ? player : nextPlayer,
    currentRound: done ? round : nextRound,
    finished: done,
  };
}

export function leader(state) {
  if (!state.finished) return null;
  const max = Math.max(...state.scores);
  const top = state.scores.map((_, i) => i).filter(i => state.scores[i] === max);
  return top.length === 1 ? top[0] : null;
}
