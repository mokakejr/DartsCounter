import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import './PlayHome.css';

const MODES = [
  { id: 'shanghai', label: 'Shanghai', desc: '7 rounds · cible 1 → 7' },
  { id: 'cricket', label: 'Cricket', desc: '15-20 + bull' },
  { id: 'superCricket', label: 'Super Cricket', desc: 'Cricket étendu' },
  { id: 'fiftyOne', label: '51', desc: 'Exactement 51' },
];

const WH_KEY = 'dartsWebhookUrl';

export default function PlayHome() {
  const navigate = useNavigate();
  const [showWh, setShowWh] = useState(() => !localStorage.getItem(WH_KEY));
  const [whInput, setWhInput] = useState('');

  function saveWebhook() {
    localStorage.setItem(WH_KEY, whInput);
    setShowWh(false);
  }

  return (
    <div className="play-home">
      <button className="play-home__back" onClick={() => navigate('/')}>← Accueil</button>
      <h1 className="play-home__title">JOUER</h1>
      {showWh && (
        <div className="play-home__wh-banner">
          <p className="eyebrow">Webhook Google Chat</p>
          <p className="play-home__wh-desc">Enregistre l'URL pour recevoir les résultats de parties.</p>
          <div className="play-home__wh-row">
            <input
              type="url"
              className="play-home__wh-input"
              placeholder="https://chat.googleapis.com/v1/spaces/…"
              value={whInput}
              onChange={e => setWhInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && whInput.startsWith('https://') && saveWebhook()}
            />
            <button
              className="play-home__wh-save"
              disabled={!whInput.startsWith('https://')}
              onClick={saveWebhook}
            >
              Enregistrer
            </button>
          </div>
          <button className="play-home__wh-skip" onClick={() => setShowWh(false)}>
            Ignorer
          </button>
        </div>
      )}
      <div className="play-home__modes">
        {MODES.map(m => (
          <button
            key={m.id}
            className={`play-home__mode${m.disabled ? ' play-home__mode--disabled' : ''}`}
            disabled={m.disabled}
            onClick={() => navigate('/play/setup', { state: { mode: m.id } })}
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
