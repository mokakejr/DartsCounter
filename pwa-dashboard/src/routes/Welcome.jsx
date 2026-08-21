import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import './Welcome.css';

// Objet décoratif plat (F6) : une fléchette en SVG, pas de three.js. Empilées
// en deux grappes aux coins, à des opacités/rotations variées pour les « plans
// alternés » de la maquette.
function Dart2D({ style }) {
  return (
    <svg className="welcome__dart" viewBox="0 0 24 84" aria-hidden="true" style={style}>
      <path d="M12 2 L21 20 L12 15 L3 20 Z" fill="currentColor" />
      <rect x="11" y="17" width="2" height="58" fill="currentColor" />
      <circle cx="12" cy="79" r="2.6" fill="currentColor" />
    </svg>
  );
}

// Onboarding wall shown on the home route until you have an account AND a
// league (see App.jsx onboardingDone). Two steps depending on auth state.
export default function Welcome({ hasAccount }) {
  const title = hasAccount
    ? [['Rejoins ta'], ['première'], ['ligue.', true]]
    : [['Bienvenue'], ['dans'], ['la Ligue.', true]];

  return (
    <main className="welcome">
      {/* Deux grappes d'objets plats, plans alternés. */}
      <div className="welcome__deco welcome__deco--tr" aria-hidden="true">
        <Dart2D style={{ opacity: 0.5, transform: 'rotate(18deg)' }} />
        <Dart2D style={{ opacity: 0.9, transform: 'rotate(-6deg) translateY(24px)' }} />
        <Dart2D style={{ opacity: 0.28, transform: 'rotate(34deg) translateY(-10px)' }} />
      </div>
      <div className="welcome__deco welcome__deco--bl" aria-hidden="true">
        <Dart2D style={{ opacity: 0.8, transform: 'rotate(-22deg)' }} />
        <Dart2D style={{ opacity: 0.35, transform: 'rotate(-40deg) translateY(18px)' }} />
      </div>

      <div className="welcome__inner shell">
        <motion.p
          className="eyebrow"
          initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          {hasAccount ? 'Étape 2 / 2' : 'Étape 1 / 2'}
        </motion.p>

        <motion.h1
          className="display welcome__title"
          initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.05 }}
        >
          {title.map(([text, accent], i) => (
            <span key={i} className={`welcome__line${accent ? ' welcome__accent' : ''}`}>{text}</span>
          ))}
        </motion.h1>

        {hasAccount ? (
          <>
            <motion.p
              className="welcome__sub"
              initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.2 }}
            >
              Crée ta ligue ou rejoins celle de tes potes avec leur code
              d'invitation : c'est elle qui débloque ton classement, tes
              trophées et le titre de champion.
            </motion.p>
            <motion.div
              className="welcome__cta-row"
              initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.35 }}
            >
              <Link to="/ligues?new=1" className="welcome__cta">+ Créer une ligue</Link>
              <Link to="/ligues" className="welcome__cta welcome__cta--ghost">
                J'ai un code d'invitation
              </Link>
            </motion.div>
          </>
        ) : (
          <>
            <motion.p
              className="welcome__sub"
              initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.2 }}
            >
              Crée ton compte, lance ta ligue et défie tes potes. Un classement
              unique, des trophées à débloquer et un seul champion à la fin.
            </motion.p>
            <motion.div
              className="welcome__cta-row"
              initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.35 }}
            >
              <Link to="/login?mode=signup&next=/" className="welcome__cta">Créer mon compte</Link>
              <Link to="/login?mode=login&next=/" className="welcome__cta welcome__cta--ghost">
                J'ai déjà un compte
              </Link>
            </motion.div>
          </>
        )}
      </div>
    </main>
  );
}
