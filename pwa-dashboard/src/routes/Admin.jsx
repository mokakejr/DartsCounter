import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../lib/useAuth.jsx';
import {
  adminCreateSeason, adminDeleteGame, adminListPlayers,
  adminListSeasons, adminListWebhooks, adminLogs,
  adminRecomputeElo, adminRecomputeTrophies,
  adminResetPassword, adminSetRole,
  adminTestWebhook, adminToggleWebhook,
} from '../api/admin.js';
import { apiGet } from '../api/client.js';
import ConfirmModal from '../components/ConfirmModal.jsx';
import './Admin.css';

const TABS = ['Jeux', 'Joueurs', 'ELO & Trophées', 'Webhooks', 'Saisons'];

export default function Admin() {
  const { player, token, ready } = useAuth();
  const [tab, setTab] = useState(0);

  if (!ready) return null;
  if (!player) return <Navigate to="/login" replace />;
  if (!player.is_admin) return <Navigate to="/" replace />;

  return (
    <div className="admin shell">
      <h1 className="admin__title display">Admin</h1>
      <div className="admin__tabs" role="tablist">
        {TABS.map((t, i) => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === i}
            className={`admin__tab ${tab === i ? 'admin__tab--active' : ''}`}
            onClick={() => setTab(i)}
          >
            {t}
          </button>
        ))}
      </div>
      <div className="admin__panel">
        {tab === 0 && <GamesTab token={token} />}
        {tab === 1 && <PlayersTab token={token} />}
        {tab === 2 && <EloTrophiesTab token={token} />}
        {tab === 3 && <WebhooksTab token={token} />}
        {tab === 4 && <SeasonsTab token={token} />}
      </div>
      <AuditLog token={token} />
    </div>
  );
}

// ─── Games tab ───────────────────────────────────────────────────────────────

function GamesTab({ token }) {
  const [games, setGames] = useState([]);
  const [loading, setLoading] = useState(true);
  const [confirm, setConfirm] = useState(null); // { id, mode, date }
  const [status, setStatus] = useState(null);

  useEffect(() => {
    apiGet('/games', { limit: 50 }).then(setGames).catch(() => {}).finally(() => setLoading(false));
  }, []);

  async function doDelete() {
    const { id, mode } = confirm;
    setConfirm(null);
    setStatus({ type: 'loading', msg: `Suppression de la partie ${mode}…` });
    try {
      await adminDeleteGame(token, id);
      setGames(g => g.filter(x => x.id !== id));
      setStatus({ type: 'ok', msg: 'Partie supprimée et ELO recalculé.' });
    } catch (e) {
      setStatus({ type: 'err', msg: e.detail || 'Erreur lors de la suppression.' });
    }
  }

  return (
    <section>
      <p className="admin__hint">Supprimez une partie erronée. L'ELO sera automatiquement recalculé après la suppression.</p>
      {status && <StatusBar {...status} onDismiss={() => setStatus(null)} />}
      {loading ? <Spinner /> : (
        <ul className="admin__list">
          {games.map(g => (
            <li key={g.id} className="admin__row">
              <span className="admin__row-label">
                <strong>{g.mode}</strong>
                {g.variant ? ` · ${g.variant}` : ''}
                <span className="admin__row-meta">{new Date(g.date).toLocaleString('fr-FR')} · {g.winner ?? '—'}</span>
              </span>
              <button
                className="admin__btn admin__btn--danger"
                onClick={() => setConfirm({ id: g.id, mode: g.mode, date: g.date })}
              >
                Supprimer
              </button>
            </li>
          ))}
        </ul>
      )}
      <ConfirmModal
        open={!!confirm}
        title="Supprimer cette partie ?"
        message={confirm ? `${confirm.mode} — ${new Date(confirm.date).toLocaleString('fr-FR')}. L'ELO sera recalculé pour tous les joueurs concernés. Cette action est irréversible.` : ''}
        confirmLabel="Supprimer"
        danger
        onConfirm={doDelete}
        onCancel={() => setConfirm(null)}
      />
    </section>
  );
}

// ─── Players tab ─────────────────────────────────────────────────────────────

