import { useEffect, useState } from 'react';
import './LobbyDrawer.css';

/**
 * Le Tiroir du lobby (Epic 5.4) : tout le contenu du hub (classement, feed,
 * tendances, trophées) glisse par-dessus le lobby depuis le bas. Ouverture :
 * chevron ^ en bas d'écran, ou swipe-up n'importe où (mobile). Fermeture :
 * chevron inversé, ou Escape.
 */
export default function LobbyDrawer({ children }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Swipe-up sur le lobby (le tiroir fermé ne couvre pas l'écran, donc les
  // touches partent du lobby lui-même).
  useEffect(() => {
    if (open) return;
    let startY = null;
    const onStart = e => { startY = e.touches[0].clientY; };
    const onMove = e => {
      if (startY == null) return;
      if (startY - e.touches[0].clientY > 60) { setOpen(true); startY = null; }
    };
    const onEnd = () => { startY = null; };
    window.addEventListener('touchstart', onStart, { passive: true });
    window.addEventListener('touchmove', onMove, { passive: true });
    window.addEventListener('touchend', onEnd, { passive: true });
    return () => {
      window.removeEventListener('touchstart', onStart);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onEnd);
    };
  }, [open]);

  return (
    <>
      {!open && (
        <button
          className="lobby-drawer__handle"
          onClick={() => setOpen(true)}
          aria-label="Ouvrir le classement"
        >
          ⌃
        </button>
      )}
      {/* data-lenis-prevent : le smooth-scroll Lenis hijacke la molette au
          niveau document — sans ça, le scroll interne du tiroir est mort. */}
      <div className={`lobby-drawer${open ? ' is-open' : ''}`} data-lenis-prevent>
        <button
          className="lobby-drawer__close"
          onClick={() => setOpen(false)}
          aria-label="Fermer"
        >
          ⌄
        </button>
        {children}
      </div>
    </>
  );
}
