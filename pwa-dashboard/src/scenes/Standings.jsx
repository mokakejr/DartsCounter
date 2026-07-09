import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { ALL_MODES } from '../lib/stats.js';
import { MODE_LABEL } from '../lib/data.js';
import { displayName } from '../lib/profiles.js';
import PlayerCard from '../components/PlayerCard.jsx';
import { useAuth } from '../lib/useAuth.jsx';
import { useLeague } from '../lib/useLeague.jsx';
import { ping } from '../api/players.js';
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
  const { activeLeague } = useLeague();
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
    const base = filter === 'Global'
      ? ranked
      : ranked
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

      {rankedRows.length >= 3 && (
        <Podium top={rankedRows.slice(0, 3)} profiles={profiles} elo={elo} />
      )}

      {rankedRows.length >= 3 && rankedRows.length > 3 && (
        <div className="pit">
          {rankedRows.slice(3).map((s, i) => {
            const wins = filter === 'Global' ? s.wins : s._wins;
            const games = filter === 'Global' ? s.games : s._games;
            const rate = games ? Math.round((wins / games) * 100) : 0;
            return (
              <PlayerCard
                key={s.name}
                className="pit__card"
                name={s.name}
                label={`#${i + 4} ${displayName(profiles, s.name)}`}
                avatarUrl={profiles[s.name]?.avatar_url}
                rank={elo[s.name]?.rank}
                title={`${elo[s.name] ? `${elo[s.name].elo} elo · ` : ''}${rate}% V`}
                streak={profiles[s.name]?.current_streak ?? 0}
                size={36}
                to={`/joueur/${encodeURIComponent(s.name)}`}
              />
            );
          })}
        </div>
      )}

      <ol className="ladder">
        {rankedRows.length < 3 && rankedRows.map((s, i) => (
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


// Le Podium Dynamique (Epic 10.1): les 3 premiers ne sont plus des lignes.
// Ordre visuel 2-1-3, CTA rouge « Prendre sa place » (notifie via le
// webhook « propose une partie » existant — pas d'infra push).
function Podium({ top, profiles, elo }) {
  const auth = useAuth();
  const [challenged, setChallenged] = useState(null); // name | 'cooldown'

  async function challenge(name) {
    try {
      await ping(auth.token);
      setChallenged(name);
    } catch (err) {
      setChallenged(err.status === 429 ? 'cooldown' : null);
    }
  }

  const order = [top[1], top[0], top[2]].filter(Boolean);
  const placeOf = (s) => top.indexOf(s); // 0 = champion

  return (
    <div className="podium">
      {order.map((s) => {
        const place = placeOf(s);
        const canChallenge = auth.player && auth.player.name !== s.name;
        return (
          <div key={s.name} className={`podium__slot podium__slot--p${place + 1}`}>
            <span className="podium__medal">{['🥇', '🥈', '🥉'][place]}</span>
            <PlayerCard
              className="podium__card"
              name={s.name}
              label={displayName(profiles, s.name)}
              avatarUrl={profiles[s.name]?.avatar_url}
              rank={elo[s.name]?.rank}
              title={profiles[s.name]?.title}
              streak={profiles[s.name]?.current_streak ?? 0}
              size={place === 0 ? 84 : 62}
              to={`/joueur/${encodeURIComponent(s.name)}`}
            />
            <span className="podium__stats">
              {elo[s.name] ? `${elo[s.name].elo} elo` : '—'}
            </span>
            {canChallenge && (
              <button
                className="podium__target"
                disabled={challenged === s.name}
                onClick={() => challenge(s.name)}
              >
                {challenged === s.name
                  ? 'Défi lancé !'
                  : challenged === 'cooldown'
                    ? 'Déjà proposé…'
                    : '🎯 Prendre sa place'}
              </button>
            )}
            <span className={`podium__step podium__step--p${place + 1}`} />
          </div>
        );
      })}
    </div>
  );
}
