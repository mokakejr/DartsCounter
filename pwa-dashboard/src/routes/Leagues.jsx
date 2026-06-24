import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useLeague } from '../lib/useLeague.jsx';
import { useAuth } from '../lib/useAuth.jsx';
import './Leagues.css';

export default function Leagues({ knownPlayers }) {
  const auth = useAuth();
  const { leagues, activeLeague, activateLeague, createLeague, updateLeague, deleteLeague } = useLeague();
  const [editing, setEditing] = useState(null);    // null | 'new' | league.id
  const [confirmDelete, setConfirmDelete] = useState(null); // league.id pending deletion

  // Leagues are tied to an account: no session, no access. Wait for auth to
  // resolve (avoid a flash), then gate behind login with a sign-up CTA.
  if (!auth.ready) return null;
  if (!auth.player) return <LeaguesGate />;

  const me = auth.player.display_name || auth.player.name;

  const editTarget = editing && editing !== 'new'
    ? leagues.find(l => l.id === editing)
    : null;

  return (
    <div className="leagues shell">
      <h1 className="leagues__title display">Ligues</h1>
      <p className="leagues__sub">
        Filtre les stats du dashboard par groupe de joueurs — sans modifier les données.
      </p>

      <button className="leagues__new" onClick={() => setEditing('new')}>
        + Créer une ligue
      </button>

      {leagues.length === 0 && !editing && (
        <p className="leagues__empty">Aucune ligue créée. Commence par en créer une !</p>
      )}

      <div className="leagues__list">
        {leagues.map(league => (
          <div
            key={league.id}
            className={`leagues__card${activeLeague?.id === league.id ? ' leagues__card--active' : ''}`}
          >
            <div className="leagues__card-head">
              <span className="leagues__card-name">{league.name}</span>
              <span className="leagues__card-count">{league.players.length} joueur{league.players.length !== 1 ? 's' : ''}</span>
            </div>
            <p className="leagues__card-players">
              {league.players.map((p, i) => (
                <span key={p}>
                  {i > 0 && ' · '}
                  {p === me ? <strong className="leagues__me">{p} (toi)</strong> : p}
                </span>
              ))}
            </p>
            <div className="leagues__card-actions">
              <button
                className={`leagues__btn leagues__btn--activate${activeLeague?.id === league.id ? ' leagues__btn--on' : ''}`}
                onClick={() => activateLeague(league.id)}
              >
                {activeLeague?.id === league.id ? '✓ Active' : 'Activer'}
              </button>
              <button className="leagues__btn" onClick={() => setEditing(league.id)}>Modifier</button>
              {confirmDelete === league.id ? (
                <>
                  <button
                    className="leagues__btn leagues__btn--delete"
                    onClick={() => { deleteLeague(league.id); setConfirmDelete(null); }}
                  >
                    Confirmer
                  </button>
                  <button className="leagues__btn" onClick={() => setConfirmDelete(null)}>
                    Annuler
                  </button>
                </>
              ) : (
                <button
                  className="leagues__btn leagues__btn--delete"
                  onClick={() => setConfirmDelete(league.id)}
                >
                  Supprimer
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {editing && (
        <LeagueForm
          league={editTarget}
          knownPlayers={knownPlayers}
          me={me}
          onSave={(name, players) => {
            if (editing === 'new') createLeague(name, players);
            else updateLeague(editing, name, players);
            setEditing(null);
          }}
          onCancel={() => setEditing(null)}
        />
      )}
    </div>
  );
}

// Shown when no account is signed in. Leagues require a session, so we offer
// account creation right here (the "endroit des ligues").
function LeaguesGate() {
  return (
    <div className="leagues shell">
      <h1 className="leagues__title display">Ligues</h1>
      <div className="leagues__gate">
        <span className="leagues__gate-ico" aria-hidden="true">🔒</span>
        <h2 className="leagues__gate-title">Crée ton compte pour rejoindre une ligue</h2>
        <p className="leagues__gate-sub">
          Les ligues sont liées à ton compte : connecte-toi pour créer la tienne,
          rejoindre tes potes et filtrer le dashboard sur ton groupe.
        </p>
        <div className="leagues__gate-actions">
          <Link to="/login?mode=signup" className="leagues__gate-cta">Créer un compte</Link>
          <Link to="/login?mode=login" className="leagues__gate-link">J'ai déjà un compte</Link>
        </div>
      </div>
    </div>
  );
}

function LeagueForm({ league, knownPlayers, me, onSave, onCancel }) {
  const [name, setName] = useState(league?.name ?? '');
  // A new league always includes its creator (the signed-in account).
  const [players, setPlayers] = useState(league?.players ?? (me ? [me] : []));

  // Your own account is always offered first and can't be removed — you're a
  // member of the leagues you create. Other known players follow, de-duplicated.
  const chipPlayers = [me, ...(knownPlayers ?? []).filter(p => p !== me)].filter(Boolean);

  function togglePlayer(p) {
    if (p === me) return; // you're always in
    setPlayers(prev => prev.includes(p) ? prev.filter(x => x !== p) : [...prev, p]);
  }

  function submit(e) {
    e.preventDefault();
    if (!name.trim() || players.length === 0) return;
    onSave(name.trim(), players);
  }

  return (
    <div className="leagues__overlay" onClick={onCancel}>
      <form className="leagues__form" onClick={e => e.stopPropagation()} onSubmit={submit}>
        <h2 className="leagues__form-title">{league ? 'Modifier la ligue' : 'Nouvelle ligue'}</h2>

        <label className="leagues__label">Nom de la ligue</label>
        <input
          className="leagues__input"
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="Ex: Ligue du Bureau"
          maxLength={40}
          autoFocus
        />

        <label className="leagues__label">Joueurs ({players.length} sélectionné{players.length !== 1 ? 's' : ''})</label>
        {chipPlayers.length > 0 ? (
          <div className="leagues__player-chips">
            {chipPlayers.map(p => (
              <button
                key={p}
                type="button"
                className={`leagues__chip${players.includes(p) ? ' leagues__chip--on' : ''}${p === me ? ' leagues__chip--me' : ''}`}
                onClick={() => togglePlayer(p)}
                aria-pressed={players.includes(p)}
              >
                {players.includes(p) && <span>✓ </span>}{p}{p === me && <span className="leagues__chip-tag"> toi</span>}
              </button>
            ))}
          </div>
        ) : (
          <p className="leagues__empty">Joue quelques parties pour voir les joueurs ici.</p>
        )}

        <div className="leagues__form-actions">
          <button type="button" className="leagues__btn" onClick={onCancel}>Annuler</button>
          <button
            type="submit"
            className="leagues__btn leagues__btn--primary"
            disabled={!name.trim() || players.length === 0}
          >
            {league ? 'Enregistrer' : 'Créer'}
          </button>
        </div>
      </form>
    </div>
  );
}
