// Data access — fetches games.json straight from GitHub raw so a freshly-pushed
// game (from the Android app) shows up without rebuilding the site.
// `?demo` loads the bundled sample instead.

const RAW_URL =
  'https://raw.githubusercontent.com/mokakejr/DartsCounter/master/docs/data/games.json';

const isDemo = () => new URLSearchParams(location.search).has('demo');

export async function loadGames() {
  const url = isDemo()
    ? `${import.meta.env.BASE_URL}games.sample.json`
    : `${RAW_URL}?t=${Date.now()}`;
  try {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch (e) {
    console.error('loadGames failed:', e);
    return [];
  }
}

// Mode display labels (kept tiny + local; matches the Android/data vocabulary).
export const MODE_LABEL = {
  Cricket: 'Cricket',
  SuperCricket: 'Super Cricket',
  Shanghai: 'Shanghai',
  FiftyOne: '51',
};

export function relDate(d) {
  const diff = (Date.now() - new Date(d)) / 864e5;
  if (diff < 1) return "aujourd'hui";
  if (diff < 2) return 'hier';
  if (diff < 7) return `il y a ${Math.floor(diff)} j`;
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
