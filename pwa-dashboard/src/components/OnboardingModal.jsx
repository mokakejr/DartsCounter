import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/useAuth.jsx';
import { useLeague } from '../lib/useLeague.jsx';
import { useState } from 'react';
import './CalloutModal.css';
import './OnboardingModal.css';

const DISMISS_KEY = 'dartsOnboardingDismissed';

// Le "Hook" de conversion (Epic 1.2): après 3 parties, un joueur encore
// cantonné à la Taverne se voit proposer sa propre ligue. Dismissible mais
// agressif: le dismiss ne tient que pour la session du navigateur.
export function shouldShowOnboarding(player, leagues, leaguesReady) {
  if (!player || !leaguesReady) return false;
  if ((player.games_played ?? 0) < 3) return false;
  if (leagues.length === 0) return false;
  const onlyTaverne = leagues.every(l => l.owner_id === null);
  if (!onlyTaverne) return false;
  return sessionStorage.getItem(DISMISS_KEY) !== '1';
}

export default function OnboardingModal() {
  const auth = useAuth();
  const { leagues, ready: leaguesReady } = useLeague();
  const navigate = useNavigate();
  const [dismissed, setDismissed] = useState(false);

  const open = !dismissed && shouldShowOnboarding(auth.player, leagues, leaguesReady);

  function dismiss() {
    sessionStorage.setItem(DISMISS_KEY, '1');
    setDismissed(true);
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="callout-modal"
          onClick={dismiss}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <motion.div
            className="callout-modal__card onboarding__card"
            onClick={e => e.stopPropagation()}
            initial={{ scale: 0.9, y: 20 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.95, y: 10, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 26 }}
          >
            <span className="callout-modal__ico">🍻</span>
            <h3 className="callout-modal__title">L'échauffement est terminé.</h3>
            <p className="callout-modal__sub">
              {auth.player?.games_played ?? 3} parties dans la Taverne — il est temps
              de jouer pour de vrai. Monte ta ligue, invite tes potes, règne.
            </p>

            <div className="onboarding__actions">
              <button
                className="onboarding__cta onboarding__cta--primary"
                onClick={() => { dismiss(); navigate('/ligues?new=1'); }}
              >
                Créer ma Ligue
              </button>
              <button
                className="onboarding__cta onboarding__cta--secondary"
                onClick={() => { dismiss(); navigate('/ligues'); }}
              >
                J'ai un code d'invitation
              </button>
              <button className="onboarding__cta onboarding__cta--ghost" onClick={dismiss}>
                Rester dans la Taverne
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
