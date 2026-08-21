import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { ALL_MODES } from '../lib/stats.js';
import { MODE_LABEL } from '../lib/data.js';
import { displayName } from '../lib/profiles.js';
import PlayerCard from '../components/PlayerCard.jsx';
import { useLeague } from '../lib/useLeague.jsx';
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
  const { activeLeague, leagues } = useLeague();
  const leagueId = activeLeague?.id;
  const [filter, setFilter] = useState('Global');
  // Elo is ranked server-side (it's the whole point of the rating engine) —
  // fetched per filter+league and cached so flipping between tabs doesn't
  // refetch (league in the key: positions are league-relative).
  const [eloByFilter, setEloByFilter] = useState({});
  const [minRankedGames, setMinRankedGames] = useState(DEFAULT_MIN_RANKED_GAMES);
  const cacheKey = `${leagueId ?? 'all'}:${filter}`;

  useEffect(() => {
    fetchEloSettings().then(s => setMinRankedGames(s.min_ranked_games)).catch(() => {});
  }, []);

  useEffect(() => {
    if (eloByFilter[cacheKey]) return;
    fetchLeaderboard(filter === 'Global' ? undefined : filter, leagueId)
      .then(rows => {
        const byName = Object.fromEntries(rows.map(r => [r.name, r]));
        setEloByFilter(prev => ({ ...prev, [cacheKey]: byName }));
      })
      .catch(() => {});
  }, [cacheKey, filter, leagueId, eloByFilter]);

  const elo = eloByFilter[cacheKey] || {};

  const { rankedRows, unrankedRows } = useMemo(() => {
    // Le classement ne liste que des membres de ligue actifs : ceux de la
    // ligue active, ou l'union de mes ligues en « Toutes les ligues » — ce
    // mode veut dire « toutes les miennes », pas « toute la base ». Les
    // adversaires croisés hors ligue comptent dans les stats des membres
    // mais n'ont pas de ligne : à moins de 5 parties ils s'entassaient tous
    // dans « Non classés ». Déconnecté (aucune ligue), rien n'est filtré.
    const memberNames = activeLeague?.players?.length
      ? activeLeague.players
      : leagues.flatMap(l => l.players ?? []);
    const memberSet = memberNames.length ? new Set(memberNames) : null;
    const scoped = memberSet ? ranked.filter(s => memberSet.has(s.name)) : ranked;
    const base = filter === 'Global'
      ? scoped
      : scoped
          .map(s => ({ ...s, _wins: s.modeWins[filter] || 0, _games: s.modeGames[filter] || 0 }))
          .filter(s => s._games > 0);

    const gamesOf = s => (filter === 'Global' ? s.games : s._games);
    const eloOf = s => elo[s.name]?.elo;

    const sorted = [...base].sort((a, b) => {
      const ea = eloOf(a);
      const eb = eloOf(b);
      // L'Elo est l'unique clé de classement compétitif. Les joueurs sans Elo
      // chargé / hors scope passent en dernier ; départage par parties jouées
      // puis nom — jamais par victoires (sinon un Elo égal ou non chargé
      // ferait resurgir l'ordre des victoires du podium).
      if (ea == null && eb == null) return gamesOf(b) - gamesOf(a) || a.name.localeCompare(b.name);
      if (ea == null) return 1;
      if (eb == null) return -1;
      return eb - ea || gamesOf(b) - gamesOf(a) || a.name.localeCompare(b.name);
    });

    return {
      rankedRows: sorted.filter(s => gamesOf(s) >= minRankedGames),
      unrankedRows: sorted
        .filter(s => gamesOf(s) < minRankedGames)
        .sort((a, b) => gamesOf(b) - gamesOf(a)),
    };
  }, [ranked, filter, elo, minRankedGames, activeLeague, leagues]);

  return (
    <section className="standings shell" id="classement">
      <div className="standings__head">
        <h2 className="standings__title">Classement</h2>
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

      {/* Un seul format de ligne, quel que soit l'effectif (F2) : plus de podium
          ni de fosse qui branchaient sur le nombre de joueurs. */}
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
        {isRanked ? i + 1 : '–'}
      </span>
      <PlayerCard
        className="ladder__player"
        name={s.name}
        label={displayName(profiles, s.name)}
        avatarUrl={profile?.avatar_url}
        rank={playerElo?.rank}
        title={profile?.title ?? `niv. ${s.level.lv} · ${s.level.name}`}
        streak={s.curStreak ?? 0}
        size={40}
        to={`/joueur/${encodeURIComponent(s.name)}`}
      />
      {/* Winrate en jauge (Epic 2.2) — vert > 50 %, rouge en dessous. */}
      <span className="ladder__stat ladder__stat--bar">
        <span className="winrate-bar" title={`${wins} victoires / ${games} parties`}>
          <span
            className={`winrate-bar__fill${winRate < 0.5 ? ' winrate-bar__fill--low' : ''}`}
            style={{ width: `${Math.round(winRate * 100)}%` }}
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
    </motion.li>
  );
}


