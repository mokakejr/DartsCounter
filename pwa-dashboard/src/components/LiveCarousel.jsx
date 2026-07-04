import { useEffect, useState } from 'react';
import { apiGet } from '../api/client.js';
import { useLeague } from '../lib/useLeague.jsx';
import './LiveCarousel.css';

const COUNTER_URL = import.meta.env.VITE_COUNTER_URL || 'http://localhost:5174';
const POLL_MS = 10_000; // ponytail: polling suffit au dashboard ; WS si un jour 10s paraissent longs

/**
 * Le Panneau d'Affichage Live (Epic 10.2): les parties en cours, en tête du
 * Hub. Invisible s'il n'y a rien à regarder. Plusieurs cibles peuvent
 * tourner en même temps -> cartes horizontales scrollables.
 */
export default function LiveCarousel() {
  const { activeLeague } = useLeague();
  const [matches, setMatches] = useState([]);

  useEffect(() => {
    let cancelled = false;
    async function poll() {
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
    <section className="live-carousel shell">
      <div className="live-carousel__track">
        {visible.map(m => (
          <article key={m.id} className="live-carousel__card">
            <header className="live-carousel__head">
              <span className="live-carousel__badge">🔴 LIVE</span>
              <span className="live-carousel__round">
                {m.mode}{m.round > 1 ? ` · Tour ${m.round}` : ''}
              </span>
            </header>
            <div className="live-carousel__score">
              {m.players.map((p, i) => (
                <span key={p} className="live-carousel__player">
                  {i > 0 && <em className="live-carousel__vs">—</em>}
                  <b>{p}</b> {m.scores?.[p] ?? 0}
                </span>
              ))}
            </div>
            <a
              className="live-carousel__cta"
              href={`${COUNTER_URL}/watch/${m.id}`}
              target="_blank"
              rel="noreferrer"
            >
              🎟️ Rejoindre les Gradins
              {m.spectators > 0 && <span> · {m.spectators} 👀</span>}
            </a>
          </article>
        ))}
      </div>
    </section>
  );
}
