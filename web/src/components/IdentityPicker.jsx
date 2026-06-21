import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLeague } from '../lib/useLeague.jsx';
import './IdentityPicker.css';

const norm = s => s.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '');

// Join flow: pick which existing player "is you". Adds you to the roster if
// you weren't already on it, sets your identity, activates the league, then
// navigates home (the now-active league becomes the dashboard).
export default function IdentityPicker({ league, knownPlayers, onClose }) {
  const { joinLeague } = useLeague();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');

  const options = useMemo(() => {
    const roster = league.players;
    const others = (knownPlayers ?? []).filter(p => !roster.includes(p));
    return [...roster, ...others];
  }, [league.players, knownPlayers]);

  const filtered = query ? options.filter(p => norm(p).includes(norm(query))) : options;
  const accent = league.color || 'var(--primary)';

  function pick(name) {
    joinLeague(league.id, name);
    navigate('/');
  }

  return (
    <div className="idpick__overlay" onClick={onClose}>
      <div className="idpick" onClick={e => e.stopPropagation()}>
        <h3 className="idpick__title">
          Qui es-tu dans <span style={{ color: accent }}>{league.name}</span> ?
        </h3>
        <p className="idpick__sub">Choisis ton joueur — ton profil sera mis en avant.</p>
        <input
          className="idpick__input"
          placeholder="Rechercher un joueur…"
          value={query}
          onChange={e => setQuery(e.target.value)}
          autoFocus
        />
        <div className="idpick__list">
          {filtered.length === 0 && <p className="idpick__dim">Aucun joueur trouvé.</p>}
          {filtered.map(p => (
            <button key={p} className="idpick__opt" onClick={() => pick(p)}>
              {league.players.includes(p) ? p : <>{p} <span className="idpick__new">nouveau</span></>}
            </button>
          ))}
        </div>
        <button className="idpick__cancel" onClick={onClose}>Annuler</button>
      </div>
    </div>
  );
}
