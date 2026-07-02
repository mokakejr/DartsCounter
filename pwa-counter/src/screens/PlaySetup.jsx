import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { fetchPlayers } from '../api/players.js';
import { apiGet } from '../api/client.js';
import './PlaySetup.css';

// Two separate caches, so a backend rename can't leave a ghost chip behind:
// - LOCAL_KEY: names typed in via "+" with no matching backend account (e.g.
//   a one-off guest). Never pruned — there's no server signal to know if/when
//   those should disappear.
// - SERVER_KEY: a snapshot of the last successful GET /players. Replaced
//   wholesale on every successful fetch (not merged), so a rename or removal
//   on the backend drops the old name immediately. Still persisted so the
//   list survives an offline reload between visits.
const LOCAL_KEY = 'dartsKnownPlayers';
const SERVER_KEY = 'dartsServerPlayers';

function loadNames(key) {
  try { return JSON.parse(localStorage.getItem(key) || '[]'); }
  catch { return []; }
}

function saveNames(key, names) {
  localStorage.setItem(key, JSON.stringify(names));
}

function norm(s) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

function mergeNames(...lists) {
  const all = new Set(lists.flat());
  return [...all].sort((a, b) => a.localeCompare(b, 'fr'));
}

const MODE_ROUTE = {
  shanghai: '/shanghai',
  cricket: '/cricket',
  superCricket: '/super-cricket',
  fiftyOne: '/51',
  bob27: '/bob27',
  roundTheClock: '/round-the-clock',
};

const MODE_LABEL = {
  shanghai: 'Shanghai',
  cricket: 'Cricket',
  superCricket: 'Super Cricket',
  fiftyOne: '51',
  bob27: "Bob's 27",
  roundTheClock: 'Round the Clock',
};

const CRICKET_FAMILY = new Set(['cricket', 'superCricket']);
// Solo/training modes: 1 player, always casual — no reorder list, no
// casual/competitive toggle (they never touch Elo regardless).
const SOLO_MODES = new Set(['bob27', 'roundTheClock']);

