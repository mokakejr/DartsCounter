import { useEffect, useState } from 'react';
import { apiGet } from '../api/client.js';
import { useAuth } from '../lib/useAuth.jsx';
import { displayName } from '../lib/profiles.js';
import './VersusBlock.css';

/**
 * « Toi vs X » (Hub v2) : sur le profil d'un joueur, mon face-à-face direct
 * avec lui — ratio de duels + qui porte la meilleure série de victoires.
 * Preuve sociale + ego = défis spontanés.
 */
export default function VersusBlock({ name, stats, profiles = {} }) {
  const auth = useAuth();
  const [pair, setPair] = useState(null);
  const myName = auth.player?.name;

  useEffect(() => {
    if (!myName || myName === name) { setPair(null); return; }
    let cancelled = false;
    apiGet('/stats/head-to-head', { players: `${myName},${name}` })
      .then(rows => { if (!cancelled) setPair(rows[0] ?? null); })
      .catch(() => { if (!cancelled) setPair(null); });
    return () => { cancelled = true; };
  }, [myName, name]);

  if (!myName || myName === name || !pair) return null;

  const myWins = pair.a === myName ? pair.a_wins : pair.b_wins;
  const theirWins = pair.a === myName ? pair.b_wins : pair.a_wins;
  const total = myWins + theirWins;
  const myStreak = stats?.[myName]?.curStreak ?? 0;
  const theirStreak = stats?.[name]?.curStreak ?? 0;
  const proba = Math.round((pair.a === myName ? pair.a_win_probability : 1 - pair.a_win_probability) * 100);
  const pct = total ? Math.round((myWins / total) * 100) : 50;

  return (
    <section className="versus">
      <p className="eyebrow">Toi vs {displayName(profiles, name)}</p>
      <div className="versus__score">
        <span className={myWins >= theirWins ? 'versus__side versus__side--up' : 'versus__side'}>
          <b>{myWins}</b> toi
        </span>
        <span className="versus__vs">—</span>
        <span className={theirWins > myWins ? 'versus__side versus__side--up' : 'versus__side'}>
          <b>{theirWins}</b> {displayName(profiles, name)}
        </span>
      </div>
      <div className="versus__bar">
        <span style={{ width: `${pct}%` }} />
      </div>
      <div className="versus__facts">
        <span>
          {total === 0
            ? 'Aucun duel direct — il est temps.'
            : myWins > theirWins
              ? `Tu mènes ${myWins}–${theirWins}`
              : myWins < theirWins
                ? `Tu es mené ${myWins}–${theirWins}`
                : `Égalité parfaite ${myWins}–${theirWins}`}
        </span>
        <span>Ta proba de victoire : <b>{proba}%</b></span>
        {(myStreak >= 2 || theirStreak >= 2) && (
          <span>
            🔥 Série en cours : {myStreak >= theirStreak
              ? `toi (${myStreak})`
              : `${displayName(profiles, name)} (${theirStreak})`}
          </span>
        )}
      </div>
    </section>
  );
}
