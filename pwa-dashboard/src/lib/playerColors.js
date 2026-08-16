// Couleur de joueur — un joueur garde la même teinte partout et sur tous les
// appareils, dérivée de son nom. Le joueur connecté est TOUJOURS l'accent :
// « moi vs les autres ».
//
// Avant, cette fonction produisait du HSL libre pendant que les graphes de
// modes utilisaient une échelle rouge : deux langages de couleur coexistaient
// sur le même écran. Tout passe désormais par l'échelle catégorielle unique de
// shared/design/tokens.css.

import { SERIES } from '../components/ChartTheme.jsx';

const ME = 'var(--accent)';

// FNV-1a — stable, minuscule, bonne dispersion sur des chaînes courtes.
function hash(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Teinte stable d'un nom, prise dans l'échelle catégorielle. */
export function stringToColor(key) {
  return SERIES[hash(String(key)) % SERIES.length];
}

export function playerColor(name, currentUserName) {
  return name === currentUserName ? ME : stringToColor(name);
}

/**
 * Attribue une couleur DISTINCTE à chaque nom d'une liste — indispensable pour
 * un graphe, où deux courbes de la même teinte sont un bug de lecture. Le
 * hachage sert de premier choix, puis on prend la première couleur libre.
 * Au-delà de 8 joueurs les couleurs se répètent forcément : c'est pourquoi les
 * graphes se limitent au top 5.
 */
export function playerPalette(names, currentUserName) {
  const used = new Set();
  const out = {};
  for (const name of names) {
    if (name === currentUserName) { out[name] = ME; continue; }
    const start = hash(String(name)) % SERIES.length;
    let color = SERIES[start];
    if (used.has(color)) {
      const free = SERIES.find(c => !used.has(c));
      if (free) color = free;
    }
    used.add(color);
    out[name] = color;
  }
  return out;
}
