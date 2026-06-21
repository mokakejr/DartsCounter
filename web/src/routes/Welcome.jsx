import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useLeague } from '../lib/useLeague.jsx';
import { computePlayerStats } from '../lib/stats.js';
import IdentityPicker from '../components/IdentityPicker.jsx';
import './Welcome.css';

// Champion + activity for one league, derived from the full games set.
function leagueSummary(league, allGames) {
  const games = (allGames ?? []).filter(
    g => Array.isArray(g.players) && g.players.some(p => league.players.includes(p))
  );
  const stats = computePlayerStats(games);
  // Champion = best *member* of the league. The game filter keeps non-members
  // who played alongside the group, but they shouldn't be crowned here.
  const ranked = Object.values(stats)
    .filter(s => league.players.includes(s.name))
    .sort((a, b) => b.wins - a.wins || b.games - a.games || a.name.localeCompare(b.name));
  return { champ: ranked[0] ?? null, gameCount: games.length };
}

export default function Welcome({ allGames, knownPlayers }) {
  const { leagues, markSeen } = useLeague();
  const navigate = useNavigate();
  const [joining, setJoining] = useState(null); // league being joined

  const summaries = useMemo(() => {
    const map = {};
    for (const l of leagues) map[l.id] = leagueSummary(l, allGames);
    return map;
  }, [leagues, allGames]);

  function seeEverything() {
    markSeen();
    navigate('/');
  }

  return (
    <main className="welcome">
      <section className="welcome__hero shell">
        <motion.p
          className="eyebrow"
          initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
        >
          Fléchettes · entre potes
        </motion.p>

        <motion.h1
          className="display welcome__title"
          initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.05 }}
        >
          <span className="welcome__line">Bienvenue dans</span>
          <span className="welcome__line welcome__accent">la Ligue.</span>
        </motion.h1>

        <motion.p
          className="welcome__sub"
          initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.25 }}
        >
          Crée ta ligue, ramène tes potes et que le meilleur règne. Chaque ligue
          a son classement, ses trophées et sa couleur.
        </motion.p>

        <motion.div
          className="welcome__cta-row"
          initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.4 }}
        >
          <button className="welcome__cta" onClick={() => { markSeen(); navigate('/ligues?new=1'); }}>
            + Créer une ligue
          </button>
          <button className="welcome__cta welcome__cta--ghost" onClick={seeEverything}>
            Voir toutes les parties
          </button>
        </motion.div>
      </section>

      <section className="welcome__leagues shell">
        <h2 className="welcome__leagues-title">
          {leagues.length > 0 ? 'Rejoins une ligue' : 'Aucune ligue pour l’instant'}
        </h2>
        {leagues.length === 0 ? (
          <p className="welcome__empty">Sois le premier — crée la ligue qui rassemblera tout le monde.</p>
        ) : (
          <div className="welcome__grid">
            {leagues.map((l, i) => {
              const { champ, gameCount } = summaries[l.id] ?? {};
              const accent = l.color || 'var(--primary)';
              return (
                <motion.div
                  key={l.id}
                  className="welcome__card"
                  style={{ '--card-accent': accent }}
                  initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, delay: 0.1 + i * 0.05 }}
                >
                  <div className="welcome__card-bar" />
                  <div className="welcome__card-head">
                    <span className="welcome__card-name">{l.name}</span>
                    <span className="welcome__card-count">
                      {l.players.length} joueur{l.players.length !== 1 ? 's' : ''}
                    </span>
                  </div>
                  <p className="welcome__card-champ">
                    {champ
                      ? <>👑 <strong>{champ.name}</strong> · {champ.wins} victoire{champ.wins !== 1 ? 's' : ''}</>
                      : <span className="welcome__card-dim">Pas encore de partie</span>}
                  </p>
                  <p className="welcome__card-meta">{gameCount ?? 0} partie{(gameCount ?? 0) !== 1 ? 's' : ''}</p>
                  <button className="welcome__join" onClick={() => setJoining(l)}>
                    Rejoindre →
                  </button>
                </motion.div>
              );
            })}
          </div>
        )}
      </section>

      {joining && (
        <IdentityPicker
          league={joining}
          knownPlayers={knownPlayers}
          onClose={() => setJoining(null)}
        />
      )}
    </main>
  );
}
