import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { apiGet, apiPost } from '../api/client.js';
import { connectLive } from '../live.js';
import './RemoteLobby.css';

/**
 * Le Sas d'Attente (Epic 13.1): le créateur partage le lien, l'adversaire
 * l'ouvre, confirme qui il est, et la partie démarre quand les deux ont
 * tapé « Prêt » (MATCH_STARTED).
 */
export default function RemoteLobby() {
  const { matchId } = useParams();
  const { state } = useLocation();
  const navigate = useNavigate();
  const [match, setMatch] = useState(null);
  const [me, setMe] = useState(state?.me ?? null);
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(false);
  const connRef = useRef(null);

  const shareUrl = `${window.location.origin}/lobby/${matchId}`;

  useEffect(() => {
    apiGet(`/live/matches/${matchId}`)
      .then(setMatch)
      .catch(() => setError('Match introuvable ou expiré.'));
  }, [matchId]);

  // Connexion joueur dès que l'identité est choisie — reçoit READY des
  // autres et MATCH_STARTED (le handover vers l'écran de jeu).
  useEffect(() => {
    if (!me || !match) return undefined;
    const conn = connectLive(matchId, {
      role: 'player',
      name: me,
      onClose(code) {
        if (code === 4404) setError('Match introuvable ou expiré.');
      },
      onEvent(e) {
        if (e.event === 'READY') {
          setMatch(m => m && { ...m, ready: [...new Set([...(m.ready ?? []), e.player_id])] });
        }
        if (e.event === 'MATCH_STARTED' || (e.event === 'STATE' && e.match?.started)) {
          navigate('/51', {
            state: {
              mode: 'fiftyOne',
              players: match.players,
              isCasual: false,
              liveId: matchId,
              remote: true,
              me,
            },
            replace: true,
          });
        }
      },
    });
    connRef.current = conn;
    return () => { conn.close(); connRef.current = null; };
  }, [me, match?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function ready() {
    try {
      const updated = await apiPost(`/live/matches/${matchId}/ready`, { name: me });
      setMatch(updated);
    } catch {
      setError('Impossible de se déclarer prêt, réessaie.');
    }
  }

  async function share() {
    try {
      if (navigator.share) {
        await navigator.share({ title: 'Duel de fléchettes', text: 'Rejoins mon match !', url: shareUrl });
        return;
      }
    } catch { /* partage annulé */ }
    navigator.clipboard?.writeText(shareUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  if (error) {
    return (
      <div className="lobby lobby--center">
        <p>{error}</p>
        <button className="lobby__btn" onClick={() => navigate('/')}>← Accueil</button>
      </div>
    );
  }
  if (!match) return <div className="lobby lobby--center"><p>Ouverture du sas…</p></div>;

  const readySet = new Set(match.ready ?? []);

  return (
    <div className="lobby">
      <h1 className="lobby__title">MATCH À DISTANCE</h1>
      <p className="lobby__sub">{match.mode} — la partie démarre quand les deux joueurs sont prêts.</p>

      {!me ? (
        <>
          <p className="lobby__question">Qui es-tu ?</p>
          <div className="lobby__players">
            {match.players.map(p => {
              const taken = (match.connected ?? []).includes(p);
              return (
                <button
                  key={p}
                  className="lobby__btn lobby__btn--pick"
                  disabled={taken}
                  onClick={() => setMe(p)}
                >
                  {p}, c'est moi{taken ? ' (déjà connecté)' : ''}
                </button>
              );
            })}
          </div>
        </>
      ) : (
        <>
          <div className="lobby__players">
            {match.players.map(p => (
              <div key={p} className={`lobby__player${readySet.has(p) ? ' lobby__player--ready' : ''}`}>
                <span>{p}{p === me ? ' (toi)' : ''}</span>
                <span>{readySet.has(p) ? '✓ Prêt' : '… en attente'}</span>
              </div>
            ))}
          </div>

          {!readySet.has(me) && (
            <button className="lobby__btn lobby__btn--primary" onClick={ready}>
              JE SUIS PRÊT
            </button>
          )}

          <div className="lobby__share">
            <p className="lobby__share-label">Ton adversaire n'est pas là ?</p>
            <button className="lobby__btn" onClick={share}>
              {copied ? 'Lien copié !' : '🔗 Partager le lien du match'}
            </button>
            <code className="lobby__url">{shareUrl}</code>
          </div>
        </>
      )}
    </div>
  );
}
