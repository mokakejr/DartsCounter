import { useState, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  initialFiftyOneState, scoreTurn, nextPlayer, FIFTY_ONE_TARGET,
} from '../modes/fiftyOne.js';
import { hitPoints, hitLabel } from '../modes/board.js';
import { postGame } from '../postGame.js';
import ExitConfirmModal from './ExitConfirmModal.jsx';
import ElapsedTimer from '../components/ElapsedTimer.jsx';
import SvgBoard from '../components/SvgBoard.jsx';
import './FiftyOneGame.css';

// Dart-Wheel par défaut (Epic 4.1) — le numpad reste dispo via le toggle.
const INPUT_MODE_KEY = 'dartsInputMode';

export default function FiftyOneGame() {
  const { state } = useLocation();
  const navigate = useNavigate();
  const players = state?.players ?? ['J1', 'J2'];
  const isCasual = state?.isCasual ?? false;

  const [game, setGame] = useState(() => initialFiftyOneState(players));
  const [input, setInput] = useState('');
  const [boardDarts, setBoardDarts] = useState([]); // [{value, ring}] du tour
  const [inputMode, setInputMode] = useState(() => localStorage.getItem(INPUT_MODE_KEY) || 'board');
  const [phase, setPhase] = useState('playing'); // 'playing' | 'finished'
  const [showExit, setShowExit] = useState(false);
  // [{game}] — lets a player undo a confirmed turn, not just the in-progress input
  const [history, setHistory] = useState([]);
  const startedAt = useRef(Date.now());
  // Fléchettes réellement lancées par joueur — alimente extra.darts (XP Ferveur).
  const dartsThrown = useRef(Object.fromEntries(players.map(p => [p, 0])));

  const player = game.currentPlayer;
  const boardTotal = boardDarts.reduce((s, d) => s + hitPoints(d), 0);
  const turnTotal = inputMode === 'board' ? boardTotal : parseInt(input, 10) || 0;
  const divisible = turnTotal > 0 && turnTotal % 5 === 0;
  const fivesScored = divisible ? turnTotal / 5 : 0;
  const currentFives = game.fives[player];
  const wouldBust = divisible && currentFives + fivesScored > FIFTY_ONE_TARGET;
  const validScore = divisible && !wouldBust;

  function pressDigit(d) {
    setInput(prev => {
      const next = prev + d;
      return parseInt(next, 10) > 180 ? prev : next;
    });
  }

  function pressBack() {
    setInput(prev => prev.slice(0, -1));
  }

  function onBoardHit(hit) {
    if (phase !== 'playing' || boardDarts.length >= 3) return;
    setBoardDarts(prev => [...prev, hit]);
  }

  function toggleInputMode() {
    const next = inputMode === 'board' ? 'pad' : 'board';
    localStorage.setItem(INPUT_MODE_KEY, next);
    setInputMode(next);
    setInput('');
    setBoardDarts([]);
  }

  function confirm() {
    setHistory(h => [...h, { game }]);
    // Le nombre de fléchettes réellement lancées nourrit la Ferveur (XP).
    dartsThrown.current[players[player]] += inputMode === 'board' ? boardDarts.length : 3;
    // Invalid score (not multiple of 5, or bust) → pass turn with 0
    const scored = scoreTurn(game, player, validScore ? turnTotal : 0);
    if (scored.winner !== null) {
      postGame({
        mode: 'FiftyOne', variant: 'Normal',
        players, scores: players.map((_, i) => scored.fives[i]),
        winner: players[scored.winner],
        startedAt: startedAt.current,
        isCasual,
        extra: { darts: dartsThrown.current },
      });
      setGame(scored);
      setPhase('finished');
    } else {
      setGame(nextPlayer(scored));
    }
    setInput('');
    setBoardDarts([]);
  }

  function undo() {
    // En mode cible, retirer d'abord la dernière fléchette du tour en cours.
    if (inputMode === 'board' && boardDarts.length > 0) {
      setBoardDarts(prev => prev.slice(0, -1));
      return;
    }
    if (!history.length) return;
    const prev = history[history.length - 1];
    setGame(prev.game);
    setHistory(h => h.slice(0, -1));
    setInput('');
    setBoardDarts([]);
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
            onClick={() => navigate('/setup', { state: { mode: 'fiftyOne' } })}>
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
        onConfirm={() => navigate('/')}
        onCancel={() => setShowExit(false)}
      />
      <div className="f51__header">
        <button className="f51__back" onClick={() => setShowExit(true)}>←</button>
        <span className="f51__title">51</span>
        <ElapsedTimer startedAt={startedAt.current} />
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
        <span className="f51__display-num">
          {inputMode === 'board' ? turnTotal : (input || '0')}
        </span>
        <span className="f51__display-hint">
          {wouldBust
            ? 'BUST !'
            : divisible && fivesScored > 0
              ? `+${fivesScored} cinq${fivesScored > 1 ? 's' : ''}`
              : turnTotal > 0 && !divisible
                ? 'pas multiple de 5'
                : 'score du tour'}
        </span>
      </div>

      {inputMode === 'board' ? (
        <>
          {/* Dart-Wheel (Epic 4): two-tap, 3 fléchettes par tour */}
          <div className="f51__board-darts">
            {[0, 1, 2].map(i => (
              <span key={i} className={`f51__board-dart${boardDarts[i] ? ' f51__board-dart--filled' : ''}`}>
                {boardDarts[i] ? hitLabel(boardDarts[i]) : '·'}
              </span>
            ))}
          </div>
          <SvgBoard onHit={onBoardHit} darts={boardDarts} interactive={boardDarts.length < 3} />
          <button
            className={`f51__key f51__key--ok f51__key--confirm${validScore ? ' f51__key--ok-active' : ''}`}
            onClick={confirm}
          >
            ✓ VALIDER {turnTotal > 0 ? turnTotal : ''}
          </button>
        </>
      ) : (
        <div className="f51__pad">
          {[7, 8, 9, 4, 5, 6, 1, 2, 3].map(d => (
            <button key={d} className="f51__key" onClick={() => pressDigit(String(d))}>
              {d}
            </button>
          ))}
          <button className="f51__key f51__key--back" onClick={pressBack}>⌫</button>
          <button className="f51__key" onClick={() => pressDigit('0')}>0</button>
          <button
            className={`f51__key f51__key--ok${validScore ? ' f51__key--ok-active' : ''}`}
            onClick={confirm}
          >
            ✓
          </button>
        </div>
      )}

      <button className="f51__input-toggle" onClick={toggleInputMode}>
        {inputMode === 'board' ? '⌨️ Saisie clavier' : '🎯 Saisie sur cible'}
      </button>

      {/* Undo — traverses confirmed turns too */}
      <button className="f51__undo" onClick={undo} disabled={history.length === 0}>⟲ Annuler</button>
    </div>
  );
}