function PlayersTab({ token }) {
  const { player: me } = useAuth();
  const [players, setPlayers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pwReset, setPwReset] = useState(null); // { id, name }
  const [newPw, setNewPw] = useState('');
  const [roleConfirm, setRoleConfirm] = useState(null); // { id, name, isAdmin }
  const [status, setStatus] = useState(null);

  useEffect(() => {
    adminListPlayers(token).then(setPlayers).catch(() => {}).finally(() => setLoading(false));
  }, [token]);

  async function doResetPw() {
    if (!newPw.trim()) return;
    const { id, name } = pwReset;
    setPwReset(null);
    setStatus({ type: 'loading', msg: `Réinitialisation du mot de passe de ${name}…` });
    try {
      await adminResetPassword(token, id, newPw.trim());
      setNewPw('');
      setStatus({ type: 'ok', msg: `Mot de passe de ${name} réinitialisé.` });
    } catch (e) {
      setStatus({ type: 'err', msg: e.detail || 'Erreur.' });
    }
  }

  async function doToggleRole() {
    const { id, name, isAdmin } = roleConfirm;
    setRoleConfirm(null);
    try {
      await adminSetRole(token, id, !isAdmin);
      setPlayers(ps => ps.map(p => p.id === id ? { ...p, is_admin: !isAdmin } : p));
      setStatus({ type: 'ok', msg: `${name} est ${!isAdmin ? 'maintenant admin' : 'n\'est plus admin'}.` });
    } catch (e) {
      setStatus({ type: 'err', msg: e.detail || 'Erreur.' });
    }
  }

  return (
    <section>
      <p className="admin__hint">Réinitialisez un mot de passe ou modifiez le rôle admin d'un joueur.</p>
      {status && <StatusBar {...status} onDismiss={() => setStatus(null)} />}
      {loading ? <Spinner /> : (
        <ul className="admin__list">
          {players.map(p => (
            <li key={p.id} className="admin__row">
              <span className="admin__row-label">
                <strong>{p.display_name || p.name}</strong>
                {p.display_name && <span className="admin__row-meta">@{p.name}</span>}
                <span className="admin__row-meta">{p.has_account ? '🔑 compte' : '👤 anonyme'}{p.is_admin ? ' · 🛡 admin' : ''}</span>
              </span>
              <div className="admin__row-actions">
                {p.has_account && (
                  <button className="admin__btn" onClick={() => { setPwReset({ id: p.id, name: p.display_name || p.name }); setNewPw(''); }}>
                    Mot de passe
                  </button>
                )}
                {p.id !== me?.id && (
                  <button
                    className={`admin__btn ${p.is_admin ? 'admin__btn--danger' : ''}`}
                    onClick={() => setRoleConfirm({ id: p.id, name: p.display_name || p.name, isAdmin: p.is_admin })}
                  >
                    {p.is_admin ? 'Retirer admin' : 'Passer admin'}
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {/* Password reset inline form */}
      {pwReset && (
        <div className="admin__inline-form">
          <p>Nouveau mot de passe pour <strong>{pwReset.name}</strong> :</p>
          <div className="admin__inline-form-row">
            <input
              className="admin__input"
              type="password"
              value={newPw}
              onChange={e => setNewPw(e.target.value)}
              placeholder="Nouveau mot de passe"
              onKeyDown={e => e.key === 'Enter' && doResetPw()}
              autoFocus
            />
            <button className="admin__btn admin__btn--danger" onClick={doResetPw} disabled={!newPw.trim()}>
              Valider
            </button>
            <button className="admin__btn" onClick={() => setPwReset(null)}>Annuler</button>
          </div>
        </div>
      )}

      <ConfirmModal
        open={!!roleConfirm}
        title={roleConfirm?.isAdmin ? `Retirer les droits admin de ${roleConfirm?.name} ?` : `Passer ${roleConfirm?.name} admin ?`}
        message={roleConfirm?.isAdmin ? 'Ce joueur perdra l\'accès à la vue admin.' : 'Ce joueur pourra accéder à toutes les fonctions admin.'}
        confirmLabel={roleConfirm?.isAdmin ? 'Retirer admin' : 'Passer admin'}
        danger={roleConfirm?.isAdmin}
        onConfirm={doToggleRole}
        onCancel={() => setRoleConfirm(null)}
      />
    </section>
  );
}

// ─── ELO & Trophies tab ──────────────────────────────────────────────────────

function EloTrophiesTab({ token }) {
  const [eloResult, setEloResult] = useState(null);
  const [trophyResult, setTrophyResult] = useState(null);
  const [eloLoading, setEloLoading] = useState(false);
  const [trophyLoading, setTrophyLoading] = useState(false);
  const [confirm, setConfirm] = useState(null); // 'elo' | 'trophies'

  async function doRecompute(type) {
    setConfirm(null);
    if (type === 'elo') {
      setEloLoading(true);
      try {
        const res = await adminRecomputeElo(token);
        setEloResult({ ok: true, msg: `ELO recalculé pour ${res.players_updated} joueurs.` });
      } catch (e) {
        setEloResult({ ok: false, msg: e.detail || 'Erreur lors du recalcul ELO.' });
      }
      setEloLoading(false);
    } else {
      setTrophyLoading(true);
      try {
        const res = await adminRecomputeTrophies(token);
        setTrophyResult({ ok: true, msg: `${res.total_unlocked} trophées débloqués en tout.` });
      } catch (e) {
        setTrophyResult({ ok: false, msg: e.detail || 'Erreur lors du recalcul des trophées.' });
      }
      setTrophyLoading(false);
    }
  }

  return (
    <section className="admin__cards">
      <div className="admin__card">
        <h3 className="admin__card-title">Recalcul ELO</h3>
        <p className="admin__card-desc">Repart de zéro en rejouant toutes les parties dans l'ordre chronologique. À utiliser après une correction de données.</p>
        {eloResult && (
          <p className={`admin__card-result ${eloResult.ok ? 'admin__card-result--ok' : 'admin__card-result--err'}`}>
            {eloResult.msg}
          </p>
        )}
        <button
          className="admin__btn admin__btn--primary"
          onClick={() => setConfirm('elo')}
          disabled={eloLoading}
        >
          {eloLoading ? 'Calcul…' : '⚡ Recalculer l\'ELO'}
        </button>
      </div>

      <div className="admin__card">
        <h3 className="admin__card-title">Recalcul des trophées</h3>
        <p className="admin__card-desc">Recalcule l'état actuel de tous les trophées à partir de l'historique de parties. Utile après une correction.</p>
        {trophyResult && (
          <p className={`admin__card-result ${trophyResult.ok ? 'admin__card-result--ok' : 'admin__card-result--err'}`}>
            {trophyResult.msg}
          </p>
        )}
        <button
          className="admin__btn admin__btn--primary"
          onClick={() => setConfirm('trophies')}
          disabled={trophyLoading}
        >
          {trophyLoading ? 'Calcul…' : '🏆 Recalculer les trophées'}
        </button>
      </div>

      <ConfirmModal
        open={!!confirm}
        title={confirm === 'elo' ? 'Recalculer tout l\'ELO ?' : 'Recalculer tous les trophées ?'}
        message={confirm === 'elo'
          ? 'L\'historique ELO complet sera effacé et reconstruit depuis les données de partie. L\'opération peut prendre quelques secondes.'
          : 'L\'état des trophées sera recalculé sur toutes les parties existantes.'}
        confirmLabel="Confirmer"
        onConfirm={() => doRecompute(confirm)}
        onCancel={() => setConfirm(null)}
      />
    </section>
  );
}

// ─── Webhooks tab ─────────────────────────────────────────────────────────────

function WebhooksTab({ token }) {
  const [webhooks, setWebhooks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState(null);

  useEffect(() => {
    adminListWebhooks(token).then(setWebhooks).catch(() => {}).finally(() => setLoading(false));
  }, [token]);

  async function toggle(wh) {
    try {
      const updated = await adminToggleWebhook(token, wh.id);
      setWebhooks(ws => ws.map(w => w.id === wh.id ? updated : w));
      setStatus({ type: 'ok', msg: `${wh.target} ${updated.enabled ? 'activé' : 'désactivé'}.` });
    } catch (e) {
      setStatus({ type: 'err', msg: e.detail || 'Erreur.' });
    }
  }

  async function test(wh) {
    setStatus({ type: 'loading', msg: `Test ${wh.target}…` });
    try {
      await adminTestWebhook(token, wh.id);
      setStatus({ type: 'ok', msg: `Notification test envoyée à ${wh.target}.` });
    } catch (e) {
      setStatus({ type: 'err', msg: e.detail || `Échec du test pour ${wh.target}.` });
    }
  }

  return (
    <section>
      <p className="admin__hint">Activez/désactivez les webhooks et testez-les sans créer de partie.</p>
      {status && <StatusBar {...status} onDismiss={() => setStatus(null)} />}
      {loading ? <Spinner /> : webhooks.length === 0 ? (
        <p className="admin__empty">Aucun webhook configuré. Utilisez POST /webhooks pour en créer un.</p>
      ) : (
        <ul className="admin__list">
          {webhooks.map(wh => (
            <li key={wh.id} className="admin__row">
              <span className="admin__row-label">
                <strong>{wh.target}</strong>
                <span className="admin__row-meta admin__row-meta--mono">{wh.url}</span>
                <span className={`admin__badge ${wh.enabled ? 'admin__badge--on' : 'admin__badge--off'}`}>
                  {wh.enabled ? 'actif' : 'inactif'}
                </span>
              </span>
              <div className="admin__row-actions">
                <button className="admin__btn" onClick={() => test(wh)}>Test</button>
                <button
                  className={`admin__btn ${wh.enabled ? 'admin__btn--danger' : ''}`}
                  onClick={() => toggle(wh)}
                >
                  {wh.enabled ? 'Désactiver' : 'Activer'}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// ─── Seasons tab ──────────────────────────────────────────────────────────────

function SeasonsTab({ token }) {
  const [seasons, setSeasons] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState('');
  const [newStart, setNewStart] = useState('');
  const [confirm, setConfirm] = useState(false);
  const [status, setStatus] = useState(null);

  useEffect(() => {
    adminListSeasons(token).then(setSeasons).catch(() => {}).finally(() => setLoading(false));
  }, [token]);

  async function doCreate() {
    setConfirm(false);
    setStatus({ type: 'loading', msg: 'Création de la saison…' });
    try {
      const s = await adminCreateSeason(token, newName.trim(), newStart || null);
      setSeasons(prev => [s, ...prev.map(x => x.is_active ? { ...x, is_active: false } : x)]);
      setNewName('');
      setNewStart('');
      setStatus({ type: 'ok', msg: `Saison « ${s.name} » créée et activée.` });
    } catch (e) {
      setStatus({ type: 'err', msg: e.detail || 'Erreur lors de la création.' });
    }
  }

  const activeSeason = seasons.find(s => s.is_active);

  return (
    <section>
      <p className="admin__hint">Démarrez une nouvelle saison — l'ancienne sera automatiquement fermée.</p>
      {status && <StatusBar {...status} onDismiss={() => setStatus(null)} />}

      <div className="admin__form">
        <h3 className="admin__form-title">Nouvelle saison</h3>
        <div className="admin__form-row">
          <input
            className="admin__input"
            placeholder="Nom de la saison (ex: Saison 3)"
            value={newName}
            onChange={e => setNewName(e.target.value)}
          />
          <input
            className="admin__input admin__input--date"
            type="date"
            value={newStart}
            onChange={e => setNewStart(e.target.value)}
            title="Date de début (optionnel, aujourd'hui par défaut)"
          />
          <button
            className="admin__btn admin__btn--primary"
            disabled={!newName.trim()}
            onClick={() => setConfirm(true)}
          >
            Créer
          </button>
        </div>
      </div>

      {loading ? <Spinner /> : (
        <ul className="admin__list">
          {seasons.map(s => (
            <li key={s.id} className="admin__row">
              <span className="admin__row-label">
                <strong>{s.name}</strong>
                {s.is_active && <span className="admin__badge admin__badge--on">active</span>}
                <span className="admin__row-meta">
                  {s.start_date ?? '—'} → {s.end_date ?? 'en cours'}
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}

      <ConfirmModal
        open={confirm}
        title={`Créer la saison « ${newName} » ?`}
        message={activeSeason
          ? `La saison en cours « ${activeSeason.name} » sera automatiquement clôturée aujourd'hui.`
          : 'Aucune saison active — la nouvelle saison démarrera immédiatement.'}
        confirmLabel="Créer"
        onConfirm={doCreate}
        onCancel={() => setConfirm(false)}
      />
    </section>
  );
}

// ─── Audit log ────────────────────────────────────────────────────────────────

function AuditLog({ token }) {
  const [logs, setLogs] = useState([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (open) adminLogs(token, 50).then(setLogs).catch(() => {});
  }, [open, token]);

  return (
    <div className="admin__audit">
      <button className="admin__audit-toggle" onClick={() => setOpen(o => !o)}>
        {open ? '▲ Masquer le journal d\'audit' : '▼ Journal d\'audit (50 dernières actions)'}
      </button>
      {open && (
        <ul className="admin__log-list">
          {logs.length === 0 ? (
            <li className="admin__empty">Aucune action enregistrée.</li>
          ) : logs.map(l => (
            <li key={l.id} className="admin__log-row">
              <span className="admin__log-action">{l.action}</span>
              {l.entity_type && <span className="admin__log-entity">{l.entity_type}{l.entity_id ? ` ${l.entity_id.slice(0, 8)}…` : ''}</span>}
              <span className="admin__log-who">{l.admin_name ?? '—'}</span>
              <span className="admin__log-date">{new Date(l.created_at).toLocaleString('fr-FR')}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ─── Shared primitives ────────────────────────────────────────────────────────

function Spinner() {
  return <div className="admin__spinner" />;
}

function StatusBar({ type, msg, onDismiss }) {
  return (
    <div className={`admin__status admin__status--${type}`} onClick={onDismiss}>
      {msg}
      <span className="admin__status-close">×</span>
    </div>
  );
}
