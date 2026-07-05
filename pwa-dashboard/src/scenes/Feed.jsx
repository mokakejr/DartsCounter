import { Fragment, useState } from 'react';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { recentGames, rivalries } from '../lib/derive.js';
import { MODE_LABEL, fmtDuration, relDate } from '../lib/data.js';
import { displayName } from '../lib/profiles.js';
import { useAuth } from '../lib/useAuth.jsx';
import { useLeague } from '../lib/useLeague.jsx';
import LeagueFeed, { Pantheon } from '../components/LeagueFeed.jsx';
import { reportGame } from '../api/leagues.js';
import './Feed.css';

const REPORT_REASONS = [
  ['impossible_score', 'Score impossible'],
  ['rage_quit', "Rage-quit de l'adversaire"],
  ['other', 'Autre doute'],
];

// « Un doute sur ce match ? » (Epic 6.3) — BottomSheet de signalement.
function ReportSheet({ game, token, onClose }) {
  const [done, setDone] = useState(null);

  async function report(reason) {
    try {
      await reportGame(token, game.id, reason);
      setDone('Match signalé — en attente du verdict de la ligue.');
    } catch (err) {
      setDone(err.status === 409 ? 'Ce match est déjà en cours d’examen.' : 'Signalement impossible.');
    }
  }

  return (
    <div className="feed__sheet-backdrop" onClick={onClose}>
      <div className="feed__sheet" onClick={e => e.stopPropagation()}>
        {done ? (
          <>
            <p>{done}</p>
            <button className="feed__sheet-btn" onClick={onClose}>Fermer</button>
          </>
        ) : (
          <>
            <p className="feed__sheet-title">Un doute sur ce match ?</p>
            {REPORT_REASONS.map(([reason, label]) => (
              <button key={reason} className="feed__sheet-btn" onClick={() => report(reason)}>
                {label}
              </button>
            ))}
            <button className="feed__sheet-btn feed__sheet-btn--ghost" onClick={onClose}>Annuler</button>
          </>
        )}
      </div>
    </div>
  );
}

export default function Feed({ games, profiles = {} }) {
  const auth = useAuth();
  const { activeLeague } = useLeague();
  const [reporting, setReporting] = useState(null);
  const recent = recentGames(games, 8);
  const rivals = rivalries(games, 5);

  return (
    <section className="feed shell" id="parties">
      <div className="sec-head">
        <p className="eyebrow">02 — Le feu de l'action</p>
        <h2 className="display sec-title">Dernières parties</h2>
      </div>

      <LeagueFeed league={activeLeague} />

      <div className="feed__grid">
        <ol className="feed__list">
          {recent.map((g, i) => (
            <motion.li
              key={g.id || i}
              className="feed__row"
              initial={{ opacity: 0, x: -16 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true, margin: '-40px' }}
              transition={{ duration: 0.4, delay: Math.min(i * 0.04, 0.25) }}
            >
              <span className="feed__mode">{MODE_LABEL[g.mode] || g.mode}</span>
              <span className="feed__players">
                {(g.players || []).map((p, k) => (
                  <Fragment key={p}>
                    <Link
                      to={`/joueur/${encodeURIComponent(p)}`}
                      className={p === g.winner ? 'feed__win' : 'feed__player'}
                    >
                      {displayName(profiles, p)}
                    </Link>
                    {k < g.players.length - 1 ? ' · ' : ''}
                  </Fragment>
                ))}
              </span>
              <span className="feed__meta">
                {fmtDuration(g.duration)} · {relDate(g.date)}
                {auth.player && g.id && (
                  <button type="button" className="feed__doubt" onClick={() => setReporting(g)}>
                    Un doute sur ce match ?
                  </button>
                )}
              </span>
            </motion.li>
          ))}
        </ol>

        <aside className="rivals">
          <h3 className="rivals__title eyebrow">Rivalités</h3>
          {rivals.map(r => {
            const total = r.aWins + r.bWins;
            const pct = total ? Math.round((r.aWins / total) * 100) : 50;
            return (
              <div key={`${r.a}-${r.b}`} className="rival">
                <div className="rival__names">
                  <span>{displayName(profiles, r.a)}</span>
                  <span className="rival__vs">{r.aWins}–{r.bWins}</span>
                  <span>{displayName(profiles, r.b)}</span>
                </div>
                <div className="rival__bar">
                  <span style={{ width: `${pct}%` }} />
                </div>
                <span className="rival__games">{r.games} duels</span>
              </div>
            );
          })}
          {rivals.length === 0 && <p className="rivals__empty">Pas encore de rivalité établie.</p>}
        </aside>
      </div>

      <Pantheon league={activeLeague} />

      {reporting && (
        <ReportSheet game={reporting} token={auth.token} onClose={() => setReporting(null)} />
      )}
    </section>
  );
}
