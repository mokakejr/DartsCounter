// Censure d'affichage des pseudos : les mots interdits deviennent ***.
// Deux niveaux :
// - BANNED_SUBSTRING : match n'importe où (les pseudos collent les mots :
//   xX_TeUb_Xx) — uniquement des mots >= 4 lettres et sans piège Scunthorpe
//   évident.
// - BANNED_WORD : mots courts ou piégés (« nique » : Monique/Dominique ;
//   « cul » : Hercule ; « gland » : England ; « nichon » : Cornichon) —
//   censurés seulement en mot isolé : bordés par début/fin de chaîne, un
//   caractère non-lettre (_, -, espace, chiffre…) ou une transition de
//   casse minuscule→majuscule (xX_Cul_Xx, NiqueTaMere).
// Listes à étoffer au fil des trouvailles.
const BANNED_SUBSTRING = [
  'teub', 'prout', 'bite', 'zizi', 'pute', 'putain', 'couille', 'salope',
  'encul', 'penis', 'merde', 'connard', 'batard', 'chatte', 'salaud',
  'fdp', 'ntm',
  'connasse', 'conasse', 'enfoire', 'poufiasse', 'pouffiasse', 'petasse',
  'grognasse', 'salopard', 'branleur', 'branlette', 'trouduc', 'ducon',
  'gogole', 'abruti', 'cretin', 'tarlouz', 'tafiole', 'foutre', 'bougnoule',
  'youpin', 'zgeg', 'chibre', 'suceur', 'suceuse', 'niquetamere', 'travelo',
  'raclure', 'garce', 'wanker', 'twat', 'fuck', 'shit', 'bitch', 'asshole',
  'cunt', 'whore', 'slut', 'pussy', 'nigga', 'nigger', 'faggot', 'biatch',
];

const BANNED_WORD = [
  'nique', 'niquer', 'niqueur', 'cul', 'culs', 'con', 'conne', 'pd', 'pede',
  'gland', 'negre', 'negro', 'nazi', 'anus', 'suce', 'zob', 'zobi', 'nichon',
  'dick', 'cock', 'tits', 'cum', 'fag',
];

// Alternatives triées par longueur décroissante : au même index, le regex
// doit préférer « niqueur » à « nique » (sinon la frontière de fin échoue).
const byLengthDesc = words => [...words].sort((a, b) => b.length - a.length);
const SUBSTRING_PATTERN = new RegExp(byLengthDesc(BANNED_SUBSTRING).join('|'), 'g');
const WORD_PATTERN = new RegExp(byLengthDesc(BANNED_WORD).join('|'), 'g');

const isFlatLetter = ch => ch >= 'a' && ch <= 'z';
const isLower = ch => ch !== ch.toUpperCase() && ch === ch.toLowerCase();
const isUpper = ch => ch !== ch.toLowerCase() && ch === ch.toUpperCase();

export function censorName(name) {
  if (!name) return name;
  // Un code point original -> exactement un char aplati (minuscule, sans
  // accent) : les index du match se reportent tels quels sur l'original.
  const chars = [...name];
  const flat = chars.map(c => c.normalize('NFD')[0].toLowerCase()).join('');
  // Frontière de mot entre i-1 et i ? (voir BANNED_WORD ci-dessus)
  const boundary = i =>
    i <= 0 || i >= flat.length ||
    !isFlatLetter(flat[i - 1]) || !isFlatLetter(flat[i]) ||
    (isLower(chars[i - 1]) && isUpper(chars[i]));
  let hit = false;
  const mark = m => {
    hit = true;
    for (let i = m.index; i < m.index + m[0].length; i++) chars[i] = '*';
  };
  for (const m of flat.matchAll(SUBSTRING_PATTERN)) mark(m);
  for (const m of flat.matchAll(WORD_PATTERN)) {
    if (boundary(m.index) && boundary(m.index + m[0].length)) mark(m);
  }
  return hit ? chars.join('').replace(/\*{2,}/g, '***') : name;
}
