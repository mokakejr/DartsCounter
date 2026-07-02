import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../lib/useAuth.jsx';
import { useLeague } from '../lib/useLeague.jsx';
import './Leagues.css';

export default function Leagues({ knownPlayers }) {
  const auth = useAuth();
  const {
    leagues, activeLeague, activateLeague,
    createLeague, joinLeague, renameLeague, deleteLeague, addMember, removeMember,
  } = useLeague();
  const [searchParams, setSearchParams] = useSearchParams();
  const [creating, setCreating] = useState(false);
  const [renaming, setRenaming] = useState(null);   // league.id being renamed
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [joinCode, setJoinCode] = useState('');
  const [error, setError] = useState(null);

  // Deep link from the onboarding wall: /ligues?new=1 opens the create form.
  useEffect(() => {
    if (searchParams.get('new') === '1' && auth.player) {
      setCreating(true);
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, auth.player, setSearchParams]);

  async function run(action) {
    setError(null);
    try {
      await action();
      return true;
    } catch (err) {
      if (err.status === 404) setError('Code d’invitation inconnu.');
      else setError('Une erreur est survenue, réessaie.');
      return false;
    }
  }

  if (!auth.player) {
    return (
      <div className="leagues shell">
        <h1 className="leagues__title display">Ligues</h1>
        <p className="leagues__sub">
          Les ligues rassemblent tes potes autour d'un classement commun —
          partagées entre appareils, rejoignables par code d'invitation.
        </p>
        <Link to="/login?mode=signup&next=/ligues" className="leagues__new" style={{ width: 'fit-content', textDecoration: 'none' }}>
          Créer mon compte
        </Link>
        <p className="leagues__empty">
          Déjà un compte ? <Link to="/login?next=/ligues">Se connecter</Link>
        </p>
      </div>
    );
  }

  return (
    <div className="leagues shell">
      <h1 className="leagues__title display">Ligues</h1>
      <p className="leagues__sub">
        Filtre les stats du dashboard par groupe de joueurs — partage le code
        d'invitation pour que tes potes retrouvent la même ligue.
      </p>

      <div className="leagues__toolbar">
        <button className="leagues__new" onClick={() => setCreating(true)}>
          + Créer une ligue
        </button>
        <form
          className="leagues__join"
          onSubmit={async (e) => {
            e.preventDefault();
            if (await run(() => joinLeague(joinCode.trim()))) setJoinCode('');
          }}
        >
          <input
            className="leagues__input leagues__join-input"
            value={joinCode}
            onChange={e => setJoinCode(e.target.value.toUpperCase())}
            placeholder="Code d’invitation"
            maxLength={6}
          />
          <button type="submit" className="leagues__btn" disabled={joinCode.trim().length < 6}>
            Rejoindre
          </button>
        </form>
      </div>

      {error && <p className="leagues__error">{error}</p>}

      {leagues.length === 0 && !creating && (
        <p className="leagues__empty">Aucune ligue. Crée la tienne ou rejoins-en une avec un code !</p>
      )}

      <div className="leagues__list">
        {leagues.map(league => (
          <LeagueCard
            key={league.id}
            league={league}
            me={auth.player}
            active={activeLeague?.id === league.id}
            knownPlayers={knownPlayers}
            onActivate={() => activateLeague(league.id)}
            onRename={() => setRenaming(league.id)}
            onAddMember={(name) => run(() => addMember(league.id, name))}
            onRemoveMember={(playerId) => run(() => removeMember(league.id, playerId))}
            confirmDelete={confirmDelete === league.id}
            onAskDelete={() => setConfirmDelete(league.id)}
            onCancelDelete={() => setConfirmDelete(null)}
            onDelete={() => run(() => deleteLeague(league.id)).then(() => setConfirmDelete(null))}
            onLeave={() => run(() => removeMember(league.id, auth.player.id))}
          />
        ))}
      </div>

      {creating && (
        <NameForm
          title="Nouvelle ligue"
          submitLabel="Créer"
          onSave={async (name) => {
            if (await run(() => createLeague(name))) setCreating(false);
          }}
          onCancel={() => setCreating(false)}
        />
      )}

      {renaming && (
        <NameForm
          title="Renommer la ligue"
          submitLabel="Enregistrer"
          initial={leagues.find(l => l.id === renaming)?.name ?? ''}
          onSave={async (name) => {
            if (await run(() => renameLeague(renaming, name))) setRenaming(null);
          }}
          onCancel={() => setRenaming(null)}
        />
      )}
    </div>
  );
}

function LeagueCard({
  league, me, active, knownPlayers,
  onActivate, onRename, onAddMember, onRemoveMember,
  confirmDelete, onAskDelete, onCancelDelete, onDelete, onLeave,
}) {
  const isOwner = league.owner_id === me.id;
  const [copied, setCopied] = useState(false);
  const [managing, setManaging] = useState(false);

  const memberNames = new Set(league.members.map(m => m.name));
  const addable = (knownPlayers ?? []).filter(p => !memberNames.has(p));

  function copyCode() {
    navigator.clipboard.writeText(league.invite_code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  return (
    <div className={`leagues__card${active ? ' leagues__card--active' : ''}`}>
      <div className="leagues__card-head">
        <span className="leagues__card-name">{league.name}</span>
        <span className="leagues__card-count">
          {league.members.length} joueur{league.members.length !== 1 ? 's' : ''}
        </span>
      </div>

      <div className="leagues__members">
        {league.members.map(m => (
          <span key={m.id} className={`leagues__chip leagues__member${m.id === me.id ? ' leagues__chip--on' : ''}`}>
            {m.avatar_url && <img className="leagues__member-avatar" src={m.avatar_url} alt="" />}
            {m.display_name || m.name}
            {m.id === me.id && <em className="leagues__member-you"> · toi</em>}
            {isOwner && m.id !== me.id && managing && (
              <button
                type="button"
                className="leagues__member-remove"
                title="Retirer de la ligue"
                onClick={() => onRemoveMember(m.id)}
              >
                ×
              </button>
            )}
          </span>
        ))}
      </div>

      {isOwner && managing && (
        addable.length > 0 ? (
          <div className="leagues__members leagues__members--add">
            {addable.map(p => (
              <button key={p} type="button" className="leagues__chip" onClick={() => onAddMember(p)}>
                + {p}
              </button>
            ))}
          </div>
        ) : (
          <p className="leagues__empty">Tous les joueurs connus sont déjà dans la ligue.</p>
        )
      )}

      <div className="leagues__code-row">
        <span className="leagues__code-label">Code d'invitation</span>
        <code className="leagues__code">{league.invite_code}</code>
        <button type="button" className="leagues__btn" onClick={copyCode}>
          {copied ? 'Copié !' : 'Copier'}
        </button>
      </div>

      <div className="leagues__card-actions">
        <button
          className={`leagues__btn leagues__btn--activate${active ? ' leagues__btn--on' : ''}`}
          onClick={onActivate}
        >
          {active ? '✓ Active' : 'Activer'}
        </button>
        {isOwner ? (
          <>
            <button className="leagues__btn" onClick={() => setManaging(m => !m)}>
              {managing ? 'Fermer' : 'Gérer les joueurs'}
            </button>
            <button className="leagues__btn" onClick={onRename}>Renommer</button>
            {confirmDelete ? (
              <>
                <button className="leagues__btn leagues__btn--delete" onClick={onDelete}>Confirmer</button>
                <button className="leagues__btn" onClick={onCancelDelete}>Annuler</button>
              </>
            ) : (
              <button className="leagues__btn leagues__btn--delete" onClick={onAskDelete}>Supprimer</button>
            )}
          </>
        ) : (
          <button className="leagues__btn leagues__btn--delete" onClick={onLeave}>Quitter</button>
        )}
      </div>
    </div>
  );
}

function NameForm({ title, submitLabel, initial = '', onSave, onCancel }) {
  const [name, setName] = useState(initial);

  function submit(e) {
    e.preventDefault();
    if (!name.trim()) return;
    onSave(name.trim());
  }

  return (
    <div className="leagues__overlay" onClick={onCancel}>
      <form className="leagues__form" onClick={e => e.stopPropagation()} onSubmit={submit}>
        <h2 className="leagues__form-title">{title}</h2>

        <label className="leagues__label">Nom de la ligue</label>
        <input
          className="leagues__input"
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="Ex: Ligue du Bureau"
          maxLength={40}
          autoFocus
        />

        <div className="leagues__form-actions">
          <button type="button" className="leagues__btn" onClick={onCancel}>Annuler</button>
          <button type="submit" className="leagues__btn leagues__btn--primary" disabled={!name.trim()}>
            {submitLabel}
          </button>
        </div>
      </form>
    </div>
  );
}
