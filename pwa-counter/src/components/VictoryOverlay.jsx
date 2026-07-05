import { useEffect, useState } from 'react';
import confetti from 'canvas-confetti';
import { apiGet } from '../api/client.js';
import { vibrate, reduced } from '../juice.js';
import './VictoryOverlay.css';

/**
 * Séquence viscérale de victoire (Epic 8.3) — state machine à 3 niveaux,
 * jouée par-dessus le podium de fin de partie :
 *  1. standard      : flash blanc 200ms + vibrate(400)            (~1s)
 *  2. win streak >3 : + hit-stop 500ms et zoom sur le vainqueur   (~2.5s)
 *  3. détrônement   : + confettis, shatter du perdant, punchline  (~4s)
 * En mode performance (reduce_animations), tout est court-circuité (8.4).
 *
 * La barre de Ferveur se remplit TOUJOURS à la fin, même si l'ELO a baissé
 * pour les autres — on quitte sur une note positive (Epic 7.3).
 */
export default function VictoryOverlay({ winner, losers = [], dartsThrown = 0 }) {
  const [level, setLevel] = useState(null); // null = en cours de calcul
  const [step, setStep] = useState('flash'); // 'flash' | 'zoom' | 'ferveur' | 'done'
  const xp = 50 + 30 + dartsThrown * 2;

  // Niveau de la séquence: streak du vainqueur + détrônement du champion.
  useEffect(() => {
    let cancelled = false;
    if (reduced() || !winner) { setLevel(0); return; }
    (async () => {
      let lvl = 1;
      try {
        const [games, board] = await Promise.all([
          apiGet('/games', { limit: 50 }),
          apiGet('/stats/leaderboard'),
        ]);
        let streak = 0;
        for (const g of games) { // /games est trié du plus récent au plus ancien
          if (!(g.players ?? []).some(p => p.name === winner)) continue;
          if (g.winner === winner) streak += 1;
          else break;
        }
        if (streak > 3) lvl = 2;
        const champion = board[0]?.name;
        if (champion && losers.includes(champion)) lvl = 3; // COUP D'ÉTAT
      } catch { /* réseau HS: séquence standard */ }
      if (!cancelled) setLevel(lvl);
    })();
    return () => { cancelled = true; };
  }, [winner, losers]);

  // Déroulé de la state machine.
  useEffect(() => {
    if (level === null) return;
    if (level === 0) { setStep('done'); return; }
    vibrate(400);
    const timers = [];
    if (level === 3) {
      confetti({ particleCount: 160, spread: 75, origin: { y: 0.6 } });
      timers.push(setTimeout(() => confetti({ particleCount: 90, angle: 120, origin: { x: 1, y: 0.4 } }), 500));
    }
    const zoomMs = level >= 2 ? (level === 3 ? 2200 : 1300) : 500;
    timers.push(setTimeout(() => setStep('zoom'), 200));           // flash 200ms
    timers.push(setTimeout(() => setStep('ferveur'), 200 + zoomMs));
    timers.push(setTimeout(() => setStep('done'), 200 + zoomMs + 1600));
    return () => timers.forEach(clearTimeout);
  }, [level]);

  if (level === null || level === 0 || step === 'done') return null;

  return (
    <div className={`victory victory--l${level}`}>
      {step === 'flash' && <div className="victory__flash" />}

      {step === 'zoom' && (
        <div className={`victory__stage${level >= 2 ? ' victory__stage--hitstop' : ''}`}>
          <span className={`victory__winner${level >= 2 ? ' victory__winner--zoom' : ''}`}>
            {winner}
          </span>
          {level === 3 && (
            <>
              <span className="victory__shatter">{losers[0]}</span>
              <span className="victory__taunt">LE TRÔNE A UN NOUVEAU MAÎTRE.</span>
            </>
          )}
          {level === 2 && <span className="victory__taunt">INARRÊTABLE. 🔥</span>}
        </div>
      )}

      {step === 'ferveur' && (
        <div className="victory__ferveur">
          <span className="victory__ferveur-label">FERVEUR</span>
          <span className="victory__ferveur-bar">
            <span className="victory__ferveur-fill" />
          </span>
          <span className="victory__ferveur-xp">+{xp} XP</span>
        </div>
      )}
    </div>
  );
}
