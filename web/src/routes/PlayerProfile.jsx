import { useMemo, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ALL_MODES } from '../lib/stats.js';
import { MODE_LABEL, fmtDuration } from '../lib/data.js';
import { rivalries } from '../lib/derive.js';
import { buildTrophies } from '../lib/trophies.js';
import TrophyModal from '../components/TrophyModal.jsx';
import './PlayerProfile.css';

export default function PlayerProfile({ games, stats }) {
  const { name } = useParams();
  const s = stats[name];
  const [selectedTrophy, setSelectedTrophy] = useState(null);

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

  const tiles = [
    { k: 'Victoires', v: s.wins },
    { k: s.games === 1 ? 'Partie' : 'Parties', v: s.games },
    { k: 'Winrate', v: `${winrate}%`, accent: 'var(--win)' },
    { k: 'Meilleure série', v: s.maxStreak },
    { k: 'Temps de jeu', v: fmtDuration(s.totalDuration) },
    { k: 'Mode favori', v: MODE_LABEL[s.favoriteMode] || '—' },
  ];

  return (
    <div className="profile shell">
      <Link to="/" className="back">← La Ligue</Link>

      <header className="profile__head">
        <span className="profile__avatar">{name.charAt(0)}</span>
        <div>
          <h1 className="display profile__name">{name}</h1>
          <p className="profile__lv">Niveau {s.level.lv} · {s.level.name}</p>
          {isGoat && <span className="profile__goat">🐐 GOAT du groupe</span>}
        </div>
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
                <span>{other}</span>
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
            {recent.map((g, i) => (
              <li key={g.id || i}>
                <span className={g.winner === name ? 'won' : 'lost'}>
                  {g.winner === name ? 'Victoire' : 'Défaite'}
                </span>
                <span className="profile__gmode">{MODE_LABEL[g.mode]}</span>
                <span className="profile__gmeta">{fmtDuration(g.duration)}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <TrophyModal trophy={selectedTrophy} onClose={() => setSelectedTrophy(null)} />
    </div>
  );
}
