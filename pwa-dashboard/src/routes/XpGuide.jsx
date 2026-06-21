import { Link } from 'react-router-dom';
import { LEVELS, LEVEL_ICONS } from '../lib/stats.js';
import './XpGuide.css';

const SOURCES = [
  { xp: '+10', label: 'Participer à une partie' },
  { xp: '+20', label: 'Gagner une partie' },
  { xp: '+10', label: 'Gagner à 4 joueurs ou plus' },
  { xp: '+15', label: 'Gagner par Shanghai Kill' },
  { xp: '+5 ×série', label: 'Bonus de série (2 victoires d’affilée et +)' },
  { xp: '+50', label: 'Avoir joué les 4 modes (une fois)' },
];

export default function XpGuide() {
  return (
    <div className="xp shell">
      <Link to="/" className="back">← La Ligue</Link>
      <h1 className="display xp__title">Le système d’XP</h1>
      <p className="xp__sub">Comment grimpe-t-on les 14 niveaux du comptoir ?</p>

      <section className="xp__sources">
        {SOURCES.map(s => (
          <div key={s.label} className="xpsrc">
            <span className="xpsrc__xp">{s.xp}</span>
            <span className="xpsrc__label">{s.label}</span>
          </div>
        ))}
      </section>

      <h2 className="xp__h2 eyebrow">Les 14 niveaux</h2>
      <ol className="xp__levels">
        {LEVELS.map((l, i) => (
          <li key={l.lv} className="xplv">
            <span className="xplv__ico">{LEVEL_ICONS[i] || '⭐'}</span>
            <span className="xplv__num">Niv. {l.lv}</span>
            <span className="xplv__name">{l.name}</span>
            <span className="xplv__xp">{l.xp} XP</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
