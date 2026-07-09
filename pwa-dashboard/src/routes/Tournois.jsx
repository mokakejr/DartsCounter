import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../lib/useAuth.jsx';
import { useLeague } from '../lib/useLeague.jsx';
import { displayName } from '../lib/profiles.js';
import { createTournament, enterTournament, fetchSeason, fetchTournaments } from '../api/tournaments.js';
import './Tournois.css';

const COUNTER_URL = import.meta.env.VITE_COUNTER_URL || 'http://localhost:5174';
const POLL_MS = 15_000;

function countdown(to) {
  const ms = new Date(to) - Date.now();
  if (ms <= 0) return 'imminent';
  const d = Math.floor(ms / 86_400_000);
  const h = Math.floor((ms % 86_400_000) / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  return d > 0 ? `${d}j ${h}h` : h > 0 ? `${h}h ${m}min` : `${m}min`;
}

/**
 * Onglet Tournois du Hub (Epic 2.5) : score-attack asynchrone à tickets.
 * Trois états temporels : anticipation (compte à rebours + inscription),
 * urgence (LIVE + leaderboard qui bouge), prestige (podium des archives).
 */
export default function Tournois({ profiles = {} }) {
  const auth = useAuth();
  const { activeLeague, leagues } = useLeague();
  const league = activeLeague ?? leagues[0] ?? null;
  const [tournaments, setTournaments] = useState(null);
  const [season, setSeason] = useState(null);
  const [creating, setCreating] = useState(false);
  const myName = auth.player?.name;

  const load = useCallback(() => {
    if (!league) return;
    fetchTournaments(league.id).then(setTournaments).catch(() => setTournaments([]));
  }, [league?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    load();
    const t = setInterval(() => { if (!document.hidden) load(); }, POLL_MS);
    return () => clearInterval(t);
  }, [load]);

  useEffect(() => {
    fetchSeason().then(setSeason).catch(() => {});
  }, []);

  if (!league) {
    return (
      <div className="tournois shell">
        <h1 className="tournois__title display">Tournois</h1>
        <p className="tournois__sub">
          Rejoins une <Link to="/ligues">ligue</Link> pour accéder à ses tournois.
        </p>
      </div>
    );
  }

  const myRole = league.members?.find(m => m.name === myName)?.role;
  const canCreate = auth.player && (league.owner_id === auth.player.id || myRole === 'admin');
  const rows = tournaments ?? [];
  const upcoming = rows.filter(t => t.phase === 'upcoming');
  const live = rows.filter(t => t.phase === 'live');
  const past = rows.filter(t => t.phase === 'past');

  return (
    <div className="tournois shell">
      <Link to="/" className="back">← La Ligue</Link>
      <h1 className="tournois__title display">Tournois — {league.name}</h1>
      {season?.active && (
        <p className="tournois__season">
          {season.name} · se termine le {new Date(season.end_date).toLocaleDateString('fr-FR')}
          {' '}(soft reset du classement à la clôture)
        </p>
      )}

      {canCreate && (
        <button className="tournois__new" onClick={() => setCreating(true)}>
          + Lancer un tournoi
        </button>
      )}

      {live.map(t => (
        <LiveTournament key={t.id} t={t} myName={myName} profiles={profiles} onChange={load} />
      ))}

      {upcoming.length > 0 && (
        <section>
          <h2 className="tournois__section">À venir</h2>
          {upcoming.map(t => (
            <div key={t.id} className="tournois__card">
              <div className="tournois__head">
                <b>🏆 {t.title}</b>
                <span className="tournois__count">⏳ départ dans {countdown(t.starts_at)}</span>
              </div>
              <p className="tournois__meta">
                {t.participants} inscrit{t.participants > 1 ? 's' : ''} · {t.max_tickets} 🎟️ par joueur
              </p>
              {myName && !t.entries.some(e => e.name === myName) && (
                <button
                  className="tournois__cta"
                  onClick={() => enterTournament(t.id, myName).then(load)}
                >
                  S'inscrire
                </button>
              )}
            </div>
          ))}
        </section>
      )}

      {past.length > 0 && (
        <section>
          <h2 className="tournois__section">Archives</h2>
          {past.map(t => (
            <div key={t.id} className="tournois__card tournois__card--past">
              <div className="tournois__head"><b>{t.title}</b></div>
              <div className="tournois__podium">
                {t.entries.filter(e => e.rank && e.rank <= 3).map(e => (
                  <span key={e.player_id} className={`tournois__medal tournois__medal--${e.rank}`}>
                    {['🥇', '🥈', '🥉'][e.rank - 1]} {displayName(profiles, e.name)}
                    <b>{e.best_value}</b>
                  </span>
                ))}
                {t.entries.every(e => e.best_value === null) && <span className="tournois__meta">Aucun essai soumis.</span>}
              </div>
            </div>
          ))}
        </section>
      )}

      {rows.length === 0 && tournaments !== null && (
        <p className="tournois__sub">Aucun tournoi pour l'instant{canCreate ? ' — lance le premier !' : '.'}</p>
      )}

      {creating && (
        <CreateForm
          league={league}
          token={auth.token}
          onDone={() => { setCreating(false); load(); }}
          onCancel={() => setCreating(false)}
        />
      )}
    </div>
  );
}

function LiveTournament({ t, myName, profiles, onChange }) {
  const me = t.entries.find(e => e.name === myName);
  const attemptUrl = `${COUNTER_URL}/essai/${t.id}?name=${encodeURIComponent(myName ?? '')}`;
  return (
    <div className="tournois__card tournois__card--live">
      <div className="tournois__head">
        <b><span className="tournois__live-badge">🔴 LIVE</span> {t.title}</b>
        <span className="tournois__count">⏳ se termine dans {countdown(t.ends_at)}</span>
      </div>

      {myName && (
        <div className="tournois__me">
          {me?.best_value != null
            ? <span>Ton meilleur : <b>{me.best_value} fléchettes</b> (rang {me.rank ?? '—'})</span>
            : <span>Pas encore d'essai soumis.</span>}
          <span>Tickets : 🎟️ {me ? me.tickets_left : t.max_tickets} / {t.max_tickets}</span>
          {(me ? me.tickets_left : t.max_tickets) > 0 ? (
            <a className="tournois__cta" href={attemptUrl}>
              Lancer un essai (1 🎟️)
            </a>
          ) : (
            <span className="tournois__meta">Plus de tickets — que le meilleur gagne.</span>
          )}
        </div>
      )}
      {!myName && (
        <p className="tournois__meta">
          <Link to="/login">Connecte-toi</Link> pour participer.
        </p>
      )}

      <ol className="tournois__board">
        {t.entries.filter(e => e.best_value != null || e.attempt_in_progress || e.tickets_used > 0).map(e => (
          <li key={e.player_id} className={e.name === myName ? 'tournois__row--me' : ''}>
            <span className="tournois__rank">{e.rank ?? '–'}</span>
            <span className="tournois__name">
              {displayName(profiles, e.name)}
              {e.attempt_in_progress && <em className="tournois__inprogress"> · essai en cours…</em>}
            </span>
            <b>{e.best_value != null ? `${e.best_value} 🎯` : '—'}</b>
          </li>
        ))}
        {t.entries.length === 0 && <li className="tournois__meta">Personne n'a encore tenté sa chance.</li>}
      </ol>
    </div>
  );
}

function CreateForm({ league, token, onDone, onCancel }) {
  const [title, setTitle] = useState('Coupe — Sprint 51');
  const [hours, setHours] = useState(48);
  const [error, setError] = useState(null);

  async function submit(e) {
    e.preventDefault();
    try {
      const now = new Date();
      await createTournament(token, {
        league_id: league.id,
        title: title.trim(),
        mode: 'FiftyOne',
        goal: 'fewest_darts',
        starts_at: now.toISOString(),
        ends_at: new Date(now.getTime() + hours * 3600 * 1000).toISOString(),
      });
      onDone();
    } catch {
      setError('Création impossible (droits owner/admin requis).');
    }
  }

  return (
    <div className="tournois__overlay" onClick={onCancel}>
      <form className="tournois__form" onClick={e => e.stopPropagation()} onSubmit={submit}>
        <h2>Nouveau tournoi</h2>
        <p className="tournois__meta">
          Épreuve : <b>Sprint 51</b> — finir un 51 avec le moins de fléchettes possible.
          3 🎟️ par joueur, seul le meilleur essai compte.
        </p>
        <label>Titre</label>
        <input value={title} onChange={e => setTitle(e.target.value)} maxLength={60} />
        <label>Durée</label>
        <select value={hours} onChange={e => setHours(Number(e.target.value))}>
          <option value={24}>24 h</option>
          <option value={48}>48 h (week-end)</option>
          <option value={72}>72 h</option>
        </select>
        {error && <p className="tournois__error">{error}</p>}
        <div className="tournois__form-actions">
          <button type="button" onClick={onCancel}>Annuler</button>
          <button type="submit" className="tournois__cta" disabled={!title.trim()}>
            Lancer maintenant
          </button>
        </div>
      </form>
    </div>
  );
}
