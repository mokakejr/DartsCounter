import { useEffect, useState } from 'react';
import { apiGet } from '../api/client.js';
import { useAuth } from '../lib/useAuth.jsx';
import { displayName } from '../lib/profiles.js';
import './NemesisWall.css';

/**
 * Le Mur des Rancunes (Epic 10.3): connecté, je vois immédiatement sur qui
 * j'ai l'ascendant (vert) et qui me domine (rouge).
 */
export default function NemesisWall({ ranked, profiles = {} }) {
  const auth = useAuth();
  const [pairs, setPairs] = useState(null);
  const myName = auth.player?.name;

  useEffect(() => {
    if (!myName) return;
    // Mes 5 adversaires les plus fréquents (hors moi).
    const opponents = ranked.filter(r => r.name !== myName).slice(0, 5).map(r => r.name);
    if (opponents.length === 0) { setPairs([]); return; }
    apiGet('/stats/head-to-head', { players: [myName, ...opponents].join(',') })
      .then(rows => setPairs(rows.filter(r => r.a === myName || r.b === myName)))
      .catch(() => setPairs([]));
  }, [myName, ranked]);

  if (!myName || !pairs) return null;
  const duels = pairs
    .map(r => {
      const other = r.a === myName ? r.b : r.a;
      const myWins = r.a === myName ? r.a_wins : r.b_wins;
      const theirWins = r.a === myName ? r.b_wins : r.a_wins;
      return { other, myWins, theirWins, total: myWins + theirWins };
    })
    .filter(d => d.total > 0)
    .sort((a, b) => b.total - a.total);

  if (duels.length === 0) return null;

  return (
    <section className="nemesis shell">
      <div className="sec-head">
        <p className="eyebrow">Mur des Rancunes</p>
        <h2 className="display sec-title">Mes némésis</h2>
      </div>
      <div className="nemesis__list">
        {duels.map(({ other, myWins, theirWins }) => {
          const leading = myWins > theirWins;
          const tied = myWins === theirWins;
          return (
            <div
              key={other}
              className={`nemesis__row ${tied ? '' : leading ? 'nemesis__row--up' : 'nemesis__row--down'}`}
            >
              <span className="nemesis__text">
                {tied
                  ? <>Égalité {myWins}–{theirWins} contre <b>{displayName(profiles, other)}</b></>
                  : leading
                    ? <>Tu mènes {myWins}–{theirWins} contre <b>{displayName(profiles, other)}</b></>
                    : <>Tu es mené {myWins}–{theirWins} contre <b>{displayName(profiles, other)}</b></>}
              </span>
              <span className="nemesis__icon">{tied ? '⚖️' : leading ? '😤' : '🎯'}</span>
            </div>
          );
        })}
      </div>
    </section>
  );
}
