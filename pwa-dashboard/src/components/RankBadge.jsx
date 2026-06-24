import { rankColor } from '../lib/ranks.js';
import './RankBadge.css';

// size: 'sm' | 'md' | 'lg'
export default function RankBadge({ rank, elo, label, size = 'md' }) {
  if (!rank) return null;
  return (
    <span className={`rankbadge rankbadge--${size}`} style={{ '--tier-color': rankColor(rank) }}>
      <span className="rankbadge__gem" />
      <span className="rankbadge__text">
        {label && <span className="rankbadge__label">{label}</span>}
        <span className="rankbadge__row">
          {elo != null && <b className="rankbadge__elo">{elo}</b>}
          <em className="rankbadge__name">{rank}</em>
        </span>
      </span>
    </span>
  );
}
