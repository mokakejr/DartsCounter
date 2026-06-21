import { motion } from 'framer-motion';
import { Suspense } from 'react';
import { Link } from 'react-router-dom';
import Dart from '../components/Dart.jsx';
import { MODE_LABEL, fmtDuration, relDate } from '../lib/data.js';
import './Hero.css';

export default function Hero({ ranked, games, leagueName }) {
  const champ = ranked[0];
  const last = games && games.length ? games[0] : null;
  const others = last ? (last.players || []).filter(p => p !== last.winner) : [];

  return (
    <header className="hero">
      <div className="hero__dart">
        <Suspense fallback={null}>
          <Dart />
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
            {leagueName ? leagueName : champ ? 'Champion en titre' : 'DartsCounter · La Ligue'}
          </motion.p>

          <motion.h1
            className="display hero__title"
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.05 }}
          >
            {champ ? (
              <>
                <span className="hero__line">{champ.name}</span>
                <span className="hero__line hero__accent">règne.</span>
              </>
            ) : (
              <>La <span className="hero__accent">Ligue</span></>
            )}
          </motion.h1>

          {champ && (
            <motion.div
              className="hero__champ"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.25 }}
            >
              <span className="hero__champ-meta">
                {champ.wins} victoires · niv. {champ.level.lv} · {champ.level.name}
              </span>
              {/* Pourquoi il règne : le détail derrière la 1re place. */}
              <span className="hero__champ-why">
                {champ.games ? Math.round((champ.wins / champ.games) * 100) : 0}% de winrate
                {champ.curStreak >= 2 && <> · 🔥 {champ.curStreak} victoires de suite</>}
              </span>
            </motion.div>
          )}

          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.4 }}
          >
            <Link to="/play" className="hero__cta">
              🎯 Jouer maintenant
            </Link>
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
              {last.winner || '—'}
            </Link>

            {others.length > 0 && (
              <p className="ticket__beat">
                bat {others.join(' · ')}
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
