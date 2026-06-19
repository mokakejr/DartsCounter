import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import './PlaySetup.css';

const STORAGE_KEY = 'dartsKnownPlayers';

function loadKnown() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); }
  catch { return []; }
}

function saveKnown(names) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(names));
}

const MODE_ROUTE = {
  shanghai: '/play/shanghai',
  cricket: '/play/cricket',
  superCricket: '/play/super-cricket',
  fiftyOne: '/play/51',
};

const MODE_LABEL = {
  shanghai: 'Shanghai',
  cricket: 'Cricket',
  superCricket: 'Super Cricket',
  fiftyOne: '51',
};

export default function PlaySetup() {
  const navigate = useNavigate();
  const { state } = useLocation();
  const mode = state?.mode ?? 'shanghai';

  const [known, setKnown] = useState(loadKnown);
  const [selected, setSelected] = useState([]);
  const [input, setInput] = useState('');

  function toggle(name) {
    setSelected(prev =>
      prev.includes(name) ? prev.filter(n => n !== name) : [...prev, name]
    );
  }

  function addNew() {
    const name = input.trim();
    if (!name) return;
    if (!known.includes(name)) {
      const updated = [...known, name];
      setKnown(updated);
      saveKnown(updated);
    }
    if (!selected.includes(name)) {
      setSelected(prev => [...prev, name]);
    }
    setInput('');
  }

  function start() {
    navigate(MODE_ROUTE[mode] ?? '/play/shanghai', { state: { players: selected } });
  }

  return (
    <div className="play-setup">
      <button className="play-setup__back" onClick={() => navigate('/play')}>
        ← {MODE_LABEL[mode]}
      </button>

      <h2 className="play-setup__title">Qui joue ?</h2>

      {known.length > 0 && (
        <div className="play-setup__chips">
          {known.map(name => (
            <button
              key={name}
              className={`play-setup__chip${selected.includes(name) ? ' play-setup__chip--on' : ''}`}
              onClick={() => toggle(name)}
            >
              {selected.includes(name) && <span className="play-setup__check">✓</span>}
              {name}
            </button>
          ))}
        </div>
      )}

      <div className="play-setup__add">
        <input
          className="play-setup__input"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && addNew()}
          placeholder="Nouveau joueur…"
          maxLength={20}
        />
        <button className="play-setup__add-btn" onClick={addNew} disabled={!input.trim()}>
          +
        </button>
      </div>

      {selected.length > 0 && (
        <div className="play-setup__order">
          <p className="play-setup__order-label">Ordre de jeu</p>
          <div className="play-setup__order-list">
            {selected.map((name, i) => (
              <div key={name} className="play-setup__order-item">
                <span className="play-setup__order-num">{i + 1}</span>
                <span className="play-setup__order-name">{name}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <button
        className="play-setup__start"
        disabled={selected.length < 2}
        onClick={start}
      >
        JOUER →
      </button>
    </div>
  );
}
