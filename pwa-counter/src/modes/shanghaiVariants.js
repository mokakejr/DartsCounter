// Target-list generators for the 4 Shanghai flavors. Pure functions, no UI —
// called once per game (shared by every player, for a fair comparison).
import { BULL } from './shanghai.js';

const NUMBERS = Array.from({ length: 20 }, (_, i) => i + 1); // 1..20

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export const classicTargets = () => [1, 2, 3, 4, 5, 6, 7];

// 1 -> 20, then bull. 21 rounds.
export const bullTargets = () => [...NUMBERS, BULL];

// 7 distinct values from 1-20 + bull, sorted ascending (bull sorts last,
// as if it were "21") — so a player who chokes on a high number can at
// least see whether an easier one is coming.
export const randomTargets = () => shuffle([...NUMBERS, BULL]).slice(0, 7).sort((a, b) => a - b);

// Same pool, but the picked order is never sorted — deliberately keeps the
// player from knowing whether a harder target is coming up next.
export const crazyTargets = () => shuffle([...NUMBERS, BULL]).slice(0, 7);

// variant id (picked on the setup screen) -> target generator. Shared by
// ShanghaiGame and PlaySetup (remote: the creator draws the targets once and
// ships them through the live match options so both screens play the same
// sequence).
export const TARGET_GENERATOR = {
  classic: classicTargets,
  bull: bullTargets,
  random: randomTargets,
  crazy: crazyTargets,
};
