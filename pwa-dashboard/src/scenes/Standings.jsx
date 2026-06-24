import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { ALL_MODES } from '../lib/stats.js';
import { MODE_LABEL } from '../lib/data.js';
import { displayName, avatarStyle } from '../lib/profiles.js';
import { fetchLeaderboard } from '../api/stats.js';
import './Standings.css';

const FILTERS = ['Global', ...ALL_MODES];

function rankClass(i) {
  return i < 3 ? `r${i + 1}` : 'rn';
}

export default function Standings({ ranked, profiles = {} }) {
  const [filter, setFilter] = useState('Global');
  // Elo is ranked server-side (it's the whole point of the rating engine) —
  // fetched per filter and cached so flipping between tabs doesn't refetch.
  const [eloByFilter, setEloByFilter] = useState({});

  useEffect(() => {
    if (eloByFilter[filter]) return;
    fetchLeaderboard(filter === 'Global' ? undefined : filter)
      .then(rows => {
        const byName = Object.fromEntries(rows.map(r => [r.name, r]));
        setEloByFilter(prev => ({ ...prev, [filter]: byName }));
      })
      .catch(() => {});
  }, [filter, eloByFilter]);

  const elo = eloByFilter[filter] || {};

  const rows = useMemo(() => {
    const base = filter === 'Global'
      ? ranked
      : ranked
          .map(s => ({ ...s, _wins: s.modeWins[filter] || 0, _games: s.modeGames[filter] || 0 }))
          .filter(s => s._games > 0);

    return [...base].sort((a, b) => {
      const eloA = elo[a.name]?.elo;
      const eloB = elo[b.name]?.elo;
      if (eloA != null && eloB != null) return eloB - eloA;
      // Elo for this filter hasn't loaded yet — fall back to wins so the
      // list isn't empty/unordered for a moment, then re-sorts once it has.
      const winsA = filter === 'Global' ? a.wins : a._wins;
      const winsB = filter === 'Global' ? b.wins : b._wins;
      return winsB - winsA;
    });
  }, [ranked, filter, elo]);

  return (
    <section className="standings shell" id="classement">
      <div className="sec-head">
        <p className="eyebrow">01 — Classement</p>
        <h2 className="display sec-title">Qui domine&nbsp;?</h2>
        <div className="standings__filters">
          {FILTERS.map(f => (
            <button
              key={f}
              className={`chip ${filter === f ? 'chip--on' : ''}`}
              onClick={() => setFilter(f)}
            >
              {f === 'Global' ? 'Global' : MODE_LABEL[f]}
            </button>
          ))}
        </div>
      </div>

      <ol className="ladder">
        {rows.map((s, i) => {
          const wins = filter === 'Global' ? s.wins : s._wins;
          const games = filter === 'Global' ? s.games : s._games;
          const playerElo = elo[s.name];
          return (
            <motion.li
              key={s.name}
              className={`ladder__row ${rankClass(i)}`}
              initial={{ opacity: 0, y: 18 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-60px' }}
              transition={{ duration: 0.45, delay: Math.min(i * 0.04, 0.3) }}
            >
              <span className={`ladder__rank ${rankClass(i)}`}>{i + 1}</span>
              <Link to={`/joueur/${encodeURIComponent(s.name)}`} className="ladder__avatar" style={avatarStyle(profiles, s.name)}>
                {!profiles[s.name]?.avatar_url && s.name.charAt(0)}
              </Link>
              <Link to={`/joueur/${encodeURIComponent(s.name)}`} className="ladder__name">
                {displayName(profiles, s.name)}
                <span className="ladder__lv">niv. {s.level.lv} · {s.level.name}</span>
              </Link>
              <span className="ladder__stat">
                <b>{wins}</b><em>{wins === 1 ? 'victoire' : 'victoires'}</em>
              </span>
              <span className="ladder__stat ladder__stat--rate">
                <b style={{ color: 'var(--win)' }}>{playerElo ? playerElo.elo : '—'}</b>
                <em>{playerElo ? playerElo.rank : 'elo'}</em>
              </span>
              <span className="ladder__stat ladder__stat--hide">
                <b>{games}</b><em>{games === 1 ? 'partie' : 'parties'}</em>
              </span>
            </motion.li>
          );
        })}
        {rows.length === 0 && <li className="ladder__empty">Aucune partie dans ce mode.</li>}
      </ol>
    </section>
  );
}
