// Data access — fetches games from the FastAPI backend (see src/api/games.js).
// `?demo` loads the bundled sample instead, for offline/preview use.

import { fetchGames } from '../api/games.js';

const isDemo = () => new URLSearchParams(location.search).has('demo');

export async function loadGames() {
  if (isDemo()) {
    const res = await fetch(`${import.meta.env.BASE_URL}games.sample.json`, { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  }
  return fetchGames();
}

// Mode display labels (kept tiny + local; matches the Android/data vocabulary).
export const MODE_LABEL = {
  Cricket: 'Cricket',
  SuperCricket: 'Super Cricket',
  Shanghai: 'Shanghai',
  FiftyOne: '51',
  Bob27: "Bob's 27",
  RoundTheClock: 'Round the Clock',
};

export function relDate(d) {
  const ms = Date.now() - new Date(d);
  const min = ms / 6e4;
  // En journée de jeu, "aujourd'hui" n'aide pas — on affiche le temps écoulé.
  if (min < 1) return "à l'instant";
  if (min < 60) return `il y a ${Math.floor(min)} min`;
  const hours = min / 60;
  if (hours < 24) return `il y a ${Math.floor(hours)} h`;
  const days = hours / 24;
  if (days < 2) return 'hier';
  if (days < 7) return `il y a ${Math.floor(days)} j`;
  return new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
}

export function fmtDuration(seconds = 0) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  if (m >= 60) {
    const h = Math.floor(m / 60);
    return `${h}h${String(m % 60).padStart(2, '0')}`;
  }
  return `${m}m${String(s).padStart(2, '0')}`;
}
