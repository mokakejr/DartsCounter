// Censure d'affichage des pseudos : les mots interdits deviennent ***.
// ponytail: match substring (les pseudos collent les mots : xX_TeUb_Xx),
// donc uniquement des mots >= 4 lettres et sans piège Scunthorpe évident
// (pas de « nique » : Monique/Dominique ; pas de « cul » : Hercule).
// Liste à étoffer au fil des trouvailles.
const BANNED = [
  'teub', 'prout', 'bite', 'zizi', 'pute', 'putain', 'couille', 'salope',
  'encule', 'penis', 'merde', 'connard', 'batard', 'chatte', 'salaud',
  'fdp', 'ntm',
];

const PATTERN = new RegExp(BANNED.join('|'), 'g');

export function censorName(name) {
  if (!name) return name;
  // Un code point original -> exactement un char aplati (minuscule, sans
  // accent) : les index du match se reportent tels quels sur l'original.
  const chars = [...name];
  const flat = chars.map(c => c.normalize('NFD')[0].toLowerCase()).join('');
  let hit = false;
  for (const m of flat.matchAll(PATTERN)) {
    hit = true;
    for (let i = m.index; i < m.index + m[0].length; i++) chars[i] = '*';
  }
  return hit ? chars.join('').replace(/\*{2,}/g, '***') : name;
}
