import { Link } from 'react-router-dom';
import { tierOf, rankColor } from '../lib/ranks.js';
import './PlayerCard.css';

/**
 * Identité visuelle d'un joueur (Epic 8.2): avatar rond dans un cadre teinté
 * par le rang ELO (attribut data-rank + lueur), pseudo en typo lourde, titre
 * équipé en dessous. Remplace les mentions textuelles inline.
 *
 * props: name (clé canonique), label (nom affiché), avatarUrl, rank (ELO),
 * title (titre équipé), streak (🔥 n si >= 2), size (px), to (Link) ou span.
 */
export default function PlayerCard({
  name, label, avatarUrl, rank, title, streak = 0, size = 48, to, className = '',
}) {
  const tier = tierOf(rank);
  const body = (
    <>
      <span
        className="player-card__frame"
        data-rank={tier ? tier.toLowerCase().replace(' ', '-') : undefined}
        style={{
          '--pc-size': `${size}px`,
          '--tier-color': rank ? rankColor(rank) : 'transparent',
          ...(avatarUrl
            ? { backgroundImage: `url(${avatarUrl})`, backgroundSize: 'cover', backgroundPosition: 'center' }
            : {}),
        }}
      >
        {!avatarUrl && (label || name || '?').charAt(0)}
      </span>
      <span className="player-card__meta">
        <span className="player-card__name">
          {label || name}
          {streak >= 2 && (
            <span className="player-card__flame" title={`${streak} jours de streak`}>
              🔥{streak}
            </span>
          )}
        </span>
        {title && <span className="player-card__title">{title}</span>}
      </span>
    </>
  );

  if (to) {
    return <Link to={to} className={`player-card ${className}`}>{body}</Link>;
  }
  return <span className={`player-card ${className}`}>{body}</span>;
}
