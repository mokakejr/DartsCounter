import { useState, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { assignNumbers, initialKillerState, canTarget, playDart, eliminationScores } from '../modes/killer.js';
import { postGame } from '../postGame.js';
import ExitConfirmModal from './ExitConfirmModal.jsx';
import ElapsedTimer from '../components/ElapsedTimer.jsx';
import './KillerGame.css';

export default function KillerGame() {
  const { state } = useLocation();
  const navigate = useNavigate();
  const players = state?.players ?? ['Joueur 1', 'Joueur 2'];
  const lives = Number.isInteger(state?.lives) ? state.lives : 3;
  const isDoubleOnly = state?.variant === 'double';

  // Generated once per game, shared by every player.
  const [numbers] = useState(() => assignNumbers(players.length));
  const [game, setGame] = useState(() => initialKillerState(players, numbers, lives));
  const [phase, setPhase] = useState('playing'); // 'playing' | 'finished'
  const [showExit, setShowExit] = useState(false);
  const [history, setHistory] = useState([]); // previous game states, for undo
  const startedAt = useRef(Date.now());

  const thrower = game.players[game.currentPlayer];

  function finish(ng) {
    postGame({
      mode: 'Killer',
      variant: isDoubleOnly ? 'Double Only' : 'Any',
      players,
      scores: eliminationScores(ng),
      winner: ng.winner,
      startedAt: startedAt.current,
      isCasual: true,
      extra: { eliminationOrder: ng.eliminationOrder, lives, numbers },
    });
    setGame(ng);
    setPhase('finished');
  }

  function throwDart(targetIndex) {
    setHistory(h => [...h, game]);
    const next = playDart(game, targetIndex);
    if (next.finished) {
      finish(next);
    } else {
      setGame(next);
    }
  }

  function undo() {
    if (!history.length) return;
    setGame(history[history.length - 1]);
    setHistory(h => h.slice(0, -1));
  }

  // ── Finished screen
  if (phase === 'finished') {
    const podium = [game.winner, ...[...game.eliminationOrder].reverse()];
    return (
      <div className="kg kg--finished">
        <p className="kg__fin-eyebrow">FIN DE PARTIE</p>
        <div className="kg__podium">
          {podium.map((name, rank) => (
            <div key={name} className={`kg__podium-row${rank === 0 ? ' kg__podium-row--first' : ''}`}>
              <span className="kg__podium-rank">#{rank + 1}</span>
              <span className="kg__podium-name">{name}</span>
            </div>
          ))}
        </div>
        <div className="kg__fin-actions">
          <button
            className="kg__btn kg__btn--secondary"
            onClick={() => navigate('/setup', { state: { mode: 'killer', isCasual: true, variant: state?.variant, lives } })}
          >
            REJOUER
          </button>
          <button className="kg__btn kg__btn--primary" onClick={() => navigate('/')}>
            ACCUEIL
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="kg">
      <ExitConfirmModal
        open={showExit}
        onConfirm={() => navigate('/')}
        onCancel={() => setShowExit(false)}
      />

      <div className="kg__header">
        <button className="kg__back" onClick={() => setShowExit(true)}>←</button>
        <span className="kg__title">KILLER{isDoubleOnly ? ' · DOUBLE' : ''}</span>
        <ElapsedTimer startedAt={startedAt.current} />
      </div>

      <div className="kg__player">
        <span className="kg__player-name">{thrower.name}</span>
        <span className="kg__player-sub">
          N°{thrower.number} · {thrower.isKiller ? 'Killer 🔪' : 'Pas encore killer'} · dart {game.dartsThisTurn + 1}/3
        </span>
      </div>

      {/* Targets — MISS + one button per active player. Opponents are
          disabled until the thrower has become a killer. */}
      <div className="kg__targets">
        <button className="kg__target kg__target--miss" onClick={() => throwDart(null)}>
          MANQUÉ
        </button>
        {game.players.map((p, i) => {
          if (p.eliminated) return null;
          const enabled = canTarget(game, game.currentPlayer, i);
          const isSelf = i === game.currentPlayer;
          return (
            <button
              key={p.name}
              className={`kg__target${isSelf ? ' kg__target--self' : ''}`}
              disabled={!enabled}
              onClick={() => throwDart(i)}
            >
              <span className="kg__target-name">{p.name}{isSelf ? ' (toi)' : ''}</span>
              <span className="kg__target-num">{isDoubleOnly ? `D${p.number}` : `N°${p.number}`}</span>
            </button>
          );
        })}
      </div>

      {/* Undo */}
      <button className="kg__undo" onClick={undo} disabled={history.length === 0}>⟲ Annuler</button>

      {/* Status table */}
      <div className="kg__status">
        {game.players.map((p, i) => (
          <div
            key={p.name}
            className={`kg__status-row${p.eliminated ? ' kg__status-row--out' : ''}${i === game.currentPlayer ? ' kg__status-row--active' : ''}`}
          >
            <span className="kg__status-name">{p.name}</span>
            <span className="kg__status-num">N°{p.number}</span>
            <span className="kg__status-killer">{p.isKiller && !p.eliminated ? '🔪' : ''}</span>
            <span className="kg__status-lives">{p.eliminated ? 'ÉLIMINÉ' : '♥'.repeat(p.lives)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
