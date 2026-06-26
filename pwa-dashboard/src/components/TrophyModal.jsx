import { motion, AnimatePresence } from 'framer-motion';
import { Link } from 'react-router-dom';
import { displayName, avatarStyle } from '../lib/profiles.js';
import './TrophyModal.css';

export default function TrophyModal({ trophy, onClose, profiles = {} }) {
  return (
    <AnimatePresence>
      {trophy && (
        <motion.div
          className="modal"
          onClick={onClose}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <motion.div
            className="modal__card"
            onClick={e => e.stopPropagation()}
            initial={{ scale: 0.9, y: 20 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.95, y: 10, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 26 }}
          >
            <button className="modal__close" onClick={onClose} aria-label="Fermer">×</button>
            <span className="modal__ico">{trophy.ico}</span>
            {trophy.rarity && (
              <span className="modal__rarity" style={{ color: trophy.rarity.color }}>
                ● {trophy.rarity.label}
              </span>
            )}
            <h3 className="modal__name">{trophy.name}</h3>
            <p className="modal__desc">{trophy.desc}</p>

            {trophy.progress && trophy.earners.length === 0 && (
              <div className="modal__prog">
                <div className="modal__prog-track">
                  <span style={{ width: `${Math.round((trophy.progress[0] / trophy.progress[1]) * 100)}%` }} />
                </div>
                <span className="modal__prog-num">{trophy.progress[0]} / {trophy.progress[1]}</span>
              </div>
            )}

            {trophy.earners.length > 0 ? (
              <>
                <p className="modal__label eyebrow">
                  Débloqué par {trophy.earners.length} joueur{trophy.earners.length > 1 ? 's' : ''}
                </p>
                <div className="modal__earners">
                  {trophy.earners.map(e => (
                    <Link
                      key={e.name}
                      to={`/joueur/${encodeURIComponent(e.name)}`}
                      className="modal__earner"
                      onClick={onClose}
                    >
                      <span className="modal__earner-av" style={avatarStyle(profiles, e.name)}>
                        {!profiles[e.name]?.avatar_url && e.name.charAt(0)}
                      </span>
                      <span className="modal__earner-name">
                        {displayName(profiles, e.name)}
                        {e.value && <span className="modal__earner-value">{e.value}</span>}
                      </span>
                    </Link>
                  ))}
                </div>
              </>
            ) : (
              <p className="modal__label eyebrow">Pas encore débloqué</p>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
