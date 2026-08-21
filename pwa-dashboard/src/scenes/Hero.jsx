import { motion } from 'framer-motion';
import PlayerCard from '../components/PlayerCard.jsx';
import { displayName } from '../lib/profiles.js';
import './Hero.css';

const COUNTER_URL = import.meta.env.VITE_COUNTER_URL || 'http://localhost:5174';

/**
 * Bandeau champion (F2) : le champion garde son moment, mais en bandeau
 * compact — le classement reste visible sans scroller, juste en dessous.
 * Plus de fléchette 3D ni de titre plein écran (c'était l'« avant » du chantier).
 * avatar · (eyebrow + nom + pastilles de stats) · Jouer.
 */
export default function Hero({ ranked, profiles = {}, eloBoard = [], seasonLabel }) {
  const champEntry = eloBoard[0];
  const champName = champEntry?.name;
  const champStats = champName ? ranked.find((r) => r.name === champName) : null;
  const champProfile = champName ? profiles[champName] : null;

  if (!champEntry) {
    return (
      <header className="champ shell champ--empty">
        <p className="eyebrow">DartsCounter · La Ligue</p>
        <a href={COUNTER_URL} className="champ__cta">🎯 Jouer</a>
      </header>
    );
  }

  const wins = champStats?.wins ?? 0;
  const games = champStats?.games ?? 0;
  const winrate = games ? Math.round((wins / games) * 100) : 0;
  const streak = champStats?.curStreak ?? 0;

  return (
    <motion.header
      className="champ shell"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
    >
      <span className="champ__avatar">
        <PlayerCard
          name={champName}
          label=""
          avatarUrl={champProfile?.avatar_url}
          rank={champEntry.rank}
          size={96}
          to={`/joueur/${encodeURIComponent(champName)}`}
        />
      </span>

      <div className="champ__body">
        <p className="eyebrow champ__eyebrow">
          Champion en titre{seasonLabel ? ` · ${seasonLabel}` : ''}
        </p>
        <h1 className="display champ__name">{displayName(profiles, champName)}</h1>
        <div className="champ__stats">
          <span className="champ__pill">◆ Champion · {champEntry.elo}</span>
          <span className="champ__stat">{wins} V / {games} parties · {winrate} %</span>
          {streak >= 2 && <span className="champ__stat champ__stat--fire">🔥 {streak} d'affilée</span>}
        </div>
      </div>

      <a href={COUNTER_URL} className="champ__cta">🎯 Jouer</a>
    </motion.header>
  );
}
