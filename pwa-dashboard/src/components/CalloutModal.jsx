import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ping } from '../api/players.js';
import './CalloutModal.css';

export default function CalloutModal({ open, onClose, onSent, onCooldown, token, name }) {
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => { if (open) setError(null); }, [open]);

  async function send() {
    setSending(true);
    setError(null);
    try {
      await ping(token);
      onSent();
      onClose();
    } catch (e) {
      if (e.status === 429) {
        onCooldown(e.detail?.retry_after_seconds ?? 0);
        setError('Une partie a déjà été proposée récemment — réessaie un peu plus tard.');
      } else {
        setError("Échec de l'envoi, réessaie.");
      }
    }
    setSending(false);
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="callout-modal"
          onClick={onClose}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <motion.div
            className="callout-modal__card"
            onClick={e => e.stopPropagation()}
            initial={{ scale: 0.9, y: 20 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.95, y: 10, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 26 }}
          >
            <button className="modal__close" onClick={onClose} aria-label="Fermer">×</button>
            <span className="callout-modal__ico">🎯</span>
            <h3 className="callout-modal__title">Proposer une partie ?</h3>
            <p className="callout-modal__sub">
              Une notification sera envoyée à tout le monde, en ton nom ({name}).
            </p>

            {error && <p className="callout-modal__error">{error}</p>}

            <div className="callout-modal__actions">
              <button className="callout-modal__cancel" onClick={onClose} disabled={sending}>
                Annuler
              </button>
              <button className="callout-modal__confirm" onClick={send} disabled={sending}>
                {sending ? 'Envoi…' : '🔔 Envoyer'}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
