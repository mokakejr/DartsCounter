// Tests de parité des modèles portés. Lancer : node pwa-dashboard/src/play/models/models.test.mjs
import assert from 'node:assert/strict';
import * as cricket from './cricket.js';
import * as sc from './superCricket.js';
import * as shanghai from './shanghai.js';
import * as shanghaiVariants from './shanghaiVariants.js';
import * as f51 from './fiftyOne.js';
import * as killer from './killer.js';
import * as halveIt from './halveIt.js';

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
const CLASSIC_TARGETS = [1, 2, 3, 4, 5, 6, 7];
test('isInstantWin détecte simple+double+triple sur une cible normale', () => {
  assert.equal(shanghai.isInstantWin([1, 2, 3], 5), true);
  assert.equal(shanghai.isInstantWin([3, 2, 1], 5), true);
  assert.equal(shanghai.isInstantWin([1, 1, 3], 5), false);
});
test('isInstantWin sur un round BULL exige 3 doubles (pas de triple bull)', () => {
  assert.equal(shanghai.isInstantWin([2, 2, 2], shanghai.BULL), true);
  assert.equal(shanghai.isInstantWin([1, 2, 3], shanghai.BULL), false); // pas de triple bull possible
  assert.equal(shanghai.isInstantWin([2, 2, 1], shanghai.BULL), false);
});
test('Shanghai → victoire immédiate', () => {
  let s = shanghai.initialShanghaiState(['A', 'B'], CLASSIC_TARGETS);
  s = shanghai.addScore(s, 0, 0, 6, true);
  assert.equal(s.finished, true);
  assert.equal(shanghai.leader(s), 0);
});
test('progression rounds + leader au plus haut total', () => {
  let s = shanghai.initialShanghaiState(['A', 'B'], CLASSIC_TARGETS);
  // round 0 : A marque 3, B marque 0 → passe au round 1
  s = shanghai.addScore(s, 0, 0, 3);
  assert.equal(s.currentPlayer, 1);
  assert.equal(s.currentRound, 0);
  s = shanghai.addScore(s, 1, 0, 0);
  assert.equal(s.currentRound, 1);
  assert.equal(s.currentPlayer, 0);
});
test('nombre de rounds dérivé de targets.length (pas une constante fixe)', () => {
  let s = shanghai.initialShanghaiState(['A'], shanghaiVariants.bullTargets());
  for (let i = 0; i < 21; i++) s = shanghai.addScore(s, 0, i, 1);
  assert.equal(s.finished, true);
});

