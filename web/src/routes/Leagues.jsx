import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useLeague } from '../lib/useLeague.jsx';
import IdentityPicker from '../components/IdentityPicker.jsx';
import './Leagues.css';

// Palette restreinte, validée pour le contraste sur le thème sombre (cf. tokens.css).
// Pas de couleur libre : une teinte trop sombre/claire casserait la lisibilité des
// accents et des courbes dérivées dans useLeagueTheme.
const SWATCHES = [
  { hex: '#E61E2A', name: 'Rouge' },
  { hex: '#F5833F', name: 'Orange' },
  { hex: '#E6A93C', name: 'Ambre' },
  { hex: '#34D399', name: 'Vert' },
  { hex: '#2DD4BF', name: 'Turquoise' },
  { hex: '#4C9BE6', name: 'Bleu' },
  { hex: '#A974E6', name: 'Violet' },
  { hex: '#EC4899', name: 'Rose' },
];

export default function Leagues({ knownPlayers }) {
  const {
    leagues, activeLeague, activateLeague,
    createLeague, updateLeague, deleteLeague,
    myPlayer,
  } = useLeague();
  const [searchParams, setSearchParams] = useSearchParams();
  const [editing, setEditing] = useState(null);    // null | 'new' | league.id
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [joining, setJoining] = useState(null);     // league being joined

  // The Welcome "+ Créer une ligue" CTA links here with ?new=1.
  useEffect(() => {
    if (searchParams.get('new') === '1') {
      setEditing('new');
      searchParams.delete('new');
      setSearchParams(searchParams, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  const editTarget = editing && editing !== 'new'
    ? leagues.find(l => l.id === editing)
    : null;

  return (
    <div className="leagues shell">
      <h1 className="leagues__title display">Ligues</h1>
      <p className="leagues__sub">
        Lance une ligue, rejoins-la avec ton joueur, et le dashboard se filtre sur ton groupe.
        Les ligues sont partagées avec tout le monde.
      </p>

      <button className="leagues__new" onClick={() => setEditing('new')}>
        + Lancer une ligue
      </button>

      {leagues.length === 0 && !editing && (
        <p className="leagues__empty">Aucune ligue. Lance la première !</p>
      )}

      <div className="leagues__list">
        {leagues.map(league => {
          const mine = myPlayer(league.id);
          const accent = league.color || 'var(--primary)';
          const isActive = activeLeague?.id === league.id;
          return (
            <div
              key={league.id}
              className={`leagues__card${isActive ? ' leagues__card--active' : ''}`}
              style={{ '--card-accent': accent }}
            >
              <div className="leagues__card-head">
                <span className="leagues__card-dot" style={{ background: accent }} />
                <span className="leagues__card-name">{league.name}</span>
                <span className="leagues__card-count">{league.players.length} joueur{league.players.length !== 1 ? 's' : ''}</span>
              </div>
              <p className="leagues__card-players">{league.players.join(' · ')}</p>
              {mine && <p className="leagues__card-mine">Tu joues comme <strong>{mine}</strong></p>}
              <div className="leagues__card-actions">
                <button className="leagues__btn leagues__btn--join" onClick={() => setJoining(league)}>
                  {mine ? 'Changer de joueur' : 'Rejoindre'}
                </button>
                <button
                  className={`leagues__btn leagues__btn--activate${isActive ? ' leagues__btn--on' : ''}`}
                  onClick={() => activateLeague(league.id)}
                >
                  {isActive ? '✓ Active' : 'Activer'}
                </button>
                <button className="leagues__btn" onClick={() => setEditing(league.id)}>Modifier</button>
                {confirmDelete === league.id ? (
                  <>
                    <button
                      className="leagues__btn leagues__btn--delete"
                      onClick={() => { deleteLeague(league.id); setConfirmDelete(null); }}
                    >
                      Confirmer
                    </button>
                    <button className="leagues__btn" onClick={() => setConfirmDelete(null)}>
                      Annuler
                    </button>
                  </>
                ) : (
                  <button
                    className="leagues__btn leagues__btn--delete"
                    onClick={() => setConfirmDelete(league.id)}
                  >
                    Supprimer
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {editing && (
        <LeagueForm
          league={editTarget}
          knownPlayers={knownPlayers}
          onSave={(name, players, color) => {
            if (editing === 'new') createLeague(name, players, color);
            else updateLeague(editing, name, players, color);
            setEditing(null);
          }}
          onCancel={() => setEditing(null)}
        />
      )}

      {joining && (
        <IdentityPicker
          league={joining}
          knownPlayers={knownPlayers}
          onClose={() => setJoining(null)}
        />
      )}
    </div>
  );
}

function LeagueForm({ league, knownPlayers, onSave, onCancel }) {
  const [name, setName] = useState(league?.name ?? '');
  const [players, setPlayers] = useState(league?.players ?? []);
  const [color, setColor] = useState(league?.color ?? SWATCHES[0].hex);

  function togglePlayer(p) {
    setPlayers(prev => prev.includes(p) ? prev.filter(x => x !== p) : [...prev, p]);
  }

  function submit(e) {
    e.preventDefault();
    if (!name.trim() || players.length === 0) return;
    onSave(name.trim(), players, color);
  }

  return (
    <div className="leagues__overlay" onClick={onCancel}>
      <form className="leagues__form" onClick={e => e.stopPropagation()} onSubmit={submit}>
        <h2 className="leagues__form-title">{league ? 'Modifier la ligue' : 'Lancer une ligue'}</h2>

        <label className="leagues__label">Nom de la ligue</label>
        <input
          className="leagues__input"
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="Ex: Ligue du Bureau"
          maxLength={40}
          autoFocus
        />

        <label className="leagues__label">Couleur de la ligue</label>
        <div className="leagues__colors">
          {SWATCHES.map(({ hex, name }) => (
            <button
              key={hex}
              type="button"
              className={`leagues__swatch${color.toLowerCase() === hex.toLowerCase() ? ' leagues__swatch--on' : ''}`}
              style={{ background: hex }}
              onClick={() => setColor(hex)}
              aria-label={name}
              aria-pressed={color.toLowerCase() === hex.toLowerCase()}
            />
          ))}
        </div>

        <label className="leagues__label">Joueurs ({players.length} sélectionné{players.length !== 1 ? 's' : ''})</label>
        {knownPlayers && knownPlayers.length > 0 ? (
          <div className="leagues__player-chips">
            {knownPlayers.map(p => (
              <button
                key={p}
                type="button"
                className={`leagues__chip${players.includes(p) ? ' leagues__chip--on' : ''}`}
                onClick={() => togglePlayer(p)}
              >
                {players.includes(p) && <span>✓ </span>}{p}
              </button>
            ))}
          </div>
        ) : (
          <p className="leagues__empty">Joue quelques parties pour voir les joueurs ici.</p>
        )}

        <div className="leagues__form-actions">
          <button type="button" className="leagues__btn" onClick={onCancel}>Annuler</button>
          <button
            type="submit"
            className="leagues__btn leagues__btn--primary"
            disabled={!name.trim() || players.length === 0}
          >
            {league ? 'Enregistrer' : 'Lancer'}
          </button>
        </div>
      </form>
    </div>
  );
}
