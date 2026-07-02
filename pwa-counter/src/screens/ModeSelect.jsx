import { useLocation, useNavigate } from 'react-router-dom';
import './PlayHome.css';

const MULTIPLAYER_MODES = [
  { id: 'shanghai', label: 'Shanghai', desc: 'Classique · Bull · Random · Crazy' },
  { id: 'cricket', label: 'Cricket', desc: '15-20 + bull' },
  { id: 'superCricket', label: 'Super Cricket', desc: 'Cricket étendu' },
  { id: 'fiftyOne', label: '51', desc: 'Exactement 51' },
];

const SOLO_MODES = [
  { id: 'bob27', label: "Bob's 27", desc: 'Doubles 1 → 20' },
  { id: 'roundTheClock', label: 'Round the Clock', desc: '1 → 20 + bull' },
];

const CATEGORY_TITLE = {
  ranked: 'Partie classée',
  casual: 'Partie amicale',
  solo: 'Entraînement solo',
};

export default function ModeSelect() {
  const { state } = useLocation();
  const navigate = useNavigate();
  const category = state?.category ?? 'ranked';
  const isSolo = category === 'solo';
  const isCasual = category === 'casual' || isSolo; // solo games are always casual too
  const modes = isSolo ? SOLO_MODES : MULTIPLAYER_MODES;

  return (
    <div className="play-home">
      <button className="play-home__back" onClick={() => navigate('/')}>
        ← Retour
      </button>
      <h1 className="play-home__title play-home__title--sm">{CATEGORY_TITLE[category] || CATEGORY_TITLE.ranked}</h1>
      <div className="play-home__modes">
        {modes.map(m => (
          <button
            key={m.id}
            className="play-home__mode"
            onClick={() => navigate('/setup', { state: { mode: m.id, isCasual } })}
          >
            <span className="play-home__mode-label">{m.label}</span>
            <span className="play-home__mode-desc">{m.desc}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
