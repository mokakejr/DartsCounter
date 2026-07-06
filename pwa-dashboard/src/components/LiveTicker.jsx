import { useEffect, useState } from 'react';
import { apiGet } from '../api/client.js';
import { useLeague } from '../lib/useLeague.jsx';
import './LiveTicker.css';

const COUNTER_URL = import.meta.env.VITE_COUNTER_URL || 'http://localhost:5174';
const POLL_MS = 10_000; // ponytail: polling suffit au dashboard ; WS si un jour 10s paraissent longs

/**
 * La barre LIVE du lobby (Epic 5.3) : plus une carte posée sur la page, mais
 * un élément de HUD — fine ligne pleine largeur collée sous le header, fond
 * translucide, texte néon. Invisible s'il n'y a rien à regarder.
 */
export default function LiveTicker() {
  const { activeLeague } = useLeague();
  const [matches, setMatches] = useState([]);

  useEffect(() => {
    let cancelled = false;
    async function poll() {
      if (document.hidden) return; // onglet caché : on économise API et batterie
      try {
        const rows = await apiGet('/live/matches');
        if (!cancelled) setMatches(rows);
      } catch {
        if (!cancelled) setMatches([]);
      }
    }
    poll();
    const t = setInterval(poll, POLL_MS);
    return () => { cancelled = true; clearInterval(t); };
  }, []);

  // Ligue active -> seulement les matchs impliquant ses membres.
  const leaguePlayers = activeLeague ? new Set(activeLeague.players) : null;
  const visible = matches.filter(
    m => m.started && !m.finished && (!leaguePlayers || m.players.some(p => leaguePlayers.has(p)))
  );

  if (visible.length === 0) return null;

  return (
    <div className="live-ticker">
      <span className="live-ticker__badge">🔴 LIVE</span>
      {visible.map(m => (
        <span key={m.id} className="live-ticker__match">
          {m.players.map((p, i) => (
            <span key={p}>
              {i > 0 && ' vs '}
              <b>{p}</b> ({m.scores?.[p] ?? 0})
            </span>
          ))}
          <a
            className="live-ticker__cta"
            href={`${COUNTER_URL}/watch/${m.id}`}
            target="_blank"
            rel="noreferrer"
          >
            {/* Les 👀 sont toujours là — l'appât marche aussi gradins vides. */}
            👀{m.spectators > 0 ? ` ${m.spectators} ·` : ''} REJOINDRE LES GRADINS
          </a>
        </span>
      ))}
    </div>
  );
}
