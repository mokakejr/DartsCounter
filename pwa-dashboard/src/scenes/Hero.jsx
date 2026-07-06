import { motion } from 'framer-motion';
import { Suspense } from 'react';
import Dart from '../components/Dart.jsx';
import PlayerCard from '../components/PlayerCard.jsx';
import RankBadge from '../components/RankBadge.jsx';
import { displayName } from '../lib/profiles.js';
import './Hero.css';

const COUNTER_URL = import.meta.env.VITE_COUNTER_URL || 'http://localhost:5174';

/**
 * Le Lobby Cinématique (Epic 5) — l'écran ne dit que deux choses :
 *   1. Le Boss Final — "X RÈGNE." en décor derrière la fléchette 3D.
 *   2. JOUER — l'unique soleil, il pulse et attire le clic.
 * Mon rang vit dans le header, le classement dans le tiroir (LobbyDrawer),
 * tout le reste plus bas dans le tiroir ou sur les profils.
 */
export default function Hero({ ranked, profiles = {}, eloBoard = [] }) {
  const champEntry = eloBoard[0];
  const champStats = champEntry ? ranked.find(r => r.name === champEntry.name) : null;
  const champName = champEntry?.name;
  const champProfile = champName ? profiles[champName] : null;

  return (
    <header className="hero">
      <div className="hero__dart">
        <Suspense fallback={null}>
          <Dart
            accentColor={champProfile?.accent_color}
            flightImageUrl={champProfile?.flight_image_url}
            flightCropA={champProfile?.flight_crop_a}
            flightCropB={champProfile?.flight_crop_b}
            flightMode={champProfile?.flight_mode}
          />
        </Suspense>
      </div>

      <div className="hero__grid shell">
        <div className="hero__head">
          <motion.p
            className="eyebrow"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            {champEntry ? 'Champion en titre' : 'DartsCounter · La Ligue'}
          </motion.p>

          <motion.h1
            className="display hero__title"
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.05 }}
          >
            {champEntry ? (
              <>
                <span className="hero__line">{displayName(profiles, champName)}</span>
                <span className="hero__line hero__accent">règne.</span>
              </>
            ) : (
              <>La <span className="hero__accent">Ligue</span></>
            )}
          </motion.h1>

          {champEntry && (
            <motion.div
              className="hero__champ"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.25 }}
            >
              <span className={`hero__avatar${(champStats?.curStreak ?? 0) >= 3 ? ' on-fire' : ''}`}>
                <PlayerCard
                  name={champName}
                  label=""
                  avatarUrl={champProfile?.avatar_url}
                  rank={champEntry.rank}
                  size={120}
                  to={`/joueur/${encodeURIComponent(champName)}`}
                />
              </span>
              <RankBadge rank={champEntry.rank} elo={champEntry.elo} size="lg" />
            </motion.div>
          )}

          <motion.div
            className="hero__action"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.4 }}
          >
            <a href={COUNTER_URL} className="hero__cta hero__cta--play">
              🎯 JOUER
            </a>
          </motion.div>
        </div>
      </div>
    </header>
  );
}
