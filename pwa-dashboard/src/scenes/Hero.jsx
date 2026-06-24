import { motion } from 'framer-motion';
import { Suspense } from 'react';
import { Link } from 'react-router-dom';
import Dart from '../components/Dart.jsx';
import RankBadge from '../components/RankBadge.jsx';
import { MODE_LABEL, fmtDuration, relDate } from '../lib/data.js';
import { displayName } from '../lib/profiles.js';
import './Hero.css';

const COUNTER_URL = import.meta.env.VITE_COUNTER_URL || 'http://localhost:5174';

export default function Hero({ ranked, games, profiles = {}, eloBoard = [] }) {
  // Reigning champion = highest global Elo (eloBoard is already sorted desc
  // by the backend), not highest win count. champStats (level/streak — XP
  // concepts the backend doesn't track) is looked up by name from the
  // client-computed `ranked` for the same player.
  const champEntry = eloBoard[0];
  const champStats = champEntry ? ranked.find(r => r.name === champEntry.name) : null;
  const champName = champEntry?.name;
  const champProfile = champName ? profiles[champName] : null;
  const last = games && games.length ? games[0] : null;
  const others = last ? (last.players || []).filter(p => p !== last.winner) : [];

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
              <RankBadge rank={champEntry.rank} elo={champEntry.elo} size="lg" />
              {champStats && (
                <span className="hero__champ-meta">
                  {champStats.wins} victoires · niv. {champStats.level.lv} · {champStats.level.name}
                </span>
              )}
              {/* Pourquoi il règne : le détail derrière la 1re place. */}
              <span className="hero__champ-why">
                {Math.round((champEntry.win_rate || 0) * 100)}% de winrate
                {champStats?.curStreak >= 2 && <> · 🔥 {champStats.curStreak} victoires de suite</>}
              </span>
            </motion.div>
          )}

          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.4 }}
          >
            <a href={COUNTER_URL} className="hero__cta">
              🎯 Jouer maintenant
            </a>
          </motion.div>
        </div>

        {last && (
          <motion.div
            className="ticket"
            initial={{ opacity: 0, y: 24, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.6, delay: 0.4, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="ticket__top">
              <span className="ticket__tag">Dernière partie</span>
              <span className="ticket__when">{relDate(last.date)}</span>
            </div>

            <Link
              to={`/joueur/${encodeURIComponent(last.winner || '')}`}
              className="ticket__winner display"
            >
              {last.winner ? displayName(profiles, last.winner) : '—'}
            </Link>

            {others.length > 0 && (
              <p className="ticket__beat">
                bat {others.map(p => displayName(profiles, p)).join(' · ')}
              </p>
            )}

            <div className="ticket__foot">
              <span className="ticket__mode">{MODE_LABEL[last.mode] || last.mode}</span>
              <span className="ticket__dur">{fmtDuration(last.duration)}</span>
            </div>
          </motion.div>
        )}
      </div>

      <a href="#classement" className="hero__scroll">↓ Voir le classement</a>
    </header>
  );
}
