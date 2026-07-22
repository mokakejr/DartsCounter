// Tests de la balle de match spectateur. Lancer : node src/watch/matchPoint.test.mjs
import assert from 'node:assert/strict';
import { computeMatchPoint } from './matchPoint.js';

let passed = 0;
const test = (name, fn) => { fn(); passed++; console.log('  ✓', name); };

const base = { started: true, finished: false };

function cricketMatch(over = {}) {
  return {
    ...base,
    mode: 'Cricket',
    variant: 'normal',
    players: ['A', 'B'],
    turn_player: 'A',
    scores: { A: 40, B: 20 },
    detail: {
      kind: 'cricket',
      labels: ['20', '19', '18', '17', '16', '15', 'BULL'],
      // A : tout fermé sauf BULL ; B : rien.
      marks: [[3, 3, 3, 3, 3, 3, 0], [0, 0, 0, 0, 0, 0, 0]],
    },
    ...over,
  };
}

console.log('Cricket');
test('une zone restante + avance aux points = balle de match sur la zone', () => {
  const mp = computeMatchPoint(cricketMatch());
  assert.equal(mp.player, 'A');
  assert.equal(mp.zone, 25);
  assert.match(mp.label, /BALLE DE MATCH/);
});
test('pas d\'avance aux points -> null', () => {
  assert.equal(computeMatchPoint(cricketMatch({ scores: { A: 10, B: 20 } })), null);
});
test('cut throat : avance inversée (moins de points = mieux)', () => {
  assert.notEqual(computeMatchPoint(cricketMatch({ variant: 'cutthroat', scores: { A: 10, B: 20 } })), null);
  assert.equal(computeMatchPoint(cricketMatch({ variant: 'cutthroat', scores: { A: 40, B: 20 } })), null);
});
test('pas son tour -> null', () => {
  assert.equal(computeMatchPoint(cricketMatch({ turn_player: 'B' })), null);
});
test('deux zones restantes -> null', () => {
  const m = cricketMatch();
  m.detail.marks[0][5] = 2;
  assert.equal(computeMatchPoint(m), null);
});
test('label hors cible (Super Cricket DBL/TRP/BED) -> zone null, texte seul', () => {
  const m = cricketMatch();
  m.detail.labels[6] = 'BED';
  const mp = computeMatchPoint(m);
  assert.equal(mp.zone, null);
  assert.match(mp.label, /BED/);
});
test('formatName appliqué (censure)', () => {
  const mp = computeMatchPoint(cricketMatch(), () => 'X***');
  assert.match(mp.label, /X\*\*\*/);
});

console.log('51');
const f51 = (fives, turn = 'A') => ({
  ...base, mode: '51', players: ['A', 'B'], turn_player: turn, scores: { A: fives, B: 0 },
});
test('à 10 cinqs ou moins du 51 -> balle de match', () => {
  const mp = computeMatchPoint(f51(42));
  assert.equal(mp.player, 'A');
  assert.match(mp.label, /45 points/); // 9 cinqs restants
});
test('à 11 cinqs -> null (anti-permanence)', () => {
  assert.equal(computeMatchPoint(f51(40)), null);
});
test('51 atteint (0 restant) -> null', () => {
  assert.equal(computeMatchPoint(f51(51)), null);
});
test('c\'est le tour de B qui est loin -> null', () => {
  assert.equal(computeMatchPoint(f51(45, 'B')), null);
});

console.log('Shanghai');
const shanghai = (over = {}) => ({
  ...base, mode: 'Shanghai', variant: 'classic', players: ['A', 'B'],
  turn_player: 'A', scores: {}, round: 7, detail: { kind: 'shanghai', board: [] }, ...over,
});
test('classic manche 7 -> tension globale sur la cible 7', () => {
  const mp = computeMatchPoint(shanghai());
  assert.equal(mp.player, null);
  assert.equal(mp.zone, 7);
  assert.match(mp.label, /DERNIÈRE VOLÉE/);
});
test('classic manche 6 -> null', () => {
  assert.equal(computeMatchPoint(shanghai({ round: 6 })), null);
});
test('bull manche 21 -> zone bull', () => {
  assert.equal(computeMatchPoint(shanghai({ variant: 'bull', round: 21 })).zone, 25);
});
test('crazy local (options null) -> zone null, texte seul', () => {
  assert.equal(computeMatchPoint(shanghai({ variant: 'crazy', options: null })).zone, null);
});
test('crazy remote -> zone = dernière cible tirée', () => {
  const mp = computeMatchPoint(shanghai({ variant: 'crazy', options: { targets: [3, 12, 5, 18, 1, 9, 14] } }));
  assert.equal(mp.zone, 14);
});

console.log('Killer');
const killer = (over = {}) => ({
  ...base, mode: 'Killer', variant: 'any', players: ['A', 'B', 'C'],
  turn_player: 'A', scores: {},
  detail: {
    kind: 'killer',
    players: [
      { name: 'A', number: 20, lives: 3, isKiller: true, eliminated: false },
      { name: 'B', number: 7, lives: 1, isKiller: false, eliminated: false },
      { name: 'C', number: 12, lives: 0, isKiller: false, eliminated: true },
    ],
  },
  ...over,
});
test('duel final, killer au tir, victime à 1 vie -> zone = numéro victime', () => {
  const mp = computeMatchPoint(killer());
  assert.equal(mp.zone, 7);
  assert.match(mp.label, /éliminer/);
});
test('tireur pas killer -> null', () => {
  const m = killer();
  m.detail.players[0].isKiller = false;
  assert.equal(computeMatchPoint(m), null);
});
test('victime à 2 vies -> null', () => {
  const m = killer();
  m.detail.players[1].lives = 2;
  assert.equal(computeMatchPoint(m), null);
});
test('3 survivants -> null', () => {
  const m = killer();
  m.detail.players[2].eliminated = false;
  m.detail.players[2].lives = 2;
  assert.equal(computeMatchPoint(m), null);
});

console.log('Halve It');
test('dernière manche standard (9) -> tension globale zone bull', () => {
  const mp = computeMatchPoint({ ...base, mode: 'Halve It', variant: 'standard', players: ['A', 'B'], turn_player: 'A', scores: {}, round: 9 });
  assert.equal(mp.player, null);
  assert.equal(mp.zone, 25);
});
test('short : manche 6 = dernière', () => {
  assert.notEqual(computeMatchPoint({ ...base, mode: 'Halve It', variant: 'short', players: ['A'], turn_player: 'A', scores: {}, round: 6 }), null);
});
test('manche 5 short -> null', () => {
  assert.equal(computeMatchPoint({ ...base, mode: 'Halve It', variant: 'short', players: ['A'], turn_player: 'A', scores: {}, round: 5 }), null);
});

console.log('Gardes globales');
test('match fini -> null', () => {
  assert.equal(computeMatchPoint(cricketMatch({ finished: true })), null);
});
test('match pas commencé -> null', () => {
  assert.equal(computeMatchPoint(cricketMatch({ started: false })), null);
});
test('mode inconnu (Bob\'s 27) -> null', () => {
  assert.equal(computeMatchPoint({ ...base, mode: "Bob's 27", players: ['A'], turn_player: 'A', scores: {} }), null);
});

console.log(`\n${passed} tests OK ✅ (matchPoint)`);
