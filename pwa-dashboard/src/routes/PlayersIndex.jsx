import { Link } from 'react-router-dom';
import './PlayersIndex.css';

export default function PlayersIndex({ ranked }) {
  return (
    <div className="players shell">
      <Link to="/" className="back">← La Ligue</Link>
      <h1 className="display players__title">Les joueurs</h1>
      <p className="players__sub">{ranked.length} membres de la ligue</p>

      <div className="players__grid">
        {ranked.map((s, i) => (
          <Link key={s.name} to={`/joueur/${encodeURIComponent(s.name)}`} className="pcard">
            <span className="pcard__avatar">{s.name.charAt(0)}</span>
            <span className="pcard__name">{s.name}</span>
            <span className="pcard__lv">niv. {s.level.lv} · {s.level.name}</span>
            <span className="pcard__stats">
              <b>{s.wins}</b> {s.wins === 1 ? 'victoire' : 'victoires'} · {s.games} {s.games === 1 ? 'partie' : 'parties'}
            </span>
            <span className="pcard__rank">#{i + 1}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
