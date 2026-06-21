// Tests de parité des modèles portés. Lancer : node pwa-dashboard/src/play/models/models.test.mjs
import assert from 'node:assert/strict';
import * as cricket from './cricket.js';
import * as sc from './superCricket.js';
import * as shanghai from './shanghai.js';
import * as f51 from './fiftyOne.js';

let passed = 0;
const test = (name, fn) => { fn(); passed++; console.log('  ✓', name); };

console.log('Cricket');
test('marques 1/2/3 = fermé, pas de points avant la 4e', () => {
  let s = cricket.initialCricketState(['A', 'B']);
  s = cricket.addHit(s, 0, 0, 3); // A ferme le 20 (3 marques)
  assert.equal(s.points[0], 0);
  assert.equal(cricket.isClosed(s, 0, 0), true);
});
test('NORMAL : marques au-delà de 3 scorent si un adversaire est ouvert', () => {
  let s = cricket.initialCricketState(['A', 'B']);
  s = cricket.addHit(s, 0, 0, 4); // 3 ferment + 1 scorante × 20
  assert.equal(s.points[0], 20);
});
test('NORMAL : pas de points si la cible est globalement fermée', () => {
  let s = cricket.initialCricketState(['A', 'B']);
  s = cricket.addHit(s, 0, 0, 3);
  s = cricket.addHit(s, 1, 0, 3); // les deux ont fermé le 20
  s = cricket.addHit(s, 0, 0, 1); // marque scorante mais cible globalement fermée
  assert.equal(s.points[0], 0);
});
test('CUT_THROAT : les points vont aux adversaires ouverts', () => {
  let s = cricket.initialCricketState(['A', 'B', 'C'], cricket.CRICKET_MODE.CUT_THROAT);
  s = cricket.addHit(s, 0, 0, 4); // B et C ouverts → +20 chacun
  assert.equal(s.points[1], 20);
  assert.equal(s.points[2], 20);
  assert.equal(s.points[0], 0);
});
test('NORMAL : victoire = tout fermé + score le plus haut', () => {
  let s = cricket.initialCricketState(['A', 'B']);
  for (let t = 0; t < cricket.CRICKET_TARGETS.length; t++) s = cricket.addHit(s, 0, t, 3);
  assert.equal(s.winner, 0);
});

console.log('Super Cricket');
test('scoring spécial (BED) attribué en NORMAL si adversaire ouvert', () => {
  let s = sc.initialSuperCricketState(['A', 'B']);
  s = sc.addSpecialScoring(s, 0, sc.SC_IDX_BED, 60); // triple 20
  assert.equal(s.points[0], 60);
});
test('scoring spécial CUT_THROAT va aux adversaires', () => {
  let s = sc.initialSuperCricketState(['A', 'B'], sc.SC_MODE.CUT_THROAT);
  s = sc.addSpecialScoring(s, 0, sc.SC_IDX_TRIPLE, 30);
  assert.equal(s.points[1], 30);
  assert.equal(s.points[0], 0);
});

console.log('Shanghai');
test('isShanghai détecte simple+double+triple', () => {
  assert.equal(shanghai.isShanghai([1, 2, 3]), true);
  assert.equal(shanghai.isShanghai([3, 2, 1]), true);
  assert.equal(shanghai.isShanghai([1, 1, 3]), false);
});
test('Shanghai → victoire immédiate', () => {
  let s = shanghai.initialShanghaiState(['A', 'B']);
  s = shanghai.addScore(s, 0, 0, 6, true);
  assert.equal(s.finished, true);
  assert.equal(shanghai.leader(s), 0);
});
test('progression rounds + leader au plus haut total', () => {
  let s = shanghai.initialShanghaiState(['A', 'B']);
  // round 0 : A marque 3, B marque 0 → passe au round 1
  s = shanghai.addScore(s, 0, 0, 3);
  assert.equal(s.currentPlayer, 1);
  assert.equal(s.currentRound, 0);
  s = shanghai.addScore(s, 1, 0, 0);
  assert.equal(s.currentRound, 1);
  assert.equal(s.currentPlayer, 0);
});

console.log('51');
test('marque uniquement si divisible par 5', () => {
  let s = f51.initialFiftyOneState(['A']);
  s = f51.scoreTurn(s, 0, 27); // non divisible → rien
  assert.equal(s.fives[0], 0);
  s = f51.scoreTurn(s, 0, 25); // +5 cinqs
  assert.equal(s.fives[0], 5);
});
test('bust si dépasse 51', () => {
  let s = f51.initialFiftyOneState(['A']);
  s = f51.scoreTurn(s, 0, 250 * 0 + 50 * 5); // 250 -> 50 cinqs
  assert.equal(s.fives[0], 50);
  s = f51.scoreTurn(s, 0, 10); // +2 → 52 > 51 → bust, reste 50
  assert.equal(s.fives[0], 50);
  s = f51.scoreTurn(s, 0, 5); // +1 → 51 exact → victoire
  assert.equal(s.fives[0], 51);
  assert.equal(s.winner, 0);
});

console.log(`\n${passed} tests OK ✅`);
