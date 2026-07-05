import { useCallback, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { useAuth } from '../lib/useAuth.jsx';
import { relDate } from '../lib/data.js';
import * as api from '../api/leagues.js';
import './LeagueFeed.css';

const EVENT_TITLES = {
  USURPATION: "COUP D'ÉTAT !",
  CLEAN_SWEEP: 'LE CONTRAT EST REMPLI !',
  STREAK_BROKEN: 'FIN DE SÉRIE !',
  PHENIX: 'LE PHÉNIX !',
  REMONTADA: 'LA REMONTADA !',
};

function PlayerLink({ p }) {
  if (!p) return null;
  return (
    <Link to={`/joueur/${encodeURIComponent(p.name)}`} className="lfeed__pseudo">
      {p.avatar_url
        ? <img className="lfeed__avatar" src={p.avatar_url} alt="" />
        : <span className="lfeed__avatar lfeed__avatar--initial">{p.name.charAt(0)}</span>}
      {p.display_name || p.name}
    </Link>
  );
}

// Le Journal de Bord (Epic 9.2): récits compétitifs automatisés de la ligue
// active, avec les CTAs sociaux Provoquer / Respect.
export default function LeagueFeed({ league }) {
  const auth = useAuth();
  const [events, setEvents] = useState(null);

  const load = useCallback(() => {
    if (!auth.token || !league) return;
    api.fetchLeagueEvents(auth.token, league.id).then(setEvents).catch(() => setEvents([]));
  }, [auth.token, league]);

  useEffect(load, [load]);

  if (!league || !auth.player || !events || events.length === 0) return null;

  async function respect(event) {
    try {
      const { respect_count } = await api.respectEvent(auth.token, league.id, event.id);
      setEvents(evts => evts.map(e => (e.id === event.id ? { ...e, respect_count } : e)));
    } catch { /* best-effort */ }
  }

  async function provoke(event) {
    try {
      await api.provokeEvent(auth.token, league.id, event.id);
      setEvents(evts => evts.map(e => (e.id === event.id ? { ...e, _provoked: true } : e)));
    } catch { /* best-effort */ }
  }

  return (
    <div className="lfeed">
      <h3 className="rivals__title eyebrow">Journal de bord — {league.name}</h3>
      {events.slice(0, 6).map((e, i) => (
        <motion.article
          key={e.id}
          className="lfeed__card"
          initial={{ opacity: 0, y: 14 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-40px' }}
          transition={{ duration: 0.4, delay: Math.min(i * 0.05, 0.25) }}
        >
          <header className="lfeed__head">
            <PlayerLink p={e.actor} />
            <span className="lfeed__when">{relDate(e.created_at)}</span>
          </header>
          <div className="lfeed__body">
            <span className="lfeed__type">{EVENT_TITLES[e.event_type] ?? e.event_type}</span>
            <p className="lfeed__story">
              {e.story_text}
              {e.target && <> — <PlayerLink p={e.target} /></>}
            </p>
          </div>
          <footer className="lfeed__foot">
            {e.target && e.target.id !== auth.player.id && (
              <button
                className="lfeed__btn"
                disabled={e._provoked}
                onClick={() => provoke(e)}
              >
                {e._provoked ? 'Provoqué ⚔️' : '⚔️ Provoquer'}
              </button>
            )}
            <button className="lfeed__btn" onClick={() => respect(e)}>
              🫡 Respect{e.respect_count > 0 && <b> · {e.respect_count}</b>}
            </button>
          </footer>
        </motion.article>
      ))}
    </div>
  );
}

const PILLARS = [
  { id: 'REGNE', title: 'Le Règne Ancestral', unit: 'jours au sommet', icon: '👑' },
  { id: 'TUEUR_A_GAGES', title: 'Le Tueur à Gages', unit: 'parties parfaites', icon: '🎯' },
  { id: 'STAKHANOVISTE', title: 'Le Stakhanoviste', unit: 'parties jouées', icon: '⚒️' },
  { id: 'REMONTADA', title: 'La Remontada', unit: 'écart renversé', icon: '🔄' },
];

// Le Panthéon (Epic 9.3): les records immuables de la ligue.
export function Pantheon({ league }) {
  const auth = useAuth();
  const [records, setRecords] = useState(null);

  useEffect(() => {
    if (!auth.token || !league) return;
    api.fetchPantheon(auth.token, league.id).then(setRecords).catch(() => setRecords([]));
  }, [auth.token, league]);

  if (!league || !records || records.length === 0) return null;
  const byPillar = Object.fromEntries(records.map(r => [r.pillar, r]));

  return (
    <div className="pantheon">
      <h3 className="rivals__title eyebrow">Panthéon — {league.name}</h3>
      <div className="pantheon__grid">
        {PILLARS.map(({ id, title, unit, icon }) => {
          const r = byPillar[id];
          return (
            <div key={id} className={`pantheon__cell${r ? '' : ' pantheon__cell--empty'}`}>
              <span className="pantheon__icon">{icon}</span>
              <span className="pantheon__title">{title}</span>
              {r ? (
                <>
                  <PlayerLink p={r.holder} />
                  <span className="pantheon__value"><b>{r.value}</b> {unit}</span>
                </>
              ) : (
                <span className="pantheon__value">À conquérir</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
