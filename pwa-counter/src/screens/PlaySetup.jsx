import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { fetchPlayers } from '../api/players.js';
import { apiGet } from '../api/client.js';
import { createLiveMatch } from '../live.js';
import { MODE_ROUTE, MODE_LABEL } from '../modes/registry.js';
import { assignNumbers } from '../modes/killer.js';
import { TARGET_GENERATOR } from '../modes/shanghaiVariants.js';
import { censorName } from '../censor.js';
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

const CRICKET_FAMILY = new Set(['cricket', 'superCricket']);
// Solo/training modes: 1 player, always casual — no reorder list, no
// casual/competitive toggle (they never touch Elo regardless).
const SOLO_MODES = new Set(['bob27', 'roundTheClock']);
// Party modes: multiplayer, but never Elo-eligible regardless of the
// category the player came from (only reachable via "Amical" anyway).
const ALWAYS_CASUAL_MODES = new Set([...SOLO_MODES, 'killer', 'halveIt']);

const SHANGHAI_VARIANTS = [
  { id: 'classic', label: 'CLASSIQUE' },
  { id: 'bull', label: 'BULL' },
  { id: 'random', label: 'RANDOM' },
  { id: 'crazy', label: 'CRAZY' },
];
const SHANGHAI_VARIANT_IDS = new Set(SHANGHAI_VARIANTS.map(v => v.id));

const KILLER_VARIANTS = [
  { id: 'any', label: 'ANY HIT' },
  { id: 'double', label: 'DOUBLE ONLY' },
];
const HALVEIT_VARIANTS = [
  { id: 'standard', label: 'STANDARD · 9' },
  { id: 'short', label: 'COURT · 6' },
];

