import { useState, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { initialRoundTheClockState, recordDart, currentTarget, RTC_TARGETS } from '../modes/roundTheClock.js';
import { postGame } from '../postGame.js';
import ExitConfirmModal from './ExitConfirmModal.jsx';
import ElapsedTimer from '../components/ElapsedTimer.jsx';
import { censorName } from '../censor.js';
import './RoundTheClockGame.css';

function fmtElapsed(ms) {
  const s = Math.floor(ms / 1000);
  const mm = String(Math.floor(s / 60)).padStart(2, '0');
  const ss = String(s % 60).padStart(2, '0');
  return `${mm}:${ss}`;
}

export default function RoundTheClockGame() {
  const { state } = useLocation();
  const navigate = useNavigate();
  const playerName = state?.players?.[0] ?? 'J1';

  const [game, setGame] = useState(() => initialRoundTheClockState(playerName));
  const [phase, setPhase] = useState('playing'); // 'playing' | 'finished'
  const [showExit, setShowExit] = useState(false);
  const [history, setHistory] = useState([]); // previous game states, for undo
  const [finalElapsed, setFinalElapsed] = useState(0);
  const startedAt = useRef(Date.now());

  function pickDart(hit) {
    setHistory(h => [...h, game]);
    const next = recordDart(game, hit);
    setGame(next);
    if (next.finished) {
      const elapsed = Date.now() - startedAt.current;
      setFinalElapsed(elapsed);
      postGame({
        mode: 'RoundTheClock',
        variant: null,
        players: [playerName],
        scores: [next.darts],
        winner: playerName,
        startedAt: startedAt.current,
        isCasual: true,
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
      <div className="rtc rtc--finished">
        <p className="rtc__eyebrow">TERMINÉ !</p>
        <div className="rtc__result">
          <span className="rtc__result-num">{fmtElapsed(finalElapsed)}</span>
          <span className="rtc__result-label">{game.darts} fléchettes lancées</span>
        </div>
        <div className="rtc__fin-actions">
          <button
            className="rtc__btn rtc__btn--secondary"
            onClick={() => navigate('/setup', { state: { mode: 'roundTheClock' } })}
          >
            REJOUER
          </button>
          <button className="rtc__btn rtc__btn--primary" onClick={() => navigate('/')}>
            ACCUEIL
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="rtc">
      <ExitConfirmModal
        open={showExit}
        onConfirm={() => navigate('/')}
        onCancel={() => setShowExit(false)}
      />
      <div className="rtc__header">
        <button className="rtc__back" onClick={() => setShowExit(true)}>←</button>
        <span className="rtc__title">ROUND THE CLOCK</span>
        <ElapsedTimer startedAt={startedAt.current} />
      </div>

      <div className="rtc__player">
        <span className="rtc__player-name">{censorName(playerName)}</span>
        <span className="rtc__player-sub">
          Cible {game.targetIndex + 1} / {RTC_TARGETS.length} · {game.darts} fléchette{game.darts === 1 ? '' : 's'}
        </span>
      </div>

      <div className="rtc__target">
        <span className="rtc__target-val">{currentTarget(game)}</span>
      </div>

      <p className="rtc__prompt">Cette fléchette a-t-elle touché la cible (n'importe quelle zone) ?</p>
      <div className="rtc__pad">
        <button className="rtc__key rtc__key--miss" onClick={() => pickDart(false)}>MANQUÉ</button>
        <button className="rtc__key rtc__key--hit" onClick={() => pickDart(true)}>TOUCHÉ ✓</button>
      </div>

      <button className="rtc__undo" onClick={undo} disabled={history.length === 0}>⟲ Annuler</button>
    </div>
  );
}
