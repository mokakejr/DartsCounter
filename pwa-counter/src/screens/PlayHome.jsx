import { useNavigate } from 'react-router-dom';
import { lastGame, replayTarget } from '../replay.js';
import './PlayHome.css';

const DASHBOARD_URL = import.meta.env.VITE_DASHBOARD_URL || 'http://localhost:5174';

// The 3 top-level entry points — each routes to /modes with a category that
// filters which game modes show up next (see ModeSelect.jsx).
const CATEGORIES = [
  { id: 'ranked', label: 'Classé', desc: 'Compte pour le classement Elo' },
  { id: 'casual', label: 'Amical', desc: 'Partie normale, hors classement' },
  { id: 'solo', label: 'Entraînement solo', desc: "Bob's 27 · Round the Clock" },
];

export default function PlayHome() {
  const navigate = useNavigate();
  // Revanche instantanée (7.4): 1 clic = même mode, mêmes joueurs, direct
  // sur l'écran de score — si une partie a eu lieu dans les dernières 24 h.
  const replay = replayTarget(lastGame());

  return (
    <div className="play-home">
      <h1 className="play-home__title">JOUER</h1>

      {replay && (
        <button
          className="play-home__instant"
          onClick={() => navigate(replay.route, { state: replay.state })}
        >
          <span className="play-home__instant-tag">⚡ REVANCHE</span>
          <span className="play-home__instant-label">
            {replay.label} — {replay.state.players.join(' vs ')}
          </span>
        </button>
      )}

      <div className="play-home__modes">
        {CATEGORIES.map(c => (
          <button
            key={c.id}
            className="play-home__mode"
            onClick={() => navigate('/modes', { state: { category: c.id } })}
          >
            <span className="play-home__mode-label">{c.label}</span>
            <span className="play-home__mode-desc">{c.desc}</span>
          </button>
        ))}
      </div>
      <a className="play-home__dashboard-link" href={DASHBOARD_URL}>
        Voir le tableau de bord →
      </a>
    </div>
  );
}
