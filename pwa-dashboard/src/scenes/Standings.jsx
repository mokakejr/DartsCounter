import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { ALL_MODES } from '../lib/stats.js';
import { MODE_LABEL } from '../lib/data.js';
import { displayName } from '../lib/profiles.js';
import PlayerCard from '../components/PlayerCard.jsx';
import { fetchLeaderboard } from '../api/stats.js';
import { fetchEloSettings } from '../api/elo.js';
import './Standings.css';

const FILTERS = ['Global', ...ALL_MODES];
// Backend default (see EloSettings.min_ranked_games) — overwritten once
// /elo/settings loads, so a player can tune it without a redeploy.
const DEFAULT_MIN_RANKED_GAMES = 5;

function rankClass(i) {
  return i < 3 ? `r${i + 1}` : 'rn';
}

export default function Standings({ ranked, profiles = {} }) {
  const [filter, setFilter] = useState('Global');
  // Elo is ranked server-side (it's the whole point of the rating engine) —
  // fetched per filter and cached so flipping between tabs doesn't refetch.
  const [eloByFilter, setEloByFilter] = useState({});
  const [minRankedGames, setMinRankedGames] = useState(DEFAULT_MIN_RANKED_GAMES);

  useEffect(() => {
    fetchEloSettings().then(s => setMinRankedGames(s.min_ranked_games)).catch(() => {});
  }, []);

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

  const { rankedRows, unrankedRows } = useMemo(() => {
    const base = filter === 'Global'
      ? ranked
      : ranked
          .map(s => ({ ...s, _wins: s.modeWins[filter] || 0, _games: s.modeGames[filter] || 0 }))
          .filter(s => s._games > 0);

    const gamesOf = s => (filter === 'Global' ? s.games : s._games);
    const winsOf = s => (filter === 'Global' ? s.wins : s._wins);

    const sorted = [...base].sort((a, b) => {
      const eloA = elo[a.name]?.elo;
      const eloB = elo[b.name]?.elo;
      if (eloA != null && eloB != null) return eloB - eloA;
      // Elo for this filter hasn't loaded yet — fall back to wins so the
      // list isn't empty/unordered for a moment, then re-sorts once it has.
      return winsOf(b) - winsOf(a);
    });

    return {
      rankedRows: sorted.filter(s => gamesOf(s) >= minRankedGames),
      unrankedRows: sorted
        .filter(s => gamesOf(s) < minRankedGames)
        .sort((a, b) => gamesOf(b) - gamesOf(a)),
    };
  }, [ranked, filter, elo, minRankedGames]);

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
        {rankedRows.map((s, i) => (
          <LadderRow
            key={s.name}
            s={s}
            i={i}
            filter={filter}
            profiles={profiles}
            playerElo={elo[s.name]}
            isRanked
          />
        ))}

        {unrankedRows.length > 0 && (
          <li className="ladder__divider">
            Non classés <span>· moins de {minRankedGames} parties</span>
          </li>
        )}
        {unrankedRows.map((s, i) => (
          <LadderRow
            key={s.name}
            s={s}
            i={i}
            filter={filter}
            profiles={profiles}
            playerElo={elo[s.name]}
            isRanked={false}
          />
        ))}

        {rankedRows.length === 0 && unrankedRows.length === 0 && (
          <li className="ladder__empty">Aucune partie dans ce mode.</li>
        )}
      </ol>
    </section>
  );
}

// Médailles top 3 (Epic 2.2): icône + bordure or/argent/bronze.
const MEDALS = ['🥇', '🥈', '🥉'];

function LadderRow({ s, i, filter, profiles, playerElo, isRanked }) {
  const wins = filter === 'Global' ? s.wins : s._wins;
  const games = filter === 'Global' ? s.games : s._games;
  const rank = isRanked ? rankClass(i) : 'rn';
  const winRate = games ? wins / games : 0;
  const profile = profiles[s.name];
  return (
    <motion.li
      className={`ladder__row ${rank} ${isRanked ? '' : 'ladder__row--unranked'}`}
      initial={{ opacity: 0, y: 18 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-60px' }}
      transition={{ duration: 0.45, delay: Math.min(i * 0.04, 0.3) }}
    >
      <span className={`ladder__rank ${rank}`}>
        {isRanked && i < 3 ? MEDALS[i] : isRanked ? i + 1 : '–'}
      </span>
      <PlayerCard
        className="ladder__player"
        name={s.name}
        label={displayName(profiles, s.name)}
        avatarUrl={profile?.avatar_url}
        rank={playerElo?.rank}
        title={profile?.title ?? `niv. ${s.level.lv} · ${s.level.name}`}
        streak={profile?.current_streak ?? 0}
        size={40}
        to={`/joueur/${encodeURIComponent(s.name)}`}
      />
      {/* Winrate en jauge (Epic 2.2) — vert > 50 %, rouge en dessous. */}
      <span className="ladder__stat ladder__stat--bar">
        <span className="winrate-bar" title={`${wins} victoires / ${games} parties`}>
          <span
            className="winrate-bar__fill"
            style={{
              width: `${Math.round(winRate * 100)}%`,
              background: winRate >= 0.5 ? '#4CAF50' : '#F44336',
            }}
          />
        </span>
        <em>{Math.round(winRate * 100)}% · {wins} V</em>
      </span>
      <span className="ladder__stat ladder__stat--rate">
        {isRanked ? (
          <>
            <b style={{ color: 'var(--win)' }}>{playerElo ? playerElo.elo : '—'}</b>
            <em>{playerElo ? playerElo.rank : 'elo'}</em>
          </>
        ) : (
          <>
            <b>{games}</b><em>{games === 1 ? 'partie' : 'parties'}</em>
          </>
        )}
      </span>
      <span className="ladder__stat ladder__stat--hide">
        <b>{games}</b><em>{games === 1 ? 'partie' : 'parties'}</em>
      </span>
    </motion.li>
  );
}
