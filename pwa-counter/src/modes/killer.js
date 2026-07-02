// Killer — elimination party game, always casual. Each player gets a unique
// life-number (1-20), assigned randomly at game start. A player must hit
// their own number to become a "killer" before they can remove opponents'
// lives; hitting their own number again after becoming a killer costs them a
// life instead (self-kill). Last player with lives remaining wins.
//
// "Any hit" variant: any segment on the relevant number triggers the
// become-killer/remove-life/self-kill effect. "Double Only" variant requires
// the double specifically — this module doesn't know about segments at all;
// the screen decides whether a given dart even reaches applyHit/playDart
// based on the chosen variant (a non-double hit in Double Only mode is
// simply never passed in, same as a genuine miss).

export function assignNumbers(count) {
  const pool = Array.from({ length: 20 }, (_, i) => i + 1);
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, count);
}

export function initialKillerState(playerNames, numbers, lives) {
  return {
    players: playerNames.map((name, i) => ({
      name,
      number: numbers[i],
      lives,
      isKiller: false,
      eliminated: false,
    })),
    currentPlayer: 0,
    dartsThisTurn: 0,
    eliminationOrder: [], // names, in the order they were eliminated
    finished: false,
    winner: null,
  };
}

// Can `playerIndex` legally target `targetIndex` with this dart? A player can
// always aim at their own number; an opponent's number is only a valid
// target once the thrower has become a killer.
export function canTarget(state, playerIndex, targetIndex) {
  const thrower = state.players[playerIndex];
  if (!thrower || thrower.eliminated) return false;
  if (targetIndex === playerIndex) return true;
  const target = state.players[targetIndex];
  return !!target && !target.eliminated && thrower.isKiller;
}

function applyHit(state, targetIndex) {
  const throwerIndex = state.currentPlayer;
  if (targetIndex == null || !canTarget(state, throwerIndex, targetIndex)) return state;

  const players = state.players.map(p => ({ ...p }));
  let eliminationOrder = state.eliminationOrder;

  const loseLife = idx => {
    players[idx].lives -= 1;
    if (players[idx].lives <= 0) {
      players[idx].eliminated = true;
      eliminationOrder = [...eliminationOrder, players[idx].name];
    }
  };

  if (targetIndex === throwerIndex) {
    if (!players[throwerIndex].isKiller) {
      players[throwerIndex].isKiller = true;
    } else {
      loseLife(throwerIndex); // self-kill
    }
  } else {
    loseLife(targetIndex);
  }

  const remaining = players.filter(p => !p.eliminated);
  const finished = remaining.length <= 1;
  const winner = finished && remaining.length === 1 ? remaining[0].name : null;

  return { ...state, players, eliminationOrder, finished, winner };
}

function advanceTurn(state, throwerIndex, forceEnd) {
  const dartsThisTurn = forceEnd ? 3 : state.dartsThisTurn + 1;
  if (dartsThisTurn < 3) return { ...state, dartsThisTurn };

  let next = (throwerIndex + 1) % state.players.length;
  for (let guard = 0; state.players[next].eliminated && guard < state.players.length; guard++) {
    next = (next + 1) % state.players.length;
  }
  return { ...state, dartsThisTurn: 0, currentPlayer: next };
}

// targetIndex: index of the player whose number was hit this dart, or null
// for a miss (or, in Double Only mode, a non-double hit — see module note).
export function playDart(state, targetIndex) {
  if (state.finished) return state;
  const throwerIndex = state.currentPlayer;
  const next = applyHit(state, targetIndex);
  if (next.finished) return next;
  const throwerEliminated = next.players[throwerIndex].eliminated;
  return advanceTurn(next, throwerIndex, throwerEliminated);
}

// Numeric score proxy for the finished podium / backend `scores`: winner =
// player count, first eliminated = 1, runner-up = playerCount - 1, etc.
export function eliminationScores(state) {
  const n = state.players.length;
  const scoreByName = {};
  state.eliminationOrder.forEach((name, i) => { scoreByName[name] = i + 1; });
  if (state.winner != null) scoreByName[state.winner] = n;
  return state.players.map(p => scoreByName[p.name] ?? 0);
}
