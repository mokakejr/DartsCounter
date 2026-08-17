import { NavLink } from 'react-router-dom';
import './BottomTabs.css';

/**
 * Barre d'onglets mobile (E3) — les 5 destinations principales en bas d'écran,
 * pouce-friendly, sous 768px seulement (masquée en desktop, où elles vivent en
 * onglets dans le header). Le token --tabbar-h et le safe-area sont appliqués
 * une seule fois dans l'enveloppe (App.css), pas par écran.
 */
const TABS = [
  { to: '/', end: true, icon: '🏅', label: 'Classement' },
  { to: '/profils', icon: '👥', label: 'Joueurs' },
  { to: '/trophees', icon: '🏆', label: 'Trophées' },
  { to: '/ligues', icon: '🛡️', label: 'Ligues' },
  { to: '/tournois', icon: '🎯', label: 'Tournois', badge: true },
];

export default function BottomTabs({ tournamentsBadge = 0 }) {
  return (
    <nav className="tabbar" aria-label="Navigation principale">
      {TABS.map((t) => (
        <NavLink
          key={t.to}
          to={t.to}
          end={t.end}
          className={({ isActive }) => `tabbar__tab${isActive ? ' is-active' : ''}`}
        >
          <span className="tabbar__icon" aria-hidden="true">
            {t.icon}
            {t.badge && tournamentsBadge > 0 && <span className="tabbar__badge">{tournamentsBadge}</span>}
          </span>
          <span className="tabbar__label">{t.label}</span>
        </NavLink>
      ))}
    </nav>
  );
}
