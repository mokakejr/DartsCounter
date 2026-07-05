import { Suspense, useEffect, useMemo, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import { ALL_MODES } from '../lib/stats.js';
import { MODE_LABEL, fmtDuration } from '../lib/data.js';
import { rivalries, bestBob27Result, bestRoundTheClockTime } from '../lib/derive.js';
import { buildTrophies } from '../lib/trophies.js';
import { displayName } from '../lib/profiles.js';
import { fetchPlayerRatings, fetchPlayerEloHistory, fetchPlayerEloExtremes } from '../api/players.js';
import { SERIES, GRID, TICK, ChartTooltip } from '../components/ChartTheme.jsx';
import TrophyModal from '../components/TrophyModal.jsx';
import Dart from '../components/Dart.jsx';
import RankBadge from '../components/RankBadge.jsx';
import VersusBlock from '../components/VersusBlock.jsx';
import './PlayerProfile.css';

function fmtDate(d) {
  return new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
}

// win/loss/draw — a tie has no `winner` at all (Shanghai allows it), and
// is its own outcome, not just "not a win".
function outcome(game, name) {
  if (!game.winner) return 'draw';
  return game.winner === name ? 'win' : 'loss';
}

export default function PlayerProfile({ games, stats, profiles = {} }) {
  const { name } = useParams();
  const s = stats[name];
  const profile = profiles[name];
  const [selectedTrophy, setSelectedTrophy] = useState(null);
  const [ratings, setRatings] = useState([]);
  const [eloHistory, setEloHistory] = useState([]);
  const [eloExtremes, setEloExtremes] = useState(null);

  useEffect(() => {
    fetchPlayerRatings(name).then(setRatings).catch(() => setRatings([]));
    fetchPlayerEloHistory(name, 'global').then(setEloHistory).catch(() => setEloHistory([]));
    fetchPlayerEloExtremes(name, 'global').then(setEloExtremes).catch(() => setEloExtremes(null));
  }, [name]);

  // eloHistory comes back newest-first; the chart reads left-to-right.
  const eloChartData = useMemo(
    () => [...eloHistory].reverse().map((h, i) => ({ i: i + 1, elo: h.elo_after, date: h.game_date })),
    [eloHistory]
  );

  const earned = useMemo(() => {
    if (!s) return [];
    return buildTrophies(stats, name).filter(t => t.unlocked);
  }, [stats, name, s]);

  const recent = useMemo(
    () =>
      [...games]
        .filter(g => (g.players || []).includes(name))
        .sort((a, b) => new Date(b.date) - new Date(a.date))
        .slice(0, 8),
    [games, name]
  );

  // Oldest → newest, left to right, ending on the most recent game — the
  // usual "recent form" reading order.
  const form = useMemo(() => [...recent].reverse(), [recent]);

  const h2h = useMemo(
    () => rivalries(games, 99).filter(r => r.a === name || r.b === name).slice(0, 5),
    [games, name]
  );

  if (!s) {
    return (
      <div className="profile shell">
        <Link to="/" className="back">← Retour</Link>
        <p className="profile__missing">Joueur introuvable.</p>
      </div>
    );
  }

  const maxWins = Math.max(...Object.values(stats).map(p => p.wins));
  const isGoat  = s.wins === maxWins && maxWins > 0;
  const winrate = s.games ? Math.round((s.wins / s.games) * 100) : 0;
  const maxModeWins = Math.max(1, ...ALL_MODES.map(m => s.modeWins[m] || 0));

  const avgDuration = s.games ? s.totalDuration / s.games : 0;

  const tiles = [
    { k: 'Victoires', v: s.wins },
    { k: s.games === 1 ? 'Partie' : 'Parties', v: s.games },
    { k: 'Winrate', v: `${winrate}%`, accent: 'var(--win)' },
    { k: 'Victoires d’affilée', v: s.maxStreak },
    { k: 'Temps de jeu', v: fmtDuration(s.totalDuration) },
    { k: 'Durée moy.', v: fmtDuration(avgDuration) },
    { k: 'Mode favori', v: MODE_LABEL[s.favoriteMode] || '—' },
  ];

  // Solo/training modes — best-ever result, only shown once the player has
  // actually attempted that mode.
  const bob27 = bestBob27Result(games, name);
  if (bob27) {
    tiles.push(
      bob27.type === 'score'
        ? { k: "Meilleur score Bob's 27", v: bob27.value, accent: 'var(--win)' }
        : { k: "Meilleur round Bob's 27", v: `Round ${bob27.value}` }
    );
  }
  const rtcBest = bestRoundTheClockTime(games, name);
  if (rtcBest != null) {
    tiles.push({ k: 'Meilleur temps Round the Clock', v: fmtDuration(rtcBest), accent: 'var(--win)' });
  }

  const accentStyle = profile?.accent_color ? { '--player-accent': profile.accent_color } : undefined;
  const globalRating = ratings.find(r => r.scope === 'global');
  const modeRatings = ratings.filter(r => r.scope !== 'global');

  return (
    <div className="profile shell" style={accentStyle}>
      <VersusBlock name={name} stats={stats} profiles={profiles} />
      <Link to="/" className="back">← La Ligue</Link>

      <header className="profile__head">
        <span
          className="profile__avatar"
          style={profile?.avatar_url ? { backgroundImage: `url(${profile.avatar_url})`, backgroundSize: 'cover' } : undefined}
        >
          {!profile?.avatar_url && name.charAt(0)}
        </span>
        <div>
          <h1 className="display profile__name">{profile?.display_name || name}</h1>
          <p className="profile__lv">Niveau {s.level.lv} · {s.level.name}</p>
          {isGoat && <span className="profile__goat">🐐 GOAT du groupe</span>}
          {globalRating && (
            <div className="profile__rankhero">
              <RankBadge rank={globalRating.rank} elo={globalRating.rating} size="lg" />
              <Link to="/rangs" className="profile__rankinfo">Comment ça marche ?</Link>
            </div>
          )}
          {form.length > 0 && (
            <div className="formstrip" title="Forme récente">
              {form.map((g, i) => {
                const o = outcome(g, name);
                return (
                  <span key={g.id || i} className={`formdot formdot--${o}`}>
                    {o === 'win' ? '✓' : o === 'loss' ? '✕' : '–'}
                  </span>
                );
              })}
            </div>
          )}
        </div>

        {profile?.flight_image_url && (
          <div className="profile__dart" title="Dart personnalisé">
            <Suspense fallback={null}>
              <Dart
                accentColor={profile.accent_color}
                flightImageUrl={profile.flight_image_url}
                flightCropA={profile.flight_crop_a}
                flightCropB={profile.flight_crop_b}
                flightMode={profile.flight_mode}
              />
            </Suspense>
          </div>
        )}
      </header>

      <div className="xpbar">
        <div className="xpbar__track"><span style={{ width: `${s.level.pct}%` }} /></div>
        <div className="xpbar__meta">
          <span>{s.xp} XP</span>
          {!s.level.isMax && <span>{s.level.nextXP} XP → niv. {s.level.lv + 1}</span>}
          {s.level.isMax && <span>Niveau max atteint 🍾</span>}
        </div>
      </div>

      <div className="tiles">
        {tiles.map(t => (
          <div key={t.k} className="tile">
            <span className="tile__v" style={t.accent ? { color: t.accent } : undefined}>{t.v}</span>
            <span className="tile__k">{t.k}</span>
          </div>
        ))}
      </div>

      {modeRatings.length > 0 && (
        <div className="rankrow">
          {modeRatings.map(r => (
            <RankBadge key={r.scope} label={MODE_LABEL[r.scope] || r.scope} rank={r.rank} elo={r.rating} size="sm" />
          ))}
        </div>
      )}

      <div className="profile__cols">
        <section>
          <h2 className="profile__h2 eyebrow">Par mode</h2>
          <div className="modebars">
            {ALL_MODES.map(m => {
              const w = s.modeWins[m] || 0;
              const g = s.modeGames[m] || 0;
              return (
                <div key={m} className="modebar">
                  <span className="modebar__label">{MODE_LABEL[m]}</span>
                  <div className="modebar__track">
                    <span style={{ width: `${(w / maxModeWins) * 100}%` }} />
                  </div>
                  <span className="modebar__val">{w}<em>/{g}</em></span>
                </div>
              );
            })}
          </div>

          <h2 className="profile__h2 eyebrow">Rivalités</h2>
          {h2h.map(r => {
            const me    = r.a === name ? r.aWins : r.bWins;
            const opp   = r.a === name ? r.bWins : r.aWins;
            const other = r.a === name ? r.b : r.a;
            return (
              <div key={other} className="h2h">
                <span>{displayName(profiles, other)}</span>
                <span className="h2h__score">
                  <b style={{ color: me >= opp ? 'var(--win)' : 'var(--text)' }}>{me}</b>–{opp}
                </span>
              </div>
            );
          })}
          {h2h.length === 0 && <p className="profile__muted">Pas encore de rivalité.</p>}
        </section>

        <section>
          <h2 className="profile__h2 eyebrow">Trophées · {earned.length}</h2>
          <div className="profile__trophies">
            {earned.map(t => (
              <button
                key={t.id}
                className="ptrophy"
                title={`${t.name} — ${t.desc}`}
                onClick={() => setSelectedTrophy(t)}
              >
                {t.ico}
              </button>
            ))}
          </div>

          <h2 className="profile__h2 eyebrow">Dernières parties</h2>
          <ul className="profile__games">
            {recent.map((g, i) => {
              const o = outcome(g, name);
              return (
              <li key={g.id || i}>
                <span className={o === 'win' ? 'won' : o === 'loss' ? 'lost' : 'drawn'}>
                  {o === 'win' ? 'Victoire' : o === 'loss' ? 'Défaite' : 'Égalité'}
                </span>
                <span className="profile__gmode">{MODE_LABEL[g.mode]}</span>
                <span className="profile__gmeta">{fmtDuration(g.duration)}</span>
              </li>
              );
            })}
          </ul>

          <h2 className="profile__h2 eyebrow">Évolution Elo</h2>
          {eloChartData.length > 0 ? (
            <div className="card">
              <div className="card__chart">
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={eloChartData} margin={{ top: 8, right: 12, bottom: 0, left: -18 }}>
                    <CartesianGrid stroke={GRID} vertical={false} />
                    <XAxis dataKey="i" stroke={TICK} tick={{ fontSize: 11 }} tickLine={false} />
                    <YAxis stroke={TICK} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} domain={['auto', 'auto']} />
                    <Tooltip content={<ChartTooltip suffix="Partie" />} />
                    <Line
                      type="monotone"
                      dataKey="elo"
                      name="Elo"
                      stroke={SERIES[0]}
                      strokeWidth={2}
                      dot={false}
                      isAnimationActive
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          ) : (
            <p className="profile__muted">Pas encore d'historique.</p>
          )}

          {eloExtremes && (eloExtremes.best_elo != null) && (
            <div className="tiles tiles--elo">
              <div className="tile">
                <span className="tile__v" style={{ color: 'var(--win)' }}>{eloExtremes.best_elo}</span>
                <span className="tile__k">Meilleur Elo</span>
                <span className="tile__sub">{fmtDate(eloExtremes.best_elo_date)}</span>
              </div>
              <div className="tile">
                <span className="tile__v">{eloExtremes.worst_elo}</span>
                <span className="tile__k">Pire Elo</span>
                <span className="tile__sub">{fmtDate(eloExtremes.worst_elo_date)}</span>
              </div>
              <div className="tile">
                <span className="tile__v" style={{ color: 'var(--win)' }}>
                  #{eloExtremes.best_rank}<em className="tile__of">/{eloExtremes.best_rank_total_players}</em>
                </span>
                <span className="tile__k">Meilleur classement</span>
                <span className="tile__sub">{fmtDate(eloExtremes.best_rank_date)}</span>
              </div>
              <div className="tile">
                <span className="tile__v">
                  #{eloExtremes.worst_rank}<em className="tile__of">/{eloExtremes.worst_rank_total_players}</em>
                </span>
                <span className="tile__k">Pire classement</span>
                <span className="tile__sub">{fmtDate(eloExtremes.worst_rank_date)}</span>
              </div>
            </div>
          )}
        </section>
      </div>

      <TrophyModal trophy={selectedTrophy} onClose={() => setSelectedTrophy(null)} profiles={profiles} />
    </div>
  );
}
