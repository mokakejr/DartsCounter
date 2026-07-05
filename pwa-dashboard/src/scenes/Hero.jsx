import { motion } from 'framer-motion';
import { Suspense } from 'react';
import Dart from '../components/Dart.jsx';
import PlayerCard from '../components/PlayerCard.jsx';
import RankBadge from '../components/RankBadge.jsx';
import { displayName } from '../lib/profiles.js';
import { useAuth } from '../lib/useAuth.jsx';
import './Hero.css';

const COUNTER_URL = import.meta.env.VITE_COUNTER_URL || 'http://localhost:5174';

const ORDINALS = ['1er', '2e', '3e'];
const ordinal = (n) => ORDINALS[n - 1] ?? `${n}e`;

/**
 * La Trinité de l'Accueil (zéro charge cognitive) :
 *   1. Le Boss Final — le Roi de la ligue, typo massive, la carotte.
 *   2. Le Miroir — MA distance au trône, rien d'autre.
 *   3. JOUER — le tunnel direct vers le gameplay, friction zéro.
 * Tout le reste (dernière partie, winrate, niveaux) vit plus bas dans les
 * scènes ou sur les profils — pas sur le premier écran.
 */
export default function Hero({ ranked, profiles = {}, eloBoard = [] }) {
  const auth = useAuth();
  const champEntry = eloBoard[0];
  const champStats = champEntry ? ranked.find(r => r.name === champEntry.name) : null;
  const champName = champEntry?.name;
  const champProfile = champName ? profiles[champName] : null;

  // Le Miroir : ma position vs le sommet.
  const myName = auth.player?.name;
  const myIdx = myName ? eloBoard.findIndex(r => r.name === myName) : -1;
  const me = myIdx >= 0 ? eloBoard[myIdx] : null;
  const gap = me && champEntry ? Math.max(champEntry.elo - me.elo, 0) : null;

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
            {me && champEntry && (
              <p className="hero__mirror">
                {myIdx === 0
                  ? 'Tu règnes. Défends ton trône.'
                  : <>Tu es <b>{ordinal(myIdx + 1)}</b> · {me.rank} — <b>{gap}</b> pts de retard sur le trône</>}
              </p>
            )}
            <a href={COUNTER_URL} className="hero__cta hero__cta--play">
              🎯 JOUER
            </a>
          </motion.div>
        </div>
      </div>

      <a href="#classement" className="hero__scroll">↓ Voir le classement</a>
    </header>
  );
}
