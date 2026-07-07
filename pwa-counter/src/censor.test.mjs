// node src/censor.test.mjs
import assert from 'node:assert/strict';
import { censorName } from './censor.js';

const censored = name => censorName(name) !== name;

// Substring : les mots collés dans le pseudo sont attrapés.
assert.equal(censorName('Prout'), '***');
assert.equal(censorName('xX_TeUb_Xx'), 'xX_***_Xx');
assert.ok(censored('GrosseMerde'));
assert.ok(censored('SalopeDu93'));
assert.ok(censored('enculeur2000'));
assert.ok(censored('fucker'));
assert.ok(censored('Connasse'));
assert.ok(censored('NiqueTaMereEnSlip')); // « niquetamere » en substring

// Mots isolés : censurés seulement bordés par non-lettre, casse ou bords.
assert.equal(censorName('Cul'), '***');
assert.ok(censored('xX_Cul_Xx'));
assert.ok(censored('Cul69'));
assert.ok(censored('nique_ta_mere'));
assert.ok(censored('NiqueLaPolice')); // transition de casse = frontière
assert.ok(censored('PD'));
assert.ok(censored('gros pd'));
assert.ok(censored('Le_Gland'));
assert.ok(censored('Niqueur_Fou'));

// Faux positifs Scunthorpe : prénoms et mots innocents intacts.
assert.equal(censorName('Monique'), 'Monique');
assert.equal(censorName('Dominique'), 'Dominique');
assert.equal(censorName('Hercule'), 'Hercule');
assert.equal(censorName('England'), 'England');
assert.equal(censorName('Montenegro'), 'Montenegro');
assert.equal(censorName('Piquenique'), 'Piquenique');
assert.equal(censorName('Cornichon'), 'Cornichon');
assert.equal(censorName('Culbuto'), 'Culbuto'); // cul non isolé
assert.equal(censorName('Glandeur'), 'Glandeur');
assert.equal(censorName('Consul'), 'Consul');

// Accents et casse : l'aplatissement attrape les variantes.
assert.ok(censored('Pùte'));
assert.ok(censored('SALOPE'));
assert.ok(censored('MÉRDÉ'));

// Compactage : jamais plus de trois étoiles d'affilée.
assert.ok(!/\*{4,}/.test(censorName('putain de merde')));

// Entrées vides inchangées.
assert.equal(censorName(''), '');
assert.equal(censorName(null), null);
assert.equal(censorName(undefined), undefined);

console.log('censor.test.mjs OK');