export default function PlaySetup() {
  const navigate = useNavigate();
  const { state } = useLocation();
  const mode = state?.mode ?? 'shanghai';
  const isCricketFamily = CRICKET_FAMILY.has(mode);
  const isSolo = SOLO_MODES.has(mode);
  // Decided upstream on the category screen (ranked/casual/solo) — no
  // toggle here, just carried through to the game screen's postGame() call.
  const isCasual = isSolo ? true : !!state?.isCasual;

  const [localNames, setLocalNames] = useState(() => loadNames(LOCAL_KEY));
  const [serverNames, setServerNames] = useState(() => loadNames(SERVER_KEY));
  const [profiles, setProfiles] = useState({}); // name -> {display_name, avatar_url} — display only, selection stays keyed by canonical name
  const [selected, setSelected] = useState([]);
  const [search, setSearch] = useState('');
  const [variant, setVariant] = useState(state?.variant === 'cutthroat' ? 'cutthroat' : 'normal');
  const [topPlayers, setTopPlayers] = useState([]);

  const known = mergeNames(localNames, serverNames);

  // Enrich known players from the backend on mount (best-effort — offline-safe).
  // The server list is replaced wholesale (not merged) so a rename or
  // deletion on the backend is reflected immediately instead of leaving a
  // stale name cached forever in localStorage.
  useEffect(() => {
    fetchPlayers()
      .then(players => {
        setProfiles(Object.fromEntries(players.map(p => [p.name, p])));
        const names = players.map(p => p.name);
        setServerNames(names);
        saveNames(SERVER_KEY, names);
      })
      .catch(() => {});

    apiGet('/stats/leaderboard')
      .then(stats => {
        const top = [...stats]
          .sort((a, b) => b.games - a.games)
          .slice(0, 4)
          .map(p => p.name);
        setTopPlayers(top);
      })
      .catch(() => {});
  }, []);

  function label(name) {
    return profiles[name]?.display_name || name;
  }

  const q = search.trim();
  const filtered = q ? known.filter(n => norm(n).includes(norm(q))) : [];
  const exactMatch = known.some(n => norm(n) === norm(q));
  const canAdd = q.length > 0 && q.length <= 20 && !exactMatch;

  function toggle(name) {
    setSelected(prev => {
      if (prev.includes(name)) return prev.filter(n => n !== name);
      return isSolo ? [name] : [...prev, name]; // solo modes: picking replaces, not adds
    });
    setSearch('');
  }

  function addNew() {
    if (!canAdd) return;
    const updated = mergeNames(localNames, [q]);
    setLocalNames(updated);
    saveNames(LOCAL_KEY, updated);
    setSelected(prev => (prev.includes(q) ? prev : isSolo ? [q] : [...prev, q]));
    setSearch('');
  }

  function start() {
    navigate(MODE_ROUTE[mode] ?? '/shanghai', {
      state: { players: selected, variant, mode, isCasual },
    });
  }

  return (
    <div className="play-setup">
      <button
        className="play-setup__back"
        onClick={() =>
          navigate('/modes', { state: { category: isSolo ? 'solo' : isCasual ? 'casual' : 'ranked' } })
        }
      >
        ← {MODE_LABEL[mode]}
      </button>

      <h2 className="play-setup__title">Qui joue ?</h2>
      {!isSolo && (
        <p className="play-setup__type">{isCasual ? 'Partie amicale' : 'Partie classée'}</p>
      )}

      {/* Variant — Cricket / Super Cricket only */}
      {isCricketFamily && (
        <div className="play-setup__variant">
          <p className="play-setup__variant-label">VARIANTE</p>
          <div className="play-setup__variant-row">
            <button
              className={`play-setup__variant-btn${variant === 'normal' ? ' play-setup__variant-btn--on' : ''}`}
              onClick={() => setVariant('normal')}
            >
              NORMAL
            </button>
            <button
              className={`play-setup__variant-btn${variant === 'cutthroat' ? ' play-setup__variant-btn--on' : ''}`}
              onClick={() => setVariant('cutthroat')}
            >
              CUT THROAT
            </button>
          </div>
        </div>
      )}

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

      {/* Quick-pick — top 4 most-played players */}
      {topPlayers.length > 0 && !search && (
        <div className="play-setup__quick">
          <p className="play-setup__quick-label">FRÉQUENTS</p>
          <div className="play-setup__chips">
            {topPlayers.map(name => (
              <button
                key={name}
                className={`play-setup__chip${selected.includes(name) ? ' play-setup__chip--on' : ''}`}
                onClick={() => toggle(name)}
              >
                {profiles[name]?.avatar_url && (
                  <span
                    className="play-setup__chip-avatar"
                    style={{ backgroundImage: `url(${profiles[name].avatar_url})` }}
                  />
                )}
                {selected.includes(name) && <span className="play-setup__check">✓</span>}
                {label(name)}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Player chips — always visible, filtered live by the search box */}
      {filtered.length > 0 && (
        <div className="play-setup__chips">
          {filtered.map(name => (
            <button
              key={name}
              className={`play-setup__chip${selected.includes(name) ? ' play-setup__chip--on' : ''}`}
              onClick={() => toggle(name)}
            >
              {profiles[name]?.avatar_url && (
                <span
                  className="play-setup__chip-avatar"
                  style={{ backgroundImage: `url(${profiles[name].avatar_url})` }}
                />
              )}
              {selected.includes(name) && <span className="play-setup__check">✓</span>}
              {label(name)}
            </button>
          ))}
        </div>
      )}

      {q && !exactMatch && filtered.length === 0 && (
        <p className="play-setup__no-results">
          Appuie sur + pour ajouter <strong>{q}</strong>
        </p>
      )}

      {/* Play order — meaningless for a 1-player solo mode */}
      {!isSolo && selected.length > 0 && (
        <div className="play-setup__order">
          <div className="play-setup__order-header">
            <p className="play-setup__order-label">Ordre de jeu</p>
            <button
              className="play-setup__shuffle"
              disabled={selected.length < 2}
              onClick={() => setSelected(s => [...s].sort(() => Math.random() - 0.5))}
            >
              ⇄
            </button>
          </div>
          <div className="play-setup__order-list">
            {selected.map((name, i) => (
              <div key={name} className="play-setup__order-item">
                <span className="play-setup__order-num">{i + 1}</span>
                <span className="play-setup__order-name">{label(name)}</span>
                <button className="play-setup__order-remove" onClick={() => toggle(name)}>×</button>
              </div>
            ))}
          </div>
        </div>
      )}

      <button
        className="play-setup__start"
        disabled={selected.length < (isSolo ? 1 : 2)}
        onClick={start}
      >
        JOUER →
      </button>
    </div>
  );
}
