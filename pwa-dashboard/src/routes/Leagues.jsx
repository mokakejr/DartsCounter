import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../lib/useAuth.jsx';
import { useLeague } from '../lib/useLeague.jsx';
import { LEAGUE_ICONS, leagueGlyph } from '../lib/leagueIcons.js';
import * as api from '../api/leagues.js';
import './Leagues.css';

const PRIVACY_LABELS = {
  PUBLIC: { label: 'Publique', desc: 'Visible de tous, on rejoint en un clic.' },
  PRIVATE_CODE: { label: 'Sur invitation', desc: 'On entre avec le code à 6 lettres.' },
  APPLICATION: { label: 'Sur candidature', desc: 'Les demandes passent par toi (ou tes admins).' },
};

export default function Leagues({ knownPlayers }) {
  const auth = useAuth();
  const {
    leagues, activeLeague, activateLeague,
    createLeague, joinLeague, joinDirect, renameLeague, deleteLeague,
    addMember, removeMember, setRole,
  } = useLeague();
  const [searchParams, setSearchParams] = useSearchParams();
  const [creating, setCreating] = useState(false);
  const [renaming, setRenaming] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [joinCode, setJoinCode] = useState('');
  const [error, setError] = useState(null);
  const [publicLeagues, setPublicLeagues] = useState([]);

  useEffect(() => {
    if (searchParams.get('new') === '1' && auth.player) {
      setCreating(true);
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, auth.player, setSearchParams]);

  useEffect(() => {
    if (!auth.token) return;
    api.fetchPublicLeagues(auth.token).then(setPublicLeagues).catch(() => {});
  }, [auth.token, leagues]);

  async function run(action) {
    setError(null);
    try {
      await action();
      return true;
    } catch (err) {
      if (err.status === 404) setError('Code d’invitation inconnu.');
      else if (err.status === 403) setError('Tu n’as pas les droits pour faire ça.');
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

  const myLeagueIds = new Set(leagues.map(l => l.id));
  const discoverable = publicLeagues.filter(l => !myLeagueIds.has(l.id));

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
            maxLength={7}
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
            token={auth.token}
            active={activeLeague?.id === league.id}
            knownPlayers={knownPlayers}
            onActivate={() => activateLeague(league.id)}
            onRename={() => setRenaming(league.id)}
            onAddMember={(name) => run(() => addMember(league.id, name))}
            onRemoveMember={(playerId) => run(() => removeMember(league.id, playerId))}
            onSetRole={(playerId, role) => run(() => setRole(league.id, playerId, role))}
            confirmDelete={confirmDelete === league.id}
            onAskDelete={() => setConfirmDelete(league.id)}
            onCancelDelete={() => setConfirmDelete(null)}
            onDelete={() => run(() => deleteLeague(league.id)).then(() => setConfirmDelete(null))}
            onLeave={() => run(() => removeMember(league.id, auth.player.id))}
          />
        ))}
      </div>

      {discoverable.length > 0 && (
        <>
          <h2 className="leagues__section-title display">À découvrir</h2>
          <div className="leagues__list">
            {discoverable.map(l => (
              <div key={l.id} className="leagues__card leagues__card--public">
                <div className="leagues__card-head">
                  <span className="leagues__card-name">
                    <span className="leagues__icon">{leagueGlyph(l.icon)}</span> {l.name}
                  </span>
                  <span className="leagues__card-count">
                    {l.member_count} joueur{l.member_count !== 1 ? 's' : ''}
                  </span>
                </div>
                {l.motto && <p className="leagues__motto">« {l.motto} »</p>}
                <div className="leagues__card-actions">
                  <button
                    className="leagues__btn leagues__btn--primary"
                    onClick={() => run(() => joinDirect(l.id))}
                  >
                    {l.privacy_level === 'APPLICATION' ? 'Candidater' : 'Rejoindre'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {creating && (
        <CreateWizard
          onSave={async (fields) => {
            if (await run(() => createLeague(fields))) setCreating(false);
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

function roleBadge(role) {
  if (role === 'owner') return <span className="leagues__role" title="Propriétaire">👑</span>;
  if (role === 'admin') return <span className="leagues__role" title="Administrateur">🛡️</span>;
  return null;
}

function LeagueCard({
  league, me, token, active, knownPlayers,
  onActivate, onRename, onAddMember, onRemoveMember, onSetRole,
  confirmDelete, onAskDelete, onCancelDelete, onDelete, onLeave,
}) {
  const myMembership = league.members.find(m => m.id === me.id);
  const myRole = league.owner_id === me.id ? 'owner' : (myMembership?.role ?? 'member');
  const isOwner = myRole === 'owner';
  const isAdmin = myRole === 'owner' || myRole === 'admin';
  const isTaverne = league.owner_id === null;
  const [copied, setCopied] = useState(false);
  const [managing, setManaging] = useState(false);

  // Les anciens membres (ghosts) ne sont pas « ajoutables » ici : ils ont
  // leur propre section « Réintégrer » dans la modal — le backend réactive
  // leur ligne via join().
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
        <span className="leagues__card-name">
          <span className="leagues__icon">{leagueGlyph(league.icon)}</span> {league.name}
        </span>
        <span className="leagues__card-count">
          {league.members.filter(m => m.is_active !== false).length} joueur
          {league.members.filter(m => m.is_active !== false).length !== 1 ? 's' : ''}
          {' · '}{PRIVACY_LABELS[league.privacy_level]?.label ?? league.privacy_level}
        </span>
      </div>
      {league.motto && <p className="leagues__motto">« {league.motto} »</p>}

      <div className="leagues__members">
        {league.members.map(m => (
          <span
            key={m.id}
            className={
              `leagues__chip leagues__member` +
              (m.id === me.id ? ' leagues__chip--on' : '') +
              (m.is_active === false ? ' leagues__chip--ghost' : '')
            }
            title={m.is_active === false ? 'A quitté la ligue (historique conservé)' : undefined}
          >
            {m.avatar_url && <img className="leagues__member-avatar" src={m.avatar_url} alt="" />}
            {roleBadge(m.role)}
            {m.display_name || m.name}
            {m.id === me.id && <em className="leagues__member-you"> · toi</em>}
          </span>
        ))}
      </div>

      {managing && (
        <ManageMembersModal
          league={league}
          me={me}
          myRole={myRole}
          addable={addable}
          onAddMember={onAddMember}
          onRemoveMember={onRemoveMember}
          onSetRole={onSetRole}
          onClose={() => setManaging(false)}
        />
      )}

      {isAdmin && !isTaverne && league.privacy_level === 'APPLICATION' && (
        <JoinRequests league={league} token={token} />
      )}

      {isAdmin && !isTaverne && <Disputes league={league} token={token} />}

      {!isTaverne && (
        <div className="leagues__code-row">
          <span className="leagues__code-label">Code d'invitation</span>
          <code className="leagues__code">{league.invite_code}</code>
          <button type="button" className="leagues__btn" onClick={copyCode}>
            {copied ? 'Copié !' : 'Copier'}
          </button>
        </div>
      )}

      <div className="leagues__card-actions">
        <button
          className={`leagues__btn leagues__btn--activate${active ? ' leagues__btn--on' : ''}`}
          onClick={onActivate}
        >
          {active ? '✓ Active' : 'Activer'}
        </button>
        {isOwner && !isTaverne ? (
          <>
            <button className="leagues__btn" onClick={() => setManaging(true)}>
              Gérer les joueurs
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
          <>
            {isAdmin && !isTaverne && (
              <button className="leagues__btn" onClick={() => setManaging(true)}>
                Gérer les joueurs
              </button>
            )}
            <button className="leagues__btn leagues__btn--delete" onClick={onLeave}>Quitter</button>
          </>
        )}
      </div>
    </div>
  );
}

// Modal « Gérer les joueurs » : membres actifs (retrait avec confirmation,
// promotion), anciens membres réintégrables (le backend réactive leur ligne
// via join()), et ajout par recherche. Les droits suivent le backend : un
// admin ajoute/retire les membres simples, seul le owner promeut/rétrograde
// et retire un admin.
function ManageMembersModal({
  league, me, myRole, addable,
  onAddMember, onRemoveMember, onSetRole, onClose,
}) {
  const isOwner = myRole === 'owner';
  const [confirmRemove, setConfirmRemove] = useState(null); // player id
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState(false);

  const activeMembers = league.members.filter(m => m.is_active !== false);
  const ghosts = league.members.filter(m => m.is_active === false);
  const query = search.trim().toLowerCase();
  const results = query ? addable.filter(p => p.toLowerCase().includes(query)) : addable;

  const canRemove = (m) =>
    m.id !== me.id && m.id !== league.owner_id && (isOwner || m.role !== 'admin');

  async function act(fn) {
    setBusy(true);
    try { await fn(); } finally { setBusy(false); }
  }

  return (
    <div className="leagues__overlay" onClick={onClose}>
      <div className="leagues__form leagues__manage" onClick={e => e.stopPropagation()}>
        <h2 className="leagues__form-title">Gérer les joueurs</h2>

        <h3 className="leagues__manage-h">Membres · {activeMembers.length}</h3>
        <div className="leagues__manage-list">
          {activeMembers.map(m => (
            <div key={m.id} className="leagues__mrow">
              <span className="leagues__mrow-id">
                {m.avatar_url && <img className="leagues__mrow-avatar" src={m.avatar_url} alt="" />}
                <span className="leagues__mrow-name">
                  {roleBadge(m.role)}
                  {m.display_name || m.name}
                  {m.id === me.id && <em className="leagues__member-you"> · toi</em>}
                </span>
              </span>
              <span className="leagues__mrow-actions">
                {confirmRemove === m.id ? (
                  <>
                    <span className="leagues__mrow-hint">Retirer ? L'historique et l'Elo sont conservés.</span>
                    <button
                      type="button"
                      className="leagues__btn leagues__btn--delete"
                      disabled={busy}
                      onClick={() => act(async () => {
                        await onRemoveMember(m.id);
                        setConfirmRemove(null);
                      })}
                    >
                      Confirmer
                    </button>
                    <button type="button" className="leagues__btn" onClick={() => setConfirmRemove(null)}>
                      Annuler
                    </button>
                  </>
                ) : (
                  <>
                    {isOwner && m.id !== league.owner_id && m.id !== me.id && (
                      <button
                        type="button"
                        className="leagues__btn"
                        disabled={busy}
                        onClick={() => act(() => onSetRole(m.id, m.role === 'admin' ? 'member' : 'admin'))}
                      >
                        {m.role === 'admin' ? 'Rétrograder' : 'Promouvoir admin'}
                      </button>
                    )}
                    {canRemove(m) && (
                      <button
                        type="button"
                        className="leagues__btn leagues__btn--delete"
                        onClick={() => setConfirmRemove(m.id)}
                      >
                        Retirer
                      </button>
                    )}
                  </>
                )}
              </span>
            </div>
          ))}
        </div>

        {ghosts.length > 0 && (
          <>
            <h3 className="leagues__manage-h">Anciens membres · {ghosts.length}</h3>
            <div className="leagues__manage-list">
              {ghosts.map(m => (
                <div key={m.id} className="leagues__mrow leagues__mrow--ghost">
                  <span className="leagues__mrow-id">
                    {m.avatar_url && <img className="leagues__mrow-avatar" src={m.avatar_url} alt="" />}
                    <span className="leagues__mrow-name">{m.display_name || m.name}</span>
                  </span>
                  <span className="leagues__mrow-actions">
                    <button
                      type="button"
                      className="leagues__btn leagues__btn--primary"
                      disabled={busy}
                      onClick={() => act(() => onAddMember(m.name))}
                    >
                      Réintégrer
                    </button>
                  </span>
                </div>
              ))}
            </div>
          </>
        )}

        <h3 className="leagues__manage-h">Ajouter un joueur</h3>
        {addable.length > 0 ? (
          <>
            <input
              className="leagues__input"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Rechercher un joueur…"
            />
            <div className="leagues__manage-list leagues__manage-list--scroll">
              {results.map(p => (
                <div key={p} className="leagues__mrow">
                  <span className="leagues__mrow-id">
                    <span className="leagues__mrow-name">{p}</span>
                  </span>
                  <span className="leagues__mrow-actions">
                    <button
                      type="button"
                      className="leagues__btn leagues__btn--primary"
                      disabled={busy}
                      onClick={() => act(() => onAddMember(p))}
                    >
                      + Ajouter
                    </button>
                  </span>
                </div>
              ))}
              {results.length === 0 && (
                <p className="leagues__empty">Aucun joueur trouvé pour « {search.trim()} ».</p>
              )}
            </div>
          </>
        ) : (
          <p className="leagues__empty">Tous les joueurs connus sont déjà membres.</p>
        )}

        <div className="leagues__form-actions">
          <button type="button" className="leagues__btn" onClick={onClose}>Fermer</button>
        </div>
      </div>
    </div>
  );
}

function JoinRequests({ league, token }) {
  const [requests, setRequests] = useState([]);
  const { refresh } = useLeague();

  const load = useCallback(() => {
    api.fetchJoinRequests(token, league.id).then(setRequests).catch(() => {});
  }, [token, league.id]);

  useEffect(load, [load]);

  if (requests.length === 0) return null;

  async function decide(playerId, action) {
    await api.decideJoinRequest(token, league.id, playerId, action);
    load();
    if (action === 'accept') refresh();
  }

  return (
    <div className="leagues__requests">
      <span className="leagues__code-label">Candidatures</span>
      {requests.map(r => (
        <span key={r.player_id} className="leagues__chip">
          {r.display_name || r.name}
          <button className="leagues__req-btn leagues__req-btn--ok" title="Accepter"
            onClick={() => decide(r.player_id, 'accept')}>✓</button>
          <button className="leagues__req-btn leagues__req-btn--no" title="Refuser"
            onClick={() => decide(r.player_id, 'reject')}>✗</button>
        </span>
      ))}
    </div>
  );
}

function Disputes({ league, token }) {
  const [disputes, setDisputes] = useState([]);

  const load = useCallback(() => {
    api.fetchDisputes(token, league.id).then(setDisputes).catch(() => {});
  }, [token, league.id]);

  useEffect(load, [load]);

  if (disputes.length === 0) return null;

  async function verdict(gameId, action) {
    await api.adjudicateGame(token, gameId, action);
    load();
  }

  const REASONS = {
    outlier: 'Performance anormale détectée',
    impossible_score: 'Score impossible (signalé)',
    rage_quit: 'Rage-quit (signalé)',
    other: 'Signalé par un joueur',
  };

  return (
    <div className="leagues__disputes">
      <span className="leagues__code-label">⚖️ Litiges — en attente d'homologation</span>
      {disputes.map(g => (
        <div key={g.id} className="leagues__dispute">
          <div className="leagues__dispute-body">
            <strong>{g.mode}</strong>{' — '}
            {g.players.map(p => `${p.name} (${p.score})`).join(' vs ')}
            <div className="leagues__dispute-reason">{REASONS[g.flag_reason] ?? g.flag_reason}</div>
          </div>
          <div className="leagues__dispute-actions">
            <button className="leagues__btn leagues__btn--validate" onClick={() => verdict(g.id, 'validate')}>
              ✓ Homologuer
            </button>
            <button className="leagues__btn leagues__btn--delete" onClick={() => verdict(g.id, 'void')}>
              ✗ Annuler le match
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

// L'Effet IKEA (Epic 3.2): identité → visuel → confidentialité.
function CreateWizard({ onSave, onCancel }) {
  const [step, setStep] = useState(1);
  const [name, setName] = useState('');
  const [motto, setMotto] = useState('');
  const [icon, setIcon] = useState(LEAGUE_ICONS[0].id);
  const [privacy, setPrivacy] = useState('PRIVATE_CODE');

  function submit(e) {
    e.preventDefault();
    if (step < 3) { setStep(step + 1); return; }
    onSave({ name: name.trim(), motto: motto.trim() || null, icon, privacy_level: privacy });
  }

  return (
    <div className="leagues__overlay" onClick={onCancel}>
      <form className="leagues__form" onClick={e => e.stopPropagation()} onSubmit={submit}>
        <h2 className="leagues__form-title">Nouvelle ligue <span className="leagues__step">({step}/3)</span></h2>

        {step === 1 && (
          <>
            <label className="leagues__label">Nom de la ligue</label>
            <input
              className="leagues__input"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Ex: Ligue du Bureau"
              maxLength={40}
              autoFocus
            />
            <label className="leagues__label">Devise (optionnelle)</label>
            <input
              className="leagues__input"
              value={motto}
              onChange={e => setMotto(e.target.value)}
              placeholder="Ex: La cave des rois"
              maxLength={80}
            />
          </>
        )}

        {step === 2 && (
          <>
            <label className="leagues__label">Choisis ton blason</label>
            <div className="leagues__icon-grid">
              {LEAGUE_ICONS.map(i => (
                <button
                  key={i.id}
                  type="button"
                  className={`leagues__icon-cell${icon === i.id ? ' leagues__icon-cell--on' : ''}`}
                  onClick={() => setIcon(i.id)}
                >
                  {i.glyph}
                </button>
              ))}
            </div>
          </>
        )}

        {step === 3 && (
          <>
            <label className="leagues__label">Confidentialité</label>
            {Object.entries(PRIVACY_LABELS).map(([value, { label, desc }]) => (
              <label key={value} className={`leagues__privacy${privacy === value ? ' leagues__privacy--on' : ''}`}>
                <input
                  type="radio"
                  name="privacy"
                  value={value}
                  checked={privacy === value}
                  onChange={() => setPrivacy(value)}
                />
                <span><strong>{label}</strong><br /><small>{desc}</small></span>
              </label>
            ))}
          </>
        )}

        <div className="leagues__form-actions">
          <button
            type="button"
            className="leagues__btn"
            onClick={step === 1 ? onCancel : () => setStep(step - 1)}
          >
            {step === 1 ? 'Annuler' : 'Retour'}
          </button>
          <button type="submit" className="leagues__btn leagues__btn--primary" disabled={!name.trim()}>
            {step < 3 ? 'Suivant' : 'Créer ma ligue'}
          </button>
        </div>
      </form>
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
