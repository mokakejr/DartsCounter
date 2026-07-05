import { useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { apiGet, apiPost } from '../api/client.js';
import './RemoteLobby.css';

/**
 * Sas d'essai de tournoi (Hub v2 / Epic 2.5) : confirme l'identité, rappelle
 * la règle, et consomme le ticket AU LANCEMENT — un abandon ou un crash ne
 * le rend pas (le score partiel vaut zéro, c'est la règle).
 */
export default function TournamentAttempt() {
  const { tournamentId } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [tournament, setTournament] = useState(null);
  const [name, setName] = useState(params.get('name') ?? '');
  const [error, setError] = useState(null);
  const [launching, setLaunching] = useState(false);

  useEffect(() => {
    apiGet(`/tournaments/${tournamentId}`)
      .then(setTournament)
      .catch(() => setError('Tournoi introuvable.'));
  }, [tournamentId]);

  const me = tournament?.entries?.find(e => e.name === name.trim());
  const ticketsLeft = me ? me.tickets_left : (tournament?.max_tickets ?? 0);

  async function launch() {
    setError(null);
    setLaunching(true);
    try {
      await apiPost(`/tournaments/${tournamentId}/attempts`, { name: name.trim() });
      navigate('/51', {
        state: {
          mode: 'fiftyOne',
          players: [name.trim()],
          isCasual: true, // hors ELO — c'est un score-attack, pas un duel
          tournament: { id: tournamentId, player: name.trim(), title: tournament.title },
        },
        replace: true,
      });
    } catch (err) {
      setError(/409/.test(err?.message ?? '')
        ? 'Plus de tickets (ou tournoi non ouvert).'
        : "Impossible de lancer l'essai — le joueur existe-t-il ?");
      setLaunching(false);
    }
  }

  if (error && !tournament) {
    return (
      <div className="lobby lobby--center">
        <p>{error}</p>
        <button className="lobby__btn" onClick={() => navigate('/')}>← Accueil</button>
      </div>
    );
  }
  if (!tournament) return <div className="lobby lobby--center"><p>Ouverture…</p></div>;

  return (
    <div className="lobby">
      <h1 className="lobby__title">🏆 {tournament.title}</h1>
      <p className="lobby__sub">
        Sprint 51 : finis un 51 avec le <b>moins de fléchettes possible</b>.
        Seul ton meilleur essai compte. Le ticket est consommé dès le
        lancement — abandon ou crash ne le rendent pas.
      </p>

      <div className="lobby__players">
        <div className="lobby__player">
          <span>Tickets restants</span>
          <span>🎟️ {ticketsLeft} / {tournament.max_tickets}</span>
        </div>
        {me?.best_value != null && (
          <div className="lobby__player">
            <span>Ton meilleur</span>
            <span>{me.best_value} fléchettes</span>
          </div>
        )}
      </div>

      <label className="lobby__question" htmlFor="attempt-name">Qui lance ?</label>
      <input
        id="attempt-name"
        className="watch__input"
        style={{ position: 'static' }}
        value={name}
        maxLength={20}
        placeholder="Ton nom de joueur"
        onChange={e => setName(e.target.value)}
      />

      {error && <p className="lobby__sub" style={{ color: '#f44336' }}>{error}</p>}

      <button
        className="lobby__btn lobby__btn--primary"
        disabled={!name.trim() || launching || tournament.phase !== 'live' || ticketsLeft <= 0}
        onClick={launch}
      >
        {tournament.phase !== 'live'
          ? 'Tournoi non ouvert'
          : ticketsLeft <= 0
            ? 'Plus de tickets'
            : `LANCER L'ESSAI (1 🎟️)`}
      </button>
    </div>
  );
}