export default function PlaySetup() {
  const navigate = useNavigate();
  const { state } = useLocation();
  const mode = state?.mode ?? 'shanghai';
  const isCricketFamily = CRICKET_FAMILY.has(mode);
  const isShanghaiFamily = mode === 'shanghai';
  const isSolo = SOLO_MODES.has(mode);
  const isKiller = mode === 'killer';
  const isHalveIt = mode === 'halveIt';
  // Decided upstream on the category screen (ranked/casual/solo) — no
  // toggle here, just carried through to the game screen's postGame() call.
  const isCasual = ALWAYS_CASUAL_MODES.has(mode) ? true : !!state?.isCasual;

  const [localNames, setLocalNames] = useState(() => loadNames(LOCAL_KEY));
  const [serverNames, setServerNames] = useState(() => loadNames(SERVER_KEY));
  const [profiles, setProfiles] = useState({}); // name -> {display_name, avatar_url} — display only, selection stays keyed by canonical name
  const [selected, setSelected] = useState([]);
  const [search, setSearch] = useState('');
  const [variant, setVariant] = useState(() => {
    if (isShanghaiFamily) return SHANGHAI_VARIANT_IDS.has(state?.variant) ? state.variant : 'classic';
    if (isKiller) return state?.variant === 'double' ? 'double' : 'any';
    if (isHalveIt) return state?.variant === 'short' ? 'short' : 'standard';
    return state?.variant === 'cutthroat' ? 'cutthroat' : 'normal';
  });
  const [lives, setLives] = useState(() => (Number.isInteger(state?.lives) ? state.lives : 3));
  const [topPlayers, setTopPlayers] = useState([]);
  // Match à distance (Epic 13) — 2 joueurs / 2 écrans, tous les modes
  // multijoueurs (les modes solo n'ont personne en face).
  const [remote, setRemote] = useState(false);
  const remoteEligible = !isSolo;

  // Moteur de Rivalité (Epic 5.2): head-to-head + proba ELO dès 2 joueurs.
  const [rivalry, setRivalry] = useState(null);

  useEffect(() => {
    if (isSolo || selected.length < 2) { setRivalry(null); return; }
    let cancelled = false;
    apiGet('/stats/head-to-head', { players: selected.join(',') })
      .then(pairs => { if (!cancelled) setRivalry(pairs); })
      .catch(() => { if (!cancelled) setRivalry(null); });
    return () => { cancelled = true; };
  }, [selected, isSolo]);

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
    return censorName(profiles[name]?.display_name || name);
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

  async function start() {
    // À distance (Epic 13): la room attend les deux « Prêt » dans le sas.
    if (remoteEligible && remote && selected.length === 2) {
      // Tout ce que le rejoignant doit connaître transite par le serveur :
      // l'id de mode front (routage du sas), les réglages, et l'aléatoire
      // tiré UNE fois ici pour que les deux écrans jouent la même partie.
      const options = { mode, variant, isCasual, lives };
      if (isShanghaiFamily) options.targets = TARGET_GENERATOR[variant]();
      if (isKiller) options.numbers = assignNumbers(selected.length);
      const live = await createLiveMatch({
        mode: MODE_LABEL[mode] ?? mode,
        players: selected,
        variant,
        remote: true,
        options,
        timeoutMs: 8000, // ici le match live est indispensable, on patiente
      });
      if (!live) return; // pas de réseau, pas de match à distance
      navigate(`/lobby/${live.id}`, { state: { me: selected[0] } });
      return;
    }
    // Match live éphémère (Epic 11) — best-effort : hors-ligne ou backend
    // sans /live, on joue exactement comme avant.
    let liveId = null;
    if (!isSolo && selected.length >= 2) {
      const live = await createLiveMatch({
        mode: MODE_LABEL[mode] ?? mode,
        players: selected,
        variant,
      });
      liveId = live?.id ?? null;
    }
    navigate(MODE_ROUTE[mode] ?? '/shanghai', {
      state: { players: selected, variant, mode, isCasual, lives, liveId },
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

      {/* Variant — Shanghai only */}
      {isShanghaiFamily && (
        <div className="play-setup__variant">
          <p className="play-setup__variant-label">VARIANTE</p>
          <div className="play-setup__variant-row play-setup__variant-row--grid4">
            {SHANGHAI_VARIANTS.map(v => (
              <button
                key={v.id}
                className={`play-setup__variant-btn${variant === v.id ? ' play-setup__variant-btn--on' : ''}`}
                onClick={() => setVariant(v.id)}
              >
                {v.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Variant — Killer only, plus a lives stepper */}
      {isKiller && (
        <>
          <div className="play-setup__variant">
            <p className="play-setup__variant-label">VARIANTE</p>
            <div className="play-setup__variant-row">
              {KILLER_VARIANTS.map(v => (
                <button
                  key={v.id}
                  className={`play-setup__variant-btn${variant === v.id ? ' play-setup__variant-btn--on' : ''}`}
                  onClick={() => setVariant(v.id)}
                >
                  {v.label}
                </button>
              ))}
            </div>
          </div>
          <div className="play-setup__variant">
            <p className="play-setup__variant-label">VIES</p>
            <div className="play-setup__stepper">
              <button
                className="play-setup__stepper-btn"
                disabled={lives <= 1}
                onClick={() => setLives(l => Math.max(1, l - 1))}
              >
                −
              </button>
              <span className="play-setup__stepper-val">{lives}</span>
              <button
                className="play-setup__stepper-btn"
                disabled={lives >= 9}
                onClick={() => setLives(l => Math.min(9, l + 1))}
              >
                +
              </button>
            </div>
          </div>
        </>
      )}

      {/* Variant — Halve It only */}
      {isHalveIt && (
        <div className="play-setup__variant">
          <p className="play-setup__variant-label">VARIANTE</p>
          <div className="play-setup__variant-row">
            {HALVEIT_VARIANTS.map(v => (
              <button
                key={v.id}
                className={`play-setup__variant-btn${variant === v.id ? ' play-setup__variant-btn--on' : ''}`}
                onClick={() => setVariant(v.id)}
              >
                {v.label}
              </button>
            ))}
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

      {remoteEligible && (
        <div className="play-setup__variant">
          <p className="play-setup__variant-label">OÙ ÊTES-VOUS ?</p>
          <div className="play-setup__variant-row">
            <button
              className={`play-setup__variant-btn${!remote ? ' play-setup__variant-btn--on' : ''}`}
              onClick={() => setRemote(false)}
            >
              LOCAL (MÊME ÉCRAN)
            </button>
            <button
              className={`play-setup__variant-btn${remote ? ' play-setup__variant-btn--on' : ''}`}
              onClick={() => setRemote(true)}
            >
              À DISTANCE (2 ÉCRANS)
            </button>
          </div>
          {remote && (
            <p className="play-setup__remote-hint">
              Choisis 2 joueurs — tu es le premier de l'ordre de jeu. Un lien à
              partager sera généré dans le sas d'attente.
            </p>
          )}
        </div>
      )}

      {/* Bloc Rivalité (Epic 5.2) */}
      {rivalry && rivalry.length > 0 && (
        <div className="play-setup__rivalry">
          <p className="play-setup__rivalry-label">RIVALITÉ</p>
          {rivalry.map(r => {
            const total = r.a_wins + r.b_wins;
            const leaderName = r.a_wins === r.b_wins ? null : (r.a_wins > r.b_wins ? r.a : r.b);
            const proba = Math.round(r.a_win_probability * 100);
            return (
              <div key={`${r.a}-${r.b}`} className="play-setup__rivalry-row">
                <span className="play-setup__rivalry-score">
                  {total === 0
                    ? `${label(r.a)} vs ${label(r.b)} — premier duel !`
                    : leaderName
                      ? `${label(leaderName)} mène ${Math.max(r.a_wins, r.b_wins)} à ${Math.min(r.a_wins, r.b_wins)}`
                      : `Égalité parfaite ${r.a_wins} — ${r.b_wins}`}
                </span>
                <span className="play-setup__rivalry-proba">
                  {label(r.a)} gagne à {proba}%
                </span>
              </div>
            );
          })}
        </div>
      )}

      <button
        className="play-setup__start"
        disabled={selected.length < (isSolo ? 1 : 2) || (remoteEligible && remote && selected.length !== 2)}
        onClick={start}
      >
        JOUER →
      </button>
    </div>
  );
}
