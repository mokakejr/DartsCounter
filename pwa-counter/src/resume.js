// Reprise de partie après un reload accidentel : l'état de jeu React est
// snapshotté à chaque coup ; location.state (joueurs, variante, liveId)
// survit déjà au reload via l'history du navigateur — on ne persiste donc
// que la progression. Une seule partie active par appareil.
const KEY = 'dartsResume';
const MAX_AGE_MS = 2 * 3600 * 1000;

function playersKey(players) {
  return (players ?? []).join('|');
}

export function saveResume(route, players, data) {
  try {
    localStorage.setItem(KEY, JSON.stringify({
      route,
      players: playersKey(players),
      savedAt: Date.now(),
      data,
    }));
  } catch { /* stockage plein : tant pis, la reprise est un bonus */ }
}

export function loadResume(route, players) {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const saved = JSON.parse(raw);
    if (saved.route !== route) return null;
    if (saved.players !== playersKey(players)) return null;
    if (Date.now() - saved.savedAt > MAX_AGE_MS) return null;
    return saved.data;
  } catch {
    return null;
  }
}

// Pour le bandeau "Partie en pause" de l'accueil : la derniere partie
// active, quel que soit l'ecran, avec le state de navigation pour y revenir.
export function loadAnyResume(maxAgeMs = 3600 * 1000) {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const saved = JSON.parse(raw);
    if (Date.now() - saved.savedAt > maxAgeMs) return null;
    if (!saved.data?.nav) return null;
    return saved;
  } catch {
    return null;
  }
}

export function clearResume() {
  try { localStorage.removeItem(KEY); } catch { /* no-op */ }
}
