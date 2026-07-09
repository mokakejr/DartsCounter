import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import './Welcome.css';

// Onboarding wall shown on the home route until you have an account AND a
// league (see App.jsx onboardingDone). Two steps depending on auth state.
export default function Welcome({ hasAccount }) {
  return (
    <main className="welcome">
      <div className="welcome__inner shell">
        <motion.p
          className="eyebrow"
          initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          {hasAccount ? 'Étape 2 / 2' : 'Étape 1 / 2'}
        </motion.p>

        {hasAccount ? (
          <>
            <motion.h1
              className="display welcome__title"
              initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.05 }}
            >
              <span className="welcome__line">Rejoins ta</span>
              <span className="welcome__line welcome__accent">première ligue.</span>
            </motion.h1>
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
            <motion.h1
              className="display welcome__title"
              initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.05 }}
            >
              <span className="welcome__line">Bienvenue dans</span>
              <span className="welcome__line welcome__accent">la Ligue.</span>
            </motion.h1>
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
