import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ACHIEVEMENTS } from '../lib/stats.js';
import { buildTrophies } from '../lib/trophies.js';
import { useCountUp } from '../lib/useCountUp.js';
import Reveal from '../components/Reveal.jsx';
import TrophyModal from '../components/TrophyModal.jsx';
import './TrophiesPage.css';

const CATS = [
  ['wins', 'Victoires & séries'],
  ['loss', 'Défaites'],
  ['modes', 'Modes de jeu'],
  ['perf', 'Performance'],
  ['volume', 'Assiduité'],
  ['special', 'Jours spéciaux'],
  ['xp', 'Niveaux & XP'],
];

const FILTERS = [
  ['all', 'Tous'],
  ['unlocked', 'Débloqués'],
  ['locked', 'Verrouillés'],
];

export default function TrophiesPage({ stats }) {
  const [selected, setSelected] = useState(null);
  const [filter, setFilter] = useState('all');

  const trophies = useMemo(() => buildTrophies(stats), [stats]);
  const unlocked = trophies.filter(t => t.unlocked).length;
  const count = useCountUp(unlocked);

  const visible = t =>
    filter === 'all' || (filter === 'unlocked' ? t.unlocked : !t.unlocked);

  return (
    <div className="tpage shell">
      <Link to="/" className="back">← La Ligue</Link>
      <h1 className="display tpage__title">Trophées</h1>
      <p className="tpage__sub">
        <b>{count}</b> / {ACHIEVEMENTS.length} débloqués
      </p>

      <div className="tpage__filters">
        {FILTERS.map(([key, label]) => (
          <button
            key={key}
            className={`chip ${filter === key ? 'chip--on' : ''}`}
            onClick={() => setFilter(key)}
          >
            {label}
          </button>
        ))}
      </div>

      {CATS.map(([key, label]) => {
        const list = trophies.filter(t => t.cat === key && visible(t));
        if (list.length === 0) return null;
        const got = trophies.filter(t => t.cat === key && t.unlocked).length;
        const total = trophies.filter(t => t.cat === key).length;
        return (
          <section key={key} className="tcat">
            <h2 className="tcat__title eyebrow">
              {label} <span className="tcat__count">{got}/{total}</span>
            </h2>
            <div className="tpage__grid">
              {list.map((a, i) => (
                <Reveal
                  as="button"
                  key={a.id}
                  delay={Math.min(i * 0.03, 0.25)}
                  className={`tcard ${a.unlocked ? '' : 'tcard--locked'}`}
                  onClick={() => setSelected(a)}
                  style={a.rarity ? { '--rar': a.rarity.color } : undefined}
                >
                  <span className="tcard__ico">{a.ico}</span>
                  <span className="tcard__body">
                    <span className="tcard__name">{a.name}</span>
                    <span className="tcard__desc">{a.desc}</span>
                    {!a.unlocked && a.progress && (
                      <span className="tcard__prog">
                        <span className="tcard__prog-track">
                          <span style={{ width: `${Math.round((a.progress[0] / a.progress[1]) * 100)}%` }} />
                        </span>
                        <span className="tcard__prog-num">{a.progress[0]}/{a.progress[1]}</span>
                      </span>
                    )}
                  </span>
                  {a.unlocked && a.rarity && (
                    <span className="tcard__rar" style={{ color: a.rarity.color }}>●</span>
                  )}
                </Reveal>
              ))}
            </div>
          </section>
        );
      })}

      <TrophyModal trophy={selected} onClose={() => setSelected(null)} />
    </div>
  );
}
