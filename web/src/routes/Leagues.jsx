import { useState } from 'react';
import { useLeague } from '../lib/useLeague.jsx';
import './Leagues.css';

export default function Leagues({ knownPlayers }) {
  const { leagues, activeLeague, activateLeague, createLeague, updateLeague, deleteLeague } = useLeague();
  const [editing, setEditing] = useState(null); // null | 'new' | league.id

  const editTarget = editing && editing !== 'new'
    ? leagues.find(l => l.id === editing)
    : null;

  return (
    <div className="leagues shell">
      <h1 className="leagues__title display">Ligues</h1>
      <p className="leagues__sub">
        Filtre les stats du dashboard par groupe de joueurs — sans modifier les données.
      </p>

      <button className="leagues__new" onClick={() => setEditing('new')}>
        + Créer une ligue
      </button>

      {leagues.length === 0 && !editing && (
        <p className="leagues__empty">Aucune ligue créée. Commence par en créer une !</p>
      )}

      <div className="leagues__list">
        {leagues.map(league => (
          <div
            key={league.id}
            className={`leagues__card${activeLeague?.id === league.id ? ' leagues__card--active' : ''}`}
          >
            <div className="leagues__card-head">
              <span className="leagues__card-name">{league.name}</span>
              <span className="leagues__card-count">{league.players.length} joueur{league.players.length !== 1 ? 's' : ''}</span>
            </div>
            <p className="leagues__card-players">{league.players.join(' · ')}</p>
            <div className="leagues__card-actions">
              <button
                className={`leagues__btn leagues__btn--activate${activeLeague?.id === league.id ? ' leagues__btn--on' : ''}`}
                onClick={() => activateLeague(league.id)}
              >
                {activeLeague?.id === league.id ? '✓ Active' : 'Activer'}
              </button>
              <button className="leagues__btn" onClick={() => setEditing(league.id)}>Modifier</button>
              <button
                className="leagues__btn leagues__btn--delete"
                onClick={() => { if (confirm(`Supprimer "${league.name}" ?`)) deleteLeague(league.id); }}
              >
                Supprimer
              </button>
            </div>
          </div>
        ))}
      </div>

      {editing && (
        <LeagueForm
          league={editTarget}
          knownPlayers={knownPlayers}
          onSave={(name, players) => {
            if (editing === 'new') createLeague(name, players);
            else updateLeague(editing, name, players);
            setEditing(null);
          }}
          onCancel={() => setEditing(null)}
        />
      )}
    </div>
  );
}

function LeagueForm({ league, knownPlayers, onSave, onCancel }) {
  const [name, setName] = useState(league?.name ?? '');
  const [players, setPlayers] = useState(league?.players ?? []);

  function togglePlayer(p) {
    setPlayers(prev => prev.includes(p) ? prev.filter(x => x !== p) : [...prev, p]);
  }

  function submit(e) {
    e.preventDefault();
    if (!name.trim() || players.length === 0) return;
    onSave(name.trim(), players);
  }

  return (
    <div className="leagues__overlay" onClick={onCancel}>
      <form className="leagues__form" onClick={e => e.stopPropagation()} onSubmit={submit}>
        <h2 className="leagues__form-title">{league ? 'Modifier la ligue' : 'Nouvelle ligue'}</h2>

        <label className="leagues__label">Nom de la ligue</label>
        <input
          className="leagues__input"
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="Ex: Ligue du Bureau"
          maxLength={40}
          autoFocus
        />

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
            {league ? 'Enregistrer' : 'Créer'}
          </button>
        </div>
      </form>
    </div>
  );
}
