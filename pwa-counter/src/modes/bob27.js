// Bob's 27 — solo doubles-practice routine. Start at 27; round N (1-20) is
// 3 darts at double-N. Each dart that hits the double adds 2*N; an all-miss
// round subtracts 2*N. Score reaching 0 or below busts the game immediately.
// Clearing round 20 with score > 0 is a clean finish.

export const BOB27_ROUNDS = 20;

export function bob27Target(round) {
  return round; // double-N for round N — the caller renders "Double N"
}

export function initialBob27State(playerName) {
  return {
    playerName,
    round: 1,
    score: 27,
    busted: false,
    finished: false,
    history: [], // [{round, hits, delta, scoreAfter}]
  };
}

// hits: number of the 3 darts (0-3) that landed on this round's double.
export function scoreRound(state, hits) {
  if (state.busted || state.finished) return state;

  const n = state.round;
  const delta = hits > 0 ? 2 * n * hits : -2 * n;
  const scoreAfter = state.score + delta;
  const busted = scoreAfter <= 0;
  const finished = !busted && n === BOB27_ROUNDS;

  return {
    ...state,
    score: scoreAfter,
    busted,
    finished,
    round: busted || finished ? state.round : state.round + 1,
    history: [...state.history, { round: n, hits, delta, scoreAfter }],
  };
}

export function isGameOver(state) {
  return state.busted || state.finished;
}
