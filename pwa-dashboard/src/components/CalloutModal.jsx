import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import './CalloutModal.css';

const CALLOUT_WH_KEY = 'dartsWebhookUrl';
const CALLOUT_TS_KEY = 'dartsCalloutLastSent';

const norm = s => s.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '');

export default function CalloutModal({ open, onClose, onSent, players, leagueName }) {
  const [configuring, setConfiguring] = useState(() => !localStorage.getItem(CALLOUT_WH_KEY));
  const [sending, setSending] = useState(false);
  const [query, setQuery] = useState('');
  const inputRef = useRef(null);
  const searchRef = useRef(null);

  useEffect(() => { if (open) { setQuery(''); setTimeout(() => searchRef.current?.focus(), 80); } }, [open]);

  function saveWebhook() {
    const url = inputRef.current?.value.trim();
    if (!url?.startsWith('https://')) return;
    localStorage.setItem(CALLOUT_WH_KEY, url);
    setConfiguring(false);
  }

  async function selectPlayer(name) {
    const url = localStorage.getItem(CALLOUT_WH_KEY);
    if (!url) return;
    setSending(true);
    try {
      await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: `🎯 *${name}* propose une partie de fléchettes ! Qui est chaud ? <users/all>`,
        }),
      });
    } catch (e) {
      console.error('Callout webhook error:', e);
    }
    localStorage.setItem(CALLOUT_TS_KEY, Date.now().toString());
    setSending(false);
    onSent();
    onClose();
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
            <h3 className="callout-modal__title">Qui propose la partie ?</h3>
            <p className="callout-modal__sub">
              Sélectionne ton nom — un message sera envoyé dans le groupe.
            </p>

            {configuring ? (
              <div className="callout-modal__config">
                <p className="eyebrow" style={{ marginBottom: '10px' }}>Webhook Google Chat</p>
                <input
                  ref={inputRef}
                  className="callout-modal__input"
                  type="url"
                  placeholder="https://chat.googleapis.com/v1/spaces/…"
                  defaultValue={localStorage.getItem(CALLOUT_WH_KEY) || ''}
                />
                <button className="callout-modal__save" onClick={saveWebhook}>
                  Enregistrer
                </button>
              </div>
            ) : (
              <>
                {leagueName && (
                  <p className="callout-modal__league-badge">🏷 {leagueName}</p>
                )}
                <input
                  ref={searchRef}
                  className="callout-modal__search"
                  type="search"
                  placeholder="Rechercher un joueur…"
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  autoComplete="off"
                />
                <div className="callout-modal__players">
                  {(() => {
                    const filtered = query.trim()
                      ? players.filter(p => norm(p).includes(norm(query)))
                      : players;
                    if (filtered.length === 0) {
                      return <p className="callout-modal__empty">Aucun joueur trouvé</p>;
                    }
                    return filtered.map(name => (
                      <button
                        key={name}
                        className="callout-modal__player"
                        onClick={() => selectPlayer(name)}
                        disabled={sending}
                      >
                        {name}
                      </button>
                    ));
                  })()}
                </div>
                <button
                  className="callout-modal__config-link"
                  onClick={() => setConfiguring(true)}
                >
                  ⚙️ Changer l'URL du webhook
                </button>
              </>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
