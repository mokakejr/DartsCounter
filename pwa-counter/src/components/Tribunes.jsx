import { useEffect, useState } from 'react';
import { apiGet } from '../api/client.js';
import { censorName } from '../censor.js';
import './Tribunes.css';

/**
 * Le Vestiaire (Epic 14.3): les joueurs n'ont pas vu le chat pendant la
 * partie — une fois la pression retombée, ils lisent ce que les gradins
 * ont dit d'eux. Rendu sous le podium de fin de partie.
 */
export default function Tribunes({ liveId }) {
  const [chat, setChat] = useState(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!liveId) return;
    apiGet(`/live/matches/${liveId}`, { include: 'chat' })
      .then(m => setChat(m.chat ?? []))
      .catch(() => setChat([]));
  }, [liveId]);

  if (!liveId || !chat || chat.length === 0) return null;

  return (
    <div className="tribunes">
      <button className="tribunes__toggle" onClick={() => setOpen(o => !o)}>
        🗣️ Tribunes — {chat.length} message{chat.length > 1 ? 's' : ''} des gradins {open ? '▲' : '▼'}
      </button>
      {open && (
        <div className="tribunes__list">
          {chat.map((m, i) => (
            <p key={i} className="tribunes__msg">
              <b>{censorName(m.sender_id)}</b> {m.message}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
