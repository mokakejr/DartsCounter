import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { ACHIEVEMENTS, computeAchievements } from '../lib/stats.js';
import { avatarStyle } from '../lib/profiles.js';
import TrophyModal from '../components/TrophyModal.jsx';
import './Trophies.css';

export default function Trophies({ stats, profiles = {} }) {
  const [selected, setSelected] = useState(null);

  const { preview, totalUnlocked } = useMemo(() => {
    const earned = computeAchievements(stats);
    const withEarners = ACHIEVEMENTS.map(a => ({ ...a, earners: earned[a.id] || [] }));
    return {
      preview: withEarners
        .filter(a => a.earners.length > 0 && a.cat !== 'xp')
        .sort((a, b) => a.earners.length - b.earners.length)
        .slice(0, 10),
      totalUnlocked: withEarners.filter(a => a.earners.length > 0).length,
    };
  }, [stats]);

  return (
    <section className="trophies shell" id="trophees">
      <div className="sec-head">
        <p className="eyebrow">04 — Le palmarès</p>
        <h2 className="display sec-title">Trophées</h2>
        <p className="trophies__count">
          {totalUnlocked} / {ACHIEVEMENTS.length} débloqués · les plus rares
        </p>
      </div>

      <div className="trophies__grid">
        {preview.map((a, i) => (
          <motion.button
            type="button"
            key={a.id}
            className="trophy"
            onClick={() => setSelected(a)}
            initial={{ opacity: 0, scale: 0.94 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true, margin: '-40px' }}
            transition={{ duration: 0.35, delay: Math.min(i * 0.04, 0.3) }}
          >
            <span className="trophy__ico">{a.ico}</span>
            <span className="trophy__name">{a.name}</span>
            <span className="trophy__desc">{a.desc}</span>
            <div className="trophy__earners">
              {a.earners.slice(0, 5).map(e => (
                <span key={e.name} className="trophy__earner" title={e.name} style={avatarStyle(profiles, e.name)}>
                  {!profiles[e.name]?.avatar_url && e.name.charAt(0)}
                </span>
              ))}
            </div>
          </motion.button>
        ))}
      </div>

      <Link to="/trophees" className="trophies__all">
        Voir les {ACHIEVEMENTS.length} trophées →
      </Link>

      <TrophyModal trophy={selected} onClose={() => setSelected(null)} profiles={profiles} />
    </section>
  );
}
