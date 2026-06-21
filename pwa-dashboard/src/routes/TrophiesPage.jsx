import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ACHIEVEMENTS } from '../lib/stats.js';
import { buildTrophies } from '../lib/trophies.js';
import { useCountUp } from '../lib/useCountUp.js';
import TrophyCard from '../components/TrophyCard.jsx';
import TrophyModal from '../components/TrophyModal.jsx';
import './TrophiesPage.css';

const CATS = [
  ['wins',    'Victoires & séries'],
  ['loss',    'Défaites'],
  ['modes',   'Modes de jeu'],
  ['perf',    'Performance'],
  ['volume',  'Assiduité'],
  ['special', 'Jours spéciaux'],
  ['xp',      'Niveaux & XP'],
];

const FILTERS = [
  ['all',      'Tous'],
  ['unlocked', 'Débloqués'],
  ['locked',   'Verrouillés'],
];

export default function TrophiesPage({ stats }) {
  const [selected, setSelected] = useState(null);
  const [filter, setFilter]     = useState('all');

  const [searchParams] = useSearchParams();

  const trophies   = useMemo(() => buildTrophies(stats), [stats]);
  const unlocked   = trophies.filter(t => t.unlocked).length;

  // Deep-link depuis les annonces webhook : /#/trophees?t=<id> ouvre la modale.
  useEffect(() => {
    const id = searchParams.get('t');
    if (!id) return;
    const t = trophies.find(x => x.id === id);
    if (t) setSelected(t);
  }, [searchParams, trophies]);
  const count      = useCountUp(unlocked);
  const legendaries = useMemo(() => trophies.filter(t => t.rarity?.key === 'legendary'), [trophies]);

  const visible = t =>
    filter === 'all' || (filter === 'unlocked' ? t.unlocked : !t.unlocked);

  return (
    <div className="tpage shell">
      <Link to="/" className="back">← La Ligue</Link>
      <h1 className="display tpage__title">Trophées</h1>
      <p className="tpage__sub">
        <b>{count}</b> / {ACHIEVEMENTS.length} débloqués
      </p>

      {/* Legendary showcase */}
      {legendaries.length > 0 && (
        <section className="tshowcase">
          <h2 className="eyebrow tshowcase__head">
            ⚡ Légendaires
            <span className="tcat__count">
              {legendaries.filter(t => t.unlocked).length}/{legendaries.length}
            </span>
          </h2>
          <div className="tshowcase__grid">
            {legendaries.map((a, i) => (
              <TrophyCard
                key={a.id}
                trophy={a}
                delay={i * 0.06}
                onClick={() => setSelected(a)}
                showcase
              />
            ))}
          </div>
        </section>
      )}

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
        const list  = trophies.filter(t => t.cat === key && visible(t));
        if (!list.length) return null;
        const got   = trophies.filter(t => t.cat === key && t.unlocked).length;
        const total = trophies.filter(t => t.cat === key).length;
        return (
          <section key={key} className="tcat">
            <h2 className="tcat__title eyebrow">
              {label} <span className="tcat__count">{got}/{total}</span>
            </h2>
            <div className="tpage__grid">
              {list.map((a, i) => (
                <TrophyCard
                  key={a.id}
                  trophy={a}
                  delay={Math.min(i * 0.03, 0.25)}
                  onClick={() => setSelected(a)}
                />
              ))}
            </div>
          </section>
        );
      })}

      <TrophyModal trophy={selected} onClose={() => setSelected(null)} />
    </div>
  );
}
