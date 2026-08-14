import { useEffect, useState } from 'react';
import './LobbyDrawer.css';

/**
 * Le Tiroir du lobby (Epic 5.4) : le contenu du hub (classement, feed,
 * tendances, trophées) suit le Hero dans la page — on y descend au scroll —
 * et le chevron ^ le fait remonter en bottom sheet plein écran pour y sauter
 * directement. Fermeture : chevron inversé, ou Escape.
 */
export default function LobbyDrawer({ children }) {
  const [open, setOpen] = useState(false);
  const [atTop, setAtTop] = useState(true);

  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Le chevron n'est un raccourci que depuis le Hero : une fois la page
  // déroulée il flotterait par-dessus les sections qu'il est censé montrer.
  useEffect(() => {
    const onScroll = () => setAtTop(window.scrollY < 80);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <>
      {!open && atTop && (
        <button
          className="lobby-drawer__handle"
          onClick={() => setOpen(true)}
          aria-label="Ouvrir le classement"
        >
          ⌃
        </button>
      )}
      {/* data-lenis-prevent : le smooth-scroll Lenis hijacke la molette au
          niveau document — sans ça, le scroll interne du tiroir est mort.
          Fermé, le tiroir scrolle avec la page : on rend la molette à Lenis. */}
      <div
        className={`lobby-drawer${open ? ' is-open' : ''}`}
        {...(open ? { 'data-lenis-prevent': '' } : {})}
      >
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
