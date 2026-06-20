import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { loadGames } from '../../lib/data.js';
import './PlaySetup.css';

const STORAGE_KEY = 'dartsKnownPlayers';

function loadKnown() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); }
  catch { return []; }
}

function saveKnown(names) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(names));
}

function norm(s) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

function mergeWithGames(stored, fromGames) {
  const all = new Set([...stored, ...fromGames]);
  return [...all].sort((a, b) => a.localeCompare(b, 'fr'));
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
  const [search, setSearch] = useState('');

  // Enrich known players from games.json on mount
  useEffect(() => {
    loadGames().then(games => {
      const fromGames = [...new Set(games.flatMap(g => g.players ?? []))];
      setKnown(prev => {
        const merged = mergeWithGames(prev, fromGames);
        saveKnown(merged);
        return merged;
      });
    });
  }, []);

  const q = search.trim();
  const filtered = q ? known.filter(n => norm(n).includes(norm(q))) : known;
  const exactMatch = known.some(n => norm(n) === norm(q));
  const canAdd = q.length > 0 && q.length <= 20 && !exactMatch;

  function toggle(name) {
    setSelected(prev =>
      prev.includes(name) ? prev.filter(n => n !== name) : [...prev, name]
    );
    setSearch('');
  }

  function addNew() {
    if (!canAdd) return;
    const updated = mergeWithGames(known, [q]);
    setKnown(updated);
    saveKnown(updated);
    setSelected(prev => prev.includes(q) ? prev : [...prev, q]);
    setSearch('');
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

      {/* Search / add input */}
      <div className="play-setup__search-row">
        <input
          className="play-setup__input"
          value={search}
          onChange={e => setSearch(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && addNew()}
          placeholder="Rechercher ou ajouter…"
          maxLength={20}
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
        />
        {canAdd && (
          <button className="play-setup__add-btn" onClick={addNew}>+</button>
        )}
      </div>

      {/* Player chips — only shown when user is typing (fix: don't reveal all known players by default) */}
      {q && filtered.length > 0 && (
        <div className="play-setup__chips">
          {filtered.map(name => (
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

      {q && !exactMatch && filtered.length === 0 && (
        <p className="play-setup__no-results">
          Appuie sur + pour ajouter <strong>{q}</strong>
        </p>
      )}

      {/* Play order */}
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
