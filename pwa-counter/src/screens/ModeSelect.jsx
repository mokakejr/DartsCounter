import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { apiGet } from '../api/client.js';
import './PlayHome.css';

// Cartes visuelles (Epic 5.1): icône + gradient par mode, tags statiques
// (🧠) et dynamiques (🔥 Tendance / ⏱️ Rapide, dérivés de /stats/modes-meta).
const MULTIPLAYER_MODES = [
  { id: 'shanghai', label: 'Shanghai', desc: 'Classique · Bull · Random · Crazy', icon: '🎯', grad: 'red', family: 'Shanghai' },
  { id: 'cricket', label: 'Cricket', desc: '15-20 + bull', icon: '⚔️', grad: 'green', family: 'Cricket', tags: ['🧠 Stratégique'] },
  { id: 'superCricket', label: 'Super Cricket', desc: 'Cricket étendu', icon: '🗡️', grad: 'purple', family: 'SuperCricket', tags: ['🧠 Stratégique'] },
  { id: 'fiftyOne', label: '51', desc: 'Exactement 51', icon: '5️⃣', grad: 'blue', family: 'FiftyOne' },
];

const SOLO_MODES = [
  { id: 'bob27', label: "Bob's 27", desc: 'Doubles 1 → 20', icon: '🎪', grad: 'orange' },
  { id: 'roundTheClock', label: 'Round the Clock', desc: '1 → 20 + bull', icon: '🕐', grad: 'blue' },
];

// Party modes that are always casual — never shown under "Classé".
const CASUAL_ONLY_MODES = [
  { id: 'killer', label: 'Killer', desc: 'Élimination · numéros aléatoires', icon: '💀', grad: 'red' },
  { id: 'halveIt', label: 'Halve It', desc: '0 point = total divisé par 2', icon: '✂️', grad: 'orange' },
];

const CATEGORY_TITLE = {
  ranked: 'Partie classée',
  casual: 'Partie amicale',
  solo: 'Entraînement solo',
};

const FAST_GAME_SECONDS = 600;

function dynamicTags(meta, family) {
  if (!meta || !family) return [];
  const row = meta.find(m => m.mode === family);
  if (!row) return [];
  const tags = [];
  const hottest = meta.reduce((a, b) => (b.games_30d > (a?.games_30d ?? 0) ? b : a), null);
  if (hottest && hottest.games_30d > 0 && hottest.mode === family) tags.push('🔥 Tendance');
  if (row.avg_duration && row.avg_duration < FAST_GAME_SECONDS) tags.push('⏱️ Rapide');
  return tags;
}

export default function ModeSelect() {
  const { state } = useLocation();
  const navigate = useNavigate();
  const [meta, setMeta] = useState(null);
  useEffect(() => {
    apiGet('/stats/modes-meta').then(setMeta).catch(() => {});
  }, []);
  const category = state?.category ?? 'ranked';
  const isSolo = category === 'solo';
  const isCasual = category === 'casual' || isSolo; // solo games are always casual too
  const modes = isSolo
    ? SOLO_MODES
    : category === 'casual'
      ? [...MULTIPLAYER_MODES, ...CASUAL_ONLY_MODES]
      : MULTIPLAYER_MODES;

  return (
    <div className="play-home">
      <button className="play-home__back" onClick={() => navigate('/')}>
        ← Retour
      </button>
      <h1 className="play-home__title play-home__title--sm">{CATEGORY_TITLE[category] || CATEGORY_TITLE.ranked}</h1>
      <div className="play-home__modes play-home__modes--grid">
        {modes.map(m => {
          const tags = [...(m.tags ?? []), ...dynamicTags(meta, m.family)];
          return (
            <button
              key={m.id}
              className={`play-home__mode play-home__mode--card play-home__mode--${m.grad}`}
              onClick={() => navigate('/setup', { state: { mode: m.id, isCasual } })}
            >
              <span className="play-home__mode-icon">{m.icon}</span>
              <span className="play-home__mode-label">{m.label}</span>
              <span className="play-home__mode-desc">{m.desc}</span>
              {tags.length > 0 && (
                <span className="play-home__mode-tags">
                  {tags.map(t => <em key={t}>{t}</em>)}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
