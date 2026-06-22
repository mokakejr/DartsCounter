import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLeague } from '../lib/useLeague.jsx';
import './IdentityPicker.css';

const norm = s => s.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '');

// Join flow: pick which existing player "is you" (or create a brand-new one).
// Adds you to the roster if you weren't already on it, sets your identity,
// activates the league, then navigates home (the now-active league becomes the
// dashboard).
export default function IdentityPicker({ league, knownPlayers, onClose }) {
  const { joinLeague } = useLeague();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const inputRef = useRef(null);

  // Focus the search on open and close on Escape — align with CalloutModal a11y.
  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus(), 60);
    const onKey = e => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => { clearTimeout(t); window.removeEventListener('keydown', onKey); };
  }, [onClose]);

  const options = useMemo(() => {
    const roster = league.players;
    const others = (knownPlayers ?? []).filter(p => !roster.includes(p));
    return [...roster, ...others];
  }, [league.players, knownPlayers]);

  const trimmed = query.trim();
  const filtered = query ? options.filter(p => norm(p).includes(norm(query))) : options;
  const accent = league.color || 'var(--primary)';

  // A typed name that matches nobody is a genuinely new player → let them create it.
  const exactMatch = options.some(p => norm(p) === norm(trimmed));
  const canCreate = trimmed.length > 0 && !exactMatch;

  function pick(name) {
    joinLeague(league.id, name);
    navigate('/');
  }

  return (
    <div className="idpick__overlay" onClick={onClose}>
      <div
        className="idpick"
        role="dialog"
        aria-modal="true"
        aria-label={`Rejoindre ${league.name}`}
        onClick={e => e.stopPropagation()}
      >
        <button className="modal__close" onClick={onClose} aria-label="Fermer">×</button>
        <h3 className="idpick__title">
          Qui es-tu dans <span style={{ color: accent }}>{league.name}</span> ?
        </h3>
        <p className="idpick__sub">Choisis ton joueur (ou crée-le) — ton profil sera mis en avant.</p>
        <input
          ref={inputRef}
          className="idpick__input"
          placeholder="Rechercher ou créer un joueur…"
          value={query}
          onChange={e => setQuery(e.target.value)}
        />
        <div className="idpick__list">
          {filtered.map(p => (
            <button key={p} className="idpick__opt" onClick={() => pick(p)}>
              {league.players.includes(p) ? p : <>{p} <span className="idpick__new">hors ligue</span></>}
            </button>
          ))}
          {canCreate && (
            <button className="idpick__opt idpick__opt--create" onClick={() => pick(trimmed)}>
              + Créer « {trimmed} »
            </button>
          )}
          {filtered.length === 0 && !canCreate && (
            <p className="idpick__dim">Tape un nom pour créer ton joueur.</p>
          )}
        </div>
      </div>
    </div>
  );
}
