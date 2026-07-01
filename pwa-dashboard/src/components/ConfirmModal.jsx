import { AnimatePresence, motion } from 'framer-motion';
import './ConfirmModal.css';

export default function ConfirmModal({ open, title, message, confirmLabel = 'Confirmer', danger = false, onConfirm, onCancel }) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="confirm-modal"
          onClick={onCancel}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <motion.div
            className="confirm-modal__card"
            onClick={e => e.stopPropagation()}
            initial={{ scale: 0.92, y: 16 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.95, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 320, damping: 28 }}
          >
            <h3 className="confirm-modal__title">{title}</h3>
            {message && <p className="confirm-modal__message">{message}</p>}
            <div className="confirm-modal__actions">
              <button className="confirm-modal__cancel" onClick={onCancel}>Annuler</button>
              <button
                className={`confirm-modal__confirm ${danger ? 'confirm-modal__confirm--danger' : ''}`}
                onClick={onConfirm}
              >
                {confirmLabel}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
