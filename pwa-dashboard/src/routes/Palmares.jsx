import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../lib/useAuth.jsx';
import { useLeague } from '../lib/useLeague.jsx';
import { censorName } from '../lib/censor.js';
import { fetchPalmares } from '../api/leagues.js';
import RankBadge from '../components/RankBadge.jsx';
import './Palmares.css';

const MEDALS = ['🥇', '🥈', '🥉'];

function label(p) {
  return censorName(p?.display_name || p?.name || '—');
}

function period(start, end) {
  if (!start || !end) return null;
  const fmt = d => new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
  return `${fmt(start)} → ${fmt(end)}`;
}

function Avatar({ p }) {
  if (p?.avatar_url) return <img className="palm__avatar" src={p.avatar_url} alt="" />;
  return <span className="palm__avatar palm__avatar--initial">{label(p).charAt(0)}</span>;
}

function SeasonBlock({ entry }) {
  const [open, setOpen] = useState(false);
  const podium = entry.standings.slice(0, 3);
  const rest = entry.standings.slice(3);

  return (
    <section className="palm__season">
      <header className="palm__season-head">
        <h2 className="palm__season-name display">{entry.season_name}</h2>
        {period(entry.start_date, entry.end_date) && (
          <span className="palm__period">{period(entry.start_date, entry.end_date)}</span>
        )}
      </header>

      {entry.champion ? (
        <div className="palm__champion">
          <Avatar p={entry.champion} />
          <div>
            <span className="palm__champion-tag eyebrow">Champion de Ligue</span>
            <Link to={`/joueur/${encodeURIComponent(entry.champion.name)}`} className="palm__champion-name">
              {label(entry.champion)}
            </Link>
          </div>
        </div>
      ) : (
        <p className="palm__none">Pas de champion ce mois-ci — personne n'a atteint le seuil de parties classées.</p>
      )}

      <ol className="palm__rows">
        {podium.map(row => <Row key={row.player.id} row={row} />)}
        {open && rest.map(row => <Row key={row.player.id} row={row} />)}
      </ol>

      {rest.length > 0 && (
        <button className="palm__more" onClick={() => setOpen(o => !o)}>
          {open ? 'Réduire' : rest.length === 1 ? 'Voir le suivant' : `Voir les ${rest.length} autres`}
        </button>
      )}
    </section>
  );
}

function Row({ row }) {
  const medal = MEDALS[row.position - 1];
  return (
    <li className={`palm__row${row.is_champion ? ' is-champion' : ''}`}>
      <span className="palm__pos">{medal || row.position}</span>
      <Avatar p={row.player} />
      <Link to={`/joueur/${encodeURIComponent(row.player.name)}`} className="palm__name">
        {label(row.player)}
      </Link>
      {row.rank && <RankBadge rank={row.rank} size="sm" />}
      <span className="palm__elo">{row.rating}</span>
      <span className="palm__record">{row.wins}/{row.games}</span>
    </li>
  );
}

/**
 * Le Palmarès : classements figés à la clôture de chaque saison mensuelle.
 * Les saisons repartent d'un soft reset le 1er du mois — c'est ici que
 * l'histoire se garde, mois après mois.
 */
export default function Palmares() {
  const auth = useAuth();
  const { activeLeague, leagues, ready } = useLeague();
  const league = activeLeague ?? leagues[0] ?? null;
  const [seasons, setSeasons] = useState(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!league || !auth.token) return;
    setSeasons(null);
    setFailed(false);
    fetchPalmares(auth.token, league.id)
      .then(setSeasons)
      .catch(() => setFailed(true));
  }, [league?.id, auth.token]); // eslint-disable-line react-hooks/exhaustive-deps

  if (ready && !league) {
    return (
      <div className="palm shell">
        <Link to="/" className="back">← La Ligue</Link>
        <h1 className="display palm__title">Palmarès</h1>
        <p className="palm__sub">
          Rejoins une <Link to="/ligues">ligue</Link> pour voir son palmarès.
        </p>
      </div>
    );
  }

  return (
    <div className="palm shell">
      <Link to="/" className="back">← La Ligue</Link>
      <h1 className="display palm__title">Palmarès</h1>
      <p className="palm__sub">
        {league?.name ? `${league.name} — ` : ''}
        le classement figé à la fin de chaque mois, avant que la course ne reparte.
      </p>

      {failed && <p className="palm__muted">Impossible de charger le palmarès.</p>}
      {!failed && seasons === null && <p className="palm__muted">Chargement…</p>}
      {!failed && seasons?.length === 0 && (
        <p className="palm__muted">
          Aucune saison clôturée pour l'instant. Le classement du mois en cours est figé le 1er du mois prochain.
        </p>
      )}
      {seasons?.map(entry => <SeasonBlock key={entry.season_id} entry={entry} />)}
    </div>
  );
}
