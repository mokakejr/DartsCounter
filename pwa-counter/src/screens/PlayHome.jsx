import { useNavigate } from 'react-router-dom';
import './PlayHome.css';

const MODES = [
  { id: 'shanghai', label: 'Shanghai', desc: '7 rounds · cible 1 → 7' },
  { id: 'cricket', label: 'Cricket', desc: '15-20 + bull' },
  { id: 'superCricket', label: 'Super Cricket', desc: 'Cricket étendu' },
  { id: 'fiftyOne', label: '51', desc: 'Exactement 51' },
];

export default function PlayHome() {
  const navigate = useNavigate();

  return (
    <div className="play-home">
      <h1 className="play-home__title">JOUER</h1>
      <div className="play-home__modes">
        {MODES.map(m => (
          <button
            key={m.id}
            className={`play-home__mode${m.disabled ? ' play-home__mode--disabled' : ''}`}
            disabled={m.disabled}
            onClick={() => navigate('/setup', { state: { mode: m.id } })}
          >
            <span className="play-home__mode-label">{m.label}</span>
            <span className="play-home__mode-desc">{m.desc}</span>
            {m.disabled && <span className="play-home__mode-soon">bientôt</span>}
          </button>
        ))}
      </div>
    </div>
  );
}
