import { useState, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  initialFiftyOneState, scoreTurn, nextPlayer, FIFTY_ONE_TARGET,
} from '../../play/models/fiftyOne.js';
import { postGame } from '../../play/postGame.js';
import ExitConfirmModal from './ExitConfirmModal.jsx';
import './FiftyOneGame.css';

export default function FiftyOneGame() {
  const { state } = useLocation();
  const navigate = useNavigate();
  const players = state?.players ?? ['J1', 'J2'];

  const [game, setGame] = useState(() => initialFiftyOneState(players));
  const [input, setInput] = useState('');
  const [phase, setPhase] = useState('playing'); // 'playing' | 'finished'
  const [showExit, setShowExit] = useState(false);
  const startedAt = useRef(Date.now());

  const player = game.currentPlayer;
  const turnTotal = parseInt(input, 10) || 0;
  const divisible = turnTotal > 0 && turnTotal % 5 === 0;
  const fivesScored = divisible ? turnTotal / 5 : 0;
  const currentFives = game.fives[player];
  const wouldBust = divisible && currentFives + fivesScored > FIFTY_ONE_TARGET;
  const canConfirm = !wouldBust && (turnTotal === 0 || divisible);

  function pressDigit(d) {
    setInput(prev => {
      const next = prev + d;
      return parseInt(next, 10) > 180 ? prev : next;
    });
  }

  function pressBack() {
    setInput(prev => prev.slice(0, -1));
  }

  function confirm() {
    if (!canConfirm) return;
    const scored = scoreTurn(game, player, turnTotal);
    if (scored.winner !== null) {
      postGame({
        mode: 'FiftyOne', variant: 'Normal',
        players, scores: players.map((_, i) => scored.fives[i]),
        winner: players[scored.winner],
        startedAt: startedAt.current,
      });
      setGame(scored);
      setPhase('finished');
    } else {
      setGame(nextPlayer(scored));
    }
    setInput('');
  }

  // ── Finished screen
  if (phase === 'finished') {
    const ranked = players
      .map((name, i) => ({ name, fives: game.fives[i] }))
      .sort((a, b) => b.fives - a.fives);
    return (
      <div className="f51 f51--finished">
        <p className="f51__eyebrow">FIN DE PARTIE</p>
        <div className="f51__podium">
          {ranked.map((r, rank) => (
            <div key={r.name} className={`f51__podium-row${rank === 0 ? ' f51__podium-row--first' : ''}`}>
              <span className="f51__podium-rank">#{rank + 1}</span>
              <span className="f51__podium-name">{r.name}</span>
              <span className="f51__podium-pts">{r.fives} / {FIFTY_ONE_TARGET}</span>
            </div>
          ))}
        </div>
        <div className="f51__fin-actions">
          <button className="f51__btn f51__btn--secondary"
            onClick={() => navigate('/play/setup', { state: { mode: 'fiftyOne' } })}>
            REJOUER
          </button>
          <button className="f51__btn f51__btn--primary" onClick={() => navigate('/')}>
            ACCUEIL
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="f51">
      <ExitConfirmModal
        open={showExit}
        onConfirm={() => navigate('/play')}
        onCancel={() => setShowExit(false)}
      />
      <div className="f51__header">
        <button className="f51__back" onClick={() => setShowExit(true)}>←</button>
        <span className="f51__title">51</span>
        <div style={{ width: 36 }} />
      </div>

      {/* Current player */}
      <div className="f51__player">
        <span className="f51__player-name">{players[player]}</span>
        <span className="f51__player-sub">{currentFives} / {FIFTY_ONE_TARGET} cinqs</span>
      </div>

      {/* Progress table */}
      <div className="f51__scores">
        {players.map((name, i) => {
          const fives = game.fives[i];
          const pct = (fives / FIFTY_ONE_TARGET) * 100;
          return (
            <div key={name} className={`f51__row${i === player ? ' f51__row--active' : ''}`}>
              <span className="f51__row-name">{name}</span>
              <div className="f51__bar-track">
                <div className="f51__bar-fill" style={{ width: `${pct}%` }} />
              </div>
              <span className="f51__row-val">{fives}</span>
            </div>
          );
        })}
      </div>

      {/* Score display */}
      <div className={`f51__display${wouldBust ? ' f51__display--bust' : divisible && fivesScored > 0 ? ' f51__display--ok' : ''}`}>
        <span className="f51__display-num">{input || '0'}</span>
        <span className="f51__display-hint">
          {wouldBust
            ? 'BUST !'
            : divisible && fivesScored > 0
              ? `+${fivesScored} cinq${fivesScored > 1 ? 's' : ''}`
              : input && !divisible
                ? 'pas multiple de 5'
                : 'score du tour'}
        </span>
      </div>

      {/* Numpad */}
      <div className="f51__pad">
        {[7, 8, 9, 4, 5, 6, 1, 2, 3].map(d => (
          <button key={d} className="f51__key" onClick={() => pressDigit(String(d))}>
            {d}
          </button>
        ))}
        <button className="f51__key f51__key--back" onClick={pressBack}>⌫</button>
        <button className="f51__key" onClick={() => pressDigit('0')}>0</button>
        <button
          className={`f51__key f51__key--ok${canConfirm ? ' f51__key--ok-active' : ''}`}
          disabled={!canConfirm}
          onClick={confirm}
        >
          OK
        </button>
      </div>
    </div>
  );
}
