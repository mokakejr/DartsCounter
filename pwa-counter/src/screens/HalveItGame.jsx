import { useState, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  HALVEIT_SEQUENCES, roundLabel, initialHalveItState, scoreRound, leader,
} from '../modes/halveIt.js';
import { postGame } from '../postGame.js';
import ExitConfirmModal from './ExitConfirmModal.jsx';
import ElapsedTimer from '../components/ElapsedTimer.jsx';
import './HalveItGame.css';

export default function HalveItGame() {
  const { state } = useLocation();
  const navigate = useNavigate();
  const players = state?.players ?? ['Joueur 1', 'Joueur 2'];
  const isSeqShort = state?.variant === 'short';
  const sequence = HALVEIT_SEQUENCES[isSeqShort ? 'short' : 'standard'];

  const [game, setGame] = useState(() => initialHalveItState(players, sequence));
  const [input, setInput] = useState('');
  const [phase, setPhase] = useState('playing'); // 'playing' | 'finished'
  const [showExit, setShowExit] = useState(false);
  // [{game}] — undo traverses confirmed turns too
  const [history, setHistory] = useState([]);
  const startedAt = useRef(Date.now());

  const player = game.currentPlayer;
  const target = sequence[game.currentRound];
  const points = parseInt(input, 10) || 0;
  const willHalve = input !== '' && points === 0;
  const currentScore = game.scores[player];

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
    setHistory(h => [...h, { game }]);
    const scored = scoreRound(game, player, points);
    if (scored.finished) {
      const win = leader(scored);
      postGame({
        mode: 'HalveIt',
        variant: isSeqShort ? 'Short' : 'Standard',
        players, scores: scored.scores,
        winner: win !== null ? players[win] : '',
        startedAt: startedAt.current,
        isCasual: true,
      });
    }
    setGame(scored);
    setPhase(scored.finished ? 'finished' : 'playing');
    setInput('');
  }

  function undo() {
    if (!history.length) return;
    const prev = history[history.length - 1];
    setGame(prev.game);
    setHistory(h => h.slice(0, -1));
    setInput('');
  }

  // ── Finished screen
  if (phase === 'finished') {
    const win = leader(game);
    const ranked = players
      .map((name, i) => ({ name, score: game.scores[i] }))
      .sort((a, b) => b.score - a.score);
    return (
      <div className="hi hi--finished">
        <p className="hi__fin-eyebrow">FIN DE PARTIE</p>
        <div className="hi__podium">
          {ranked.map((r, rank) => (
            <div key={r.name} className={`hi__podium-row${rank === 0 ? ' hi__podium-row--first' : ''}`}>
              <span className="hi__podium-rank">#{rank + 1}</span>
              <span className="hi__podium-name">{r.name}</span>
              <span className="hi__podium-pts">{r.score} pts</span>
            </div>
          ))}
          {win === null && <p className="hi__podium-tie">Égalité !</p>}
        </div>
        <div className="hi__fin-actions">
          <button
            className="hi__btn hi__btn--secondary"
            onClick={() => navigate('/setup', { state: { mode: 'halveIt', isCasual: true, variant: state?.variant } })}
          >
            REJOUER
          </button>
          <button className="hi__btn hi__btn--primary" onClick={() => navigate('/')}>
            ACCUEIL
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="hi">
      <ExitConfirmModal
        open={showExit}
        onConfirm={() => navigate('/')}
        onCancel={() => setShowExit(false)}
      />
      <div className="hi__header">
        <button className="hi__back" onClick={() => setShowExit(true)}>←</button>
        <div className="hi__round-badge">
          R<span className="hi__round-num">{game.currentRound + 1}</span>
          <span className="hi__round-sep">/</span>
          {sequence.length}
        </div>
        <ElapsedTimer startedAt={startedAt.current} />
      </div>

      <div className="hi__target">
        <div className="hi__target-ring">
          <span className="hi__target-num">{roundLabel(target)}</span>
        </div>
        <p className="hi__target-label">CIBLE</p>
      </div>

      {/* Current player */}
      <div className="hi__player">
        <span className="hi__player-name">{players[player]}</span>
        <span className="hi__player-total">{currentScore} pts</span>
      </div>

      {/* Score entry display */}
      <div className={`hi__display${willHalve ? ' hi__display--halve' : points > 0 ? ' hi__display--ok' : ''}`}>
        <span className="hi__display-num">{input || '0'}</span>
        <span className="hi__display-hint">
          {willHalve
            ? `0 point → total divisé par 2 (${Math.floor(currentScore / 2)})`
            : points > 0
              ? `+${points} pts`
              : 'points marqués ce tour'}
        </span>
      </div>

      {/* Numpad */}
      <div className="hi__pad">
        {[7, 8, 9, 4, 5, 6, 1, 2, 3].map(d => (
          <button key={d} className="hi__key" onClick={() => pressDigit(String(d))}>
            {d}
          </button>
        ))}
        <button className="hi__key hi__key--back" onClick={pressBack}>⌫</button>
        <button className="hi__key" onClick={() => pressDigit('0')}>0</button>
        <button
          className={`hi__key hi__key--ok${input !== '' ? ' hi__key--ok-active' : ''}`}
          onClick={confirm}
          disabled={input === ''}
        >
          ✓
        </button>
      </div>

      {/* Undo */}
      <button className="hi__undo" onClick={undo} disabled={history.length === 0}>⟲ Annuler</button>

      {/* Score table */}
      <div className="hi__scores">
        {players.map((name, i) => (
          <div key={name} className={`hi__row${i === player ? ' hi__row--active' : ''}`}>
            <span className="hi__row-name">{name}</span>
            <span className="hi__row-val">{game.scores[i]}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
