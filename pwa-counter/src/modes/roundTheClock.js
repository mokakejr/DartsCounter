// Round the Clock — solo training. Hit 1 through 20 in order, then bull.
// Any segment (single/double/triple) of the current target counts — the
// player stays on the current target until it's hit (however many darts
// that takes), then immediately advances. Single pass, no doubles/triples
// progression.

export const RTC_TARGETS = [...Array(20)].map((_, i) => i + 1).concat(['BULL']);

export function initialRoundTheClockState(playerName) {
  return {
    playerName,
    targetIndex: 0,
    darts: 0,
    finished: false,
  };
}

export function currentTarget(state) {
  return RTC_TARGETS[state.targetIndex];
}

// hit: did this dart land on the current target, in any segment.
export function recordDart(state, hit) {
  if (state.finished) return state;

  const darts = state.darts + 1;
  if (!hit) return { ...state, darts };

  const nextIndex = state.targetIndex + 1;
  const finished = nextIndex >= RTC_TARGETS.length;
  return { ...state, targetIndex: finished ? state.targetIndex : nextIndex, darts, finished };
}
