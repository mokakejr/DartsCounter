// node src/modes/board.test.mjs
import assert from 'node:assert/strict';
import { SECTORS, RADII, hitPoints, hitLabel, hitAt, sectorPath } from './board.js';

// Sector layout sanity.
assert.equal(SECTORS.length, 20);
assert.equal(new Set(SECTORS).size, 20);
assert.equal(SECTORS[0], 20);

// Scoring.
assert.equal(hitPoints({ value: 20, ring: 'T' }), 60);
assert.equal(hitPoints({ value: 19, ring: 'D' }), 38);
assert.equal(hitPoints({ value: 7, ring: 'S' }), 7);
assert.equal(hitPoints({ value: 25, ring: 'DBULL' }), 50);
assert.equal(hitPoints({ value: 0, ring: 'MISS' }), 0);
assert.equal(hitLabel({ value: 20, ring: 'T' }), 'T20');
assert.equal(hitLabel({ value: 25, ring: 'BULL' }), '25');

// Point classification: straight up = 20 in each band.
const mid = (a, b) => (a + b) / 2;
assert.deepEqual(hitAt(0, -mid(RADII.outerBull, RADII.tripleInner)), { value: 20, ring: 'S' });
assert.deepEqual(hitAt(0, -mid(RADII.tripleInner, RADII.tripleOuter)), { value: 20, ring: 'T' });
assert.deepEqual(hitAt(0, -mid(RADII.doubleInner, RADII.doubleOuter)), { value: 20, ring: 'D' });
assert.deepEqual(hitAt(0, 0), { value: 25, ring: 'DBULL' });
assert.deepEqual(hitAt(0, -mid(RADII.innerBull, RADII.outerBull)), { value: 25, ring: 'BULL' });
assert.deepEqual(hitAt(0, -105), { value: 0, ring: 'MISS' });

// Straight down = 3; right = 6; left = 11 (standard board).
assert.equal(hitAt(0, 70).value, 3);
assert.equal(hitAt(70, 0).value, 6);
assert.equal(hitAt(-70, 0).value, 11);

// Sector paths are valid-looking and distinct.
const p0 = sectorPath(0, RADII.outerBull, RADII.doubleOuter);
const p1 = sectorPath(1, RADII.outerBull, RADII.doubleOuter);
assert.ok(p0.startsWith('M ') && p0.endsWith('Z'));
assert.notEqual(p0, p1);

console.log('board.test.mjs OK');
