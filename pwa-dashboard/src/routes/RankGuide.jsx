import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchEloSettings } from '../api/elo.js';
import { rankTierBoundaries, kSchedule } from '../lib/ranks.js';
import RankBadge from '../components/RankBadge.jsx';
import './RankGuide.css';

function fmtBound(v) {
  if (v === -Infinity) return '0';
  if (v === Infinity) return '∞';
  return Math.round(v);
}

export default function RankGuide() {
  const [settings, setSettings] = useState(null);

  useEffect(() => {
    fetchEloSettings().then(setSettings).catch(() => {});
  }, []);

  return (
    <div className="rg shell">
      <Link to="/" className="back">← La Ligue</Link>
      <h1 className="display rg__title">Le classement Elo</h1>
      <p className="rg__sub">Comment chaque partie change ta cote, et comment grimper les paliers.</p>

      <h2 className="rg__h2 eyebrow">Les paliers</h2>
      {!settings && <p className="rg__muted">Chargement…</p>}
      {settings && (
        <ol className="rg__ladder">
          {rankTierBoundaries(settings).reverse().map(([name, lo, hi]) => (
            <li key={name} className="rg__tier">
              <RankBadge rank={name} size="sm" />
              <span className="rg__tier-range">{fmtBound(lo)} – {fmtBound(hi)}</span>
            </li>
          ))}
        </ol>
      )}

      <h2 className="rg__h2 eyebrow">Comment ça marche</h2>
      <div className="rg__prose">
        <p>
          Chaque partie est décomposée en un face-à-face entre <b>chaque paire de joueurs</b>.
          À 3 joueurs, ça fait 3 duels : le 1er bat le 2e et le 3e, le 2e bat le 3e mais perd
          contre le 1er, le 3e perd les deux. Chaque duel suit la formule Elo classique — celui
          qui était « censé » perdre gagne plus de points que celui qui était favori.
        </p>
        <p>
          Le score de chaque duel est ensuite multiplié par un <b>facteur de performance</b> :
          ton score sur cette partie, comparé à la moyenne des scores de la table (inversé pour
          les modes/variantes où le score le plus bas gagne, comme le Cut Throat). Un carton fait
          gagner plus de points, une partie catastrophique en fait perdre plus — dans la limite
          de {settings ? `×${settings.perf_multiplier_min} à ×${settings.perf_multiplier_max}` : '…'}.
        </p>
        <p>
          Le poids de chaque partie (le facteur K) diminue avec l'expérience — les premières
          parties d'un joueur comptent plus, pour que sa cote rejoigne vite son vrai niveau :
        </p>
        {settings && (
          <ul className="rg__kschedule">
            {kSchedule(settings).map(row => (
              <li key={row.range}><b>{row.range}</b> parties jouées → K = {row.k}</li>
            ))}
          </ul>
        )}
        <p>
          Chaque joueur a une cote <b>globale</b> et une cote <b>par mode de jeu</b> (Cricket,
          Shanghai, …), calculées indépendamment — tu peux être Diamant en Cricket et Bronze en
          Shanghai. Tout le monde démarre à {settings ? Math.round(settings.starting_rating) : '…'}.
        </p>
      </div>
    </div>
  );
}
