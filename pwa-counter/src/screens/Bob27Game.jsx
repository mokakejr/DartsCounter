import { useState, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { initialBob27State, scoreRound, isGameOver, BOB27_ROUNDS } from '../modes/bob27.js';
import { postGame } from '../postGame.js';
import ExitConfirmModal from './ExitConfirmModal.jsx';
import ElapsedTimer from '../components/ElapsedTimer.jsx';
import './Bob27Game.css';

const HIT_OPTIONS = [0, 1, 2, 3];

export default function Bob27Game() {
  const { state } = useLocation();
  const navigate = useNavigate();
  const playerName = state?.players?.[0] ?? 'J1';

  const [game, setGame] = useState(() => initialBob27State(playerName));
  const [phase, setPhase] = useState('playing'); // 'playing' | 'finished'
  const [showExit, setShowExit] = useState(false);
  const [history, setHistory] = useState([]); // previous game states, for undo
  const startedAt = useRef(Date.now());

  function pickHits(hits) {
    setHistory(h => [...h, game]);
    const next = scoreRound(game, hits);
    setGame(next);
    if (isGameOver(next)) {
      postGame({
        mode: 'Bob27',
        variant: null,
        players: [playerName],
        scores: [next.score],
        winner: playerName,
        startedAt: startedAt.current,
        isCasual: true,
        extra: { rounds_completed: next.history.length, busted: next.busted },
      });
      setPhase('finished');
    }
  }

  function undo() {
    if (!history.length) return;
    setGame(history[history.length - 1]);
    setHistory(h => h.slice(0, -1));
  }

  if (phase === 'finished') {
    return (
      <div className="bob27 bob27--finished">
        <p className="bob27__eyebrow">{game.busted ? 'BUST !' : 'PARTIE TERMINÉE'}</p>
        <div className="bob27__result">
          {game.busted ? (
            <>
              <span className="bob27__result-num">Round {game.round}</span>
              <span className="bob27__result-label">meilleur round atteint</span>
            </>
          ) : (
            <>
              <span className="bob27__result-num">{game.score}</span>
              <span className="bob27__result-label">score final</span>
            </>
          )}
        </div>
        <div className="bob27__fin-actions">
          <button
            className="bob27__btn bob27__btn--secondary"
            onClick={() => navigate('/setup', { state: { mode: 'bob27' } })}
          >
            REJOUER
          </button>
          <button className="bob27__btn bob27__btn--primary" onClick={() => navigate('/')}>
            ACCUEIL
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="bob27">
      <ExitConfirmModal
        open={showExit}
        onConfirm={() => navigate('/')}
        onCancel={() => setShowExit(false)}
      />
      <div className="bob27__header">
        <button className="bob27__back" onClick={() => setShowExit(true)}>←</button>
        <span className="bob27__title">BOB'S 27</span>
        <ElapsedTimer startedAt={startedAt.current} />
      </div>

      <div className="bob27__player">
        <span className="bob27__player-name">{playerName}</span>
        <span className="bob27__player-sub">Round {game.round} / {BOB27_ROUNDS}</span>
      </div>

      <div className="bob27__score">
        <span className="bob27__score-num">{game.score}</span>
        <span className="bob27__score-label">points</span>
      </div>

      <div className="bob27__target">
        <span className="bob27__target-label">CIBLE</span>
        <span className="bob27__target-val">Double {game.round}</span>
      </div>

      <p className="bob27__prompt">Combien de fléchettes ont touché le double ?</p>
      <div className="bob27__pad">
        {HIT_OPTIONS.map(hits => (
          <button key={hits} className="bob27__key" onClick={() => pickHits(hits)}>
            <span className="bob27__key-num">{hits}</span>
            <span className="bob27__key-delta">
              {hits > 0 ? `+${2 * game.round * hits}` : `−${2 * game.round}`}
            </span>
          </button>
        ))}
      </div>

      <button className="bob27__undo" onClick={undo} disabled={history.length === 0}>⟲ Annuler</button>
    </div>
  );
}