console.log('Shanghai variants — génération des cibles');
test('bullTargets : 1 à 20 puis bull, dans l’ordre, 21 cibles', () => {
  const t = shanghaiVariants.bullTargets();
  assert.equal(t.length, 21);
  assert.deepEqual(t.slice(0, 20), Array.from({ length: 20 }, (_, i) => i + 1));
  assert.equal(t[20], shanghai.BULL);
});
test('randomTargets : 7 valeurs distinctes de {1..20, BULL}, triées', () => {
  const pool = new Set([...Array.from({ length: 20 }, (_, i) => i + 1), shanghai.BULL]);
  for (let i = 0; i < 20; i++) {
    const t = shanghaiVariants.randomTargets();
    assert.equal(t.length, 7);
    assert.equal(new Set(t).size, 7); // pas de doublon
    t.forEach(v => assert.equal(pool.has(v), true));
    const sorted = [...t].sort((a, b) => a - b);
    assert.deepEqual(t, sorted); // toujours croissant
  }
});
test('randomTargets : le bull, s’il est tiré, trie en dernier', () => {
  // Force un tirage suffisamment de fois pour voir le bull apparaître au moins une fois.
  let sawBullLast = false;
  for (let i = 0; i < 200 && !sawBullLast; i++) {
    const t = shanghaiVariants.randomTargets();
    if (t.includes(shanghai.BULL)) sawBullLast = t[t.length - 1] === shanghai.BULL;
  }
  assert.equal(sawBullLast, true);
});
test('crazyTargets : 7 valeurs distinctes de {1..20, BULL}, ordre non trié (au moins une fois sur N essais)', () => {
  const pool = new Set([...Array.from({ length: 20 }, (_, i) => i + 1), shanghai.BULL]);
  let sawUnsorted = false;
  for (let i = 0; i < 50 && !sawUnsorted; i++) {
    const t = shanghaiVariants.crazyTargets();
    assert.equal(t.length, 7);
    assert.equal(new Set(t).size, 7);
    t.forEach(v => assert.equal(pool.has(v), true));
    const sorted = [...t].sort((a, b) => a - b);
    if (JSON.stringify(t) !== JSON.stringify(sorted)) sawUnsorted = true;
  }
  assert.equal(sawUnsorted, true);
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

console.log('Killer');
test('canTarget : soi-même toujours ciblable, adversaire seulement une fois killer', () => {
  const s = killer.initialKillerState(['A', 'B'], [5, 10], 3);
  assert.equal(killer.canTarget(s, 0, 0), true);
  assert.equal(killer.canTarget(s, 0, 1), false);
});
test('toucher son propre numéro devient killer (sans perdre de vie)', () => {
  const s0 = killer.initialKillerState(['A', 'B'], [5, 10], 3);
  const s1 = killer.playDart(s0, 0);
  assert.equal(s1.players[0].isKiller, true);
  assert.equal(s1.players[0].lives, 3);
  assert.equal(s1.currentPlayer, 0); // même tour, 1er des 3 fléchettes
  assert.equal(s1.dartsThisTurn, 1);
});
test('une fois killer, toucher un adversaire lui retire une vie', () => {
  let s = killer.initialKillerState(['A', 'B'], [5, 10], 3);
  s = killer.playDart(s, 0); // A devient killer
  s = killer.playDart(s, 1); // A touche B
  assert.equal(s.players[1].lives, 2);
});
test('attaquer avant d\'être killer n\'a aucun effet (mais consomme la fléchette)', () => {
  let s = killer.initialKillerState(['A', 'B'], [5, 10], 3);
  s = killer.playDart(s, 1); // A pas encore killer, cible B
  assert.equal(s.players[1].lives, 3); // inchangé
  assert.equal(s.dartsThisTurn, 1); // la fléchette est quand même comptée
});
test('re-toucher son propre numéro une fois killer = self-kill', () => {
  let s = killer.initialKillerState(['A', 'B'], [5, 10], 1);
  s = killer.playDart(s, 0); // A devient killer (1 vie, pas éliminé)
  assert.equal(s.players[0].eliminated, false);
  s = killer.playDart(s, 0); // self-kill : 1 -> 0 vies
  assert.equal(s.players[0].eliminated, true);
  assert.deepEqual(s.eliminationOrder, ['A']);
  // il ne reste que B -> partie terminée, B gagne
  assert.equal(s.finished, true);
  assert.equal(s.winner, 'B');
});
test('le tour saute les joueurs éliminés', () => {
  let s = killer.initialKillerState(['A', 'B', 'C'], [1, 2, 3], 1);
  s = killer.playDart(s, 0); // A devient killer
  s = killer.playDart(s, 1); // B éliminé (1 vie)
  s = killer.playDart(s, null); // 3e fléchette : manqué, fin du tour de A
  assert.equal(s.dartsThisTurn, 0);
  assert.equal(s.currentPlayer, 2); // saute B (éliminé), tombe sur C
});
test('eliminationScores : gagnant = N, premier éliminé = 1', () => {
  const s = { players: [{ name: 'A' }, { name: 'B' }, { name: 'C' }], eliminationOrder: ['B', 'C'], winner: 'A' };
  assert.deepEqual(killer.eliminationScores(s), [3, 1, 2]);
});

console.log('Halve It');
test('0 point divise le score courant par 2, arrondi vers le bas', () => {
  let s = halveIt.initialHalveItState(['A'], [20, 19]);
  s = halveIt.scoreRound(s, 0, 55);
  assert.equal(s.scores[0], 55);
  assert.equal(s.finished, false);
  s = halveIt.scoreRound(s, 0, 0); // floor(55/2) = 27
  assert.equal(s.scores[0], 27);
  assert.equal(s.finished, true);
});
test('progression des rounds/joueurs + leader au score le plus haut', () => {
  let s = halveIt.initialHalveItState(['A', 'B'], [20, 19]);
  s = halveIt.scoreRound(s, 0, 10);
  assert.equal(s.currentPlayer, 1);
  assert.equal(s.currentRound, 0);
  s = halveIt.scoreRound(s, 1, 20);
  assert.equal(s.currentPlayer, 0);
  assert.equal(s.currentRound, 1);
  s = halveIt.scoreRound(s, 0, 5); // A: 10+5=15
  s = halveIt.scoreRound(s, 1, 0); // B: floor(20/2)=10
  assert.equal(s.finished, true);
  assert.deepEqual(s.scores, [15, 10]);
  assert.equal(halveIt.leader(s), 0);
});
test('égalité -> pas de leader', () => {
  let s = halveIt.initialHalveItState(['A', 'B'], [20]);
  s = halveIt.scoreRound(s, 0, 10);
  s = halveIt.scoreRound(s, 1, 10);
  assert.equal(s.finished, true);
  assert.equal(halveIt.leader(s), null);
});
test('séquences standard (9) et courte (6)', () => {
  assert.equal(halveIt.HALVEIT_SEQUENCES.standard.length, 9);
  assert.equal(halveIt.HALVEIT_SEQUENCES.short.length, 6);
});
test('roundLabel', () => {
  assert.equal(halveIt.roundLabel(20), '20');
  assert.equal(halveIt.roundLabel('doubles'), 'DOUBLES');
  assert.equal(halveIt.roundLabel('triples'), 'TRIPLES');
  assert.equal(halveIt.roundLabel('bull'), 'BULL');
});

console.log(`\n${passed} tests OK ✅`);
