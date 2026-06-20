import { useState, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  initialCricketState, addHit, nextPlayer,
  CRICKET_TARGETS, CRICKET_MODE, isGloballyClosed,
} from '../../play/models/cricket.js';
import {
  initialSuperCricketState, addStandardHit, addSpecialMark,
  nextPlayer as scNext, SC_TARGET_COUNT, SC_MODE,
} from '../../play/models/superCricket.js';
import { postGame } from '../../play/postGame.js';
import './CricketGame.css';

const CRICKET_LABELS = ['20', '19', '18', '17', '16', '15', 'BULL'];
const SC_LABELS = [...CRICKET_LABELS, 'DBL', 'TRP', 'BED'];

const VIEW_KEY = 'dartsViewMode'; // 'apk' | 'classic'
function loadView() {
  return localStorage.getItem(VIEW_KEY) === 'classic' ? 'classic' : 'apk';
}

function markSym(m) {
  if (!m) return '';
  if (m === 1) return '/';
  if (m === 2) return 'X';
  return '●';
}

export default function CricketGame() {
  const { state } = useLocation();
  const navigate = useNavigate();
  const players = state?.players ?? ['J1', 'J2'];
  const isSC = state?.mode === 'superCricket';

  const [game, setGame] = useState(() =>
    isSC
      ? initialSuperCricketState(players, SC_MODE.NORMAL)
      : initialCricketState(players, CRICKET_MODE.NORMAL)
  );
  const [dartsUsed, setDartsUsed] = useState(0);
  const [multiplier, setMultiplier] = useState(1);
  // phase: 'playing' | 'turn-done' | 'finished'
  const [phase, setPhase] = useState('playing');
  const [view, setView] = useState(loadView);
  const startedAt = useRef(Date.now());

  const player = game.currentPlayer;
  const labels = isSC ? SC_LABELS : CRICKET_LABELS;

  function switchView(v) {
    setView(v);
    localStorage.setItem(VIEW_KEY, v);
  }

  // ── APK mode: tap directly on board cell ──────────────────────────────────

  function tapCell(tIdx) {
    if (dartsUsed >= 3 || phase !== 'playing') return;
    let next = game;
    if (isSC) {
      if (tIdx < 7) next = addStandardHit(next, player, tIdx);
      else next = addSpecialMark(next, player, tIdx);
    } else {
      next = addHit(next, player, tIdx, 1);
    }
    setGame(next);
    const used = dartsUsed + 1;
    setDartsUsed(used);
    if (next.winner !== null) {
      postGame({
        mode: isSC ? 'SuperCricket' : 'Cricket', variant: 'Normal',
        players, scores: players.map((_, i) => next.points[i]),
        winner: players[next.winner],
        startedAt: startedAt.current,
      });
      setPhase('finished');
    } else if (used >= 3) {
      setPhase('turn-done');
    }
  }

  function tapMissAPK() {
    if (dartsUsed >= 3 || phase !== 'playing') return;
    const used = dartsUsed + 1;
    setDartsUsed(used);
    if (used >= 3) setPhase('turn-done');
  }

  // ── Classic mode: multiplier + target buttons ────────────────────────────

  function tapTarget(tIdx) {
    if (dartsUsed >= 3 || phase !== 'playing') return;
    let next = game;
    if (isSC) {
      if (tIdx < 7) {
        for (let i = 0; i < multiplier; i++) {
          next = addStandardHit(next, player, tIdx);
          if (next.winner !== null) break;
        }
      } else {
        next = addSpecialMark(next, player, tIdx);
      }
    } else {
      next = addHit(next, player, tIdx, multiplier);
    }
    setGame(next);
    setMultiplier(1);
    const used = dartsUsed + 1;
    setDartsUsed(used);
    if (next.winner !== null) {
      postGame({
        mode: isSC ? 'SuperCricket' : 'Cricket', variant: 'Normal',
        players, scores: players.map((_, i) => next.points[i]),
        winner: players[next.winner],
        startedAt: startedAt.current,
      });
      setPhase('finished');
    } else if (used >= 3) {
      setPhase('turn-done');
    }
  }

  function tapMiss() {
    if (dartsUsed >= 3 || phase !== 'playing') return;
    setMultiplier(1);
    const used = dartsUsed + 1;
    setDartsUsed(used);
    if (used >= 3) setPhase('turn-done');
  }

  // ── Shared ────────────────────────────────────────────────────────────────

  function confirmTurn() {
    setGame(g => isSC ? scNext(g) : nextPlayer(g));
    setDartsUsed(0);
    setMultiplier(1);
    setPhase('playing');
  }

  // ── Finished screen ───────────────────────────────────────────────────────
  if (phase === 'finished') {
    const ranked = players
      .map((name, i) => ({ name, pts: game.points[i] }))
      .sort((a, b) => b.pts - a.pts);
    return (
      <div className="cg cg--finished">
        <p className="cg__eyebrow">FIN DE PARTIE</p>
        <div className="cg__podium">
          {ranked.map((r, rank) => (
            <div key={r.name} className={`cg__podium-row${rank === 0 ? ' cg__podium-row--first' : ''}`}>
              <span className="cg__podium-rank">#{rank + 1}</span>
              <span className="cg__podium-name">{r.name}</span>
              <span className="cg__podium-pts">{r.pts} pts</span>
            </div>
          ))}
        </div>
        <div className="cg__fin-actions">
          <button className="cg__btn cg__btn--secondary"
            onClick={() => navigate('/play/setup', { state: { mode: isSC ? 'superCricket' : 'cricket' } })}>
            REJOUER
          </button>
          <button className="cg__btn cg__btn--primary" onClick={() => navigate('/')}>ACCUEIL</button>
        </div>
      </div>
    );
  }

  const isAPK = view === 'apk';

  return (
    <div className="cg">
      {/* Header */}
      <div className="cg__header">
        <button className="cg__back" onClick={() => navigate('/play')}>←</button>
        <span className="cg__title">{isSC ? 'SUPER CRICKET' : 'CRICKET'}</span>
        <div className="cg__dart-slots">
          {[0, 1, 2].map(i => (
            <span key={i} className={`cg__dart-slot${i < dartsUsed ? ' cg__dart-slot--used' : ''}`} />
          ))}
        </div>
      </div>

      {/* View toggle */}
      <div className="cg__view-toggle">
        <button
          className={`cg__view-btn${isAPK ? ' cg__view-btn--on' : ''}`}
          onClick={() => switchView('apk')}
        >
          Vue tableau
        </button>
        <button
          className={`cg__view-btn${!isAPK ? ' cg__view-btn--on' : ''}`}
          onClick={() => switchView('classic')}
        >
          Vue boutons
        </button>
      </div>

      {/* Current player */}
      <div className="cg__player">
        <span className="cg__player-name">{players[player]}</span>
        <span className="cg__player-pts">{game.points[player]} pts</span>
      </div>

      {/* Score board — always visible; cells tappable in APK mode */}
      <div className="cg__board-wrap">
        <table className="cg__board">
          <thead>
            <tr>
              <th className="cg__th-lbl" />
              {players.map((name, i) => (
                <th key={name} className={`cg__th${i === player ? ' cg__th--active' : ''}`}>
                  {name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {labels.map((lbl, tIdx) => {
              const globClosed = isSC
                ? players.every((_, p) => game.marks[p][tIdx] >= 3)
                : isGloballyClosed(game, tIdx);
              const canTap = isAPK && phase === 'playing' && dartsUsed < 3 && !globClosed;
              return (
                <tr key={lbl} className={globClosed ? 'cg__row--closed' : ''}>
                  <td className="cg__td-lbl">{lbl}</td>
                  {players.map((_, pIdx) => {
                    const isCurrentPlayer = pIdx === player;
                    const tappable = canTap && isCurrentPlayer;
                    return (
                      <td
                        key={pIdx}
                        className={[
                          'cg__td-mark',
                          isCurrentPlayer ? 'cg__td-mark--active' : '',
                          tappable ? 'cg__td-mark--tappable' : '',
                        ].filter(Boolean).join(' ')}
                        onClick={tappable ? () => tapCell(tIdx) : undefined}
                      >
                        {markSym(game.marks[pIdx][tIdx])}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
            <tr className="cg__row-pts">
              <td className="cg__td-lbl">PTS</td>
              {players.map((_, pIdx) => (
                <td key={pIdx} className={`cg__td-pts${pIdx === player ? ' cg__td-pts--active' : ''}`}>
                  {game.points[pIdx]}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>

      {/* APK mode: MISS button only */}
      {isAPK && phase === 'playing' && (
        <div className="cg__apk-miss">
          <button
            className="cg__btn cg__btn--miss"
            onClick={tapMissAPK}
            disabled={dartsUsed >= 3}
          >
            MISS
          </button>
        </div>
      )}

      {/* Classic mode: multiplier + target buttons */}
      {!isAPK && phase === 'playing' && (
        <div className="cg__input">
          <div className="cg__mult-row">
            {[1, 2, 3].map(m => (
              <button
                key={m}
                className={`cg__mult${multiplier === m ? ' cg__mult--on' : ''}`}
                onClick={() => setMultiplier(m)}
              >
                ×{m}
              </button>
            ))}
          </div>
          <div className="cg__tgt-row">
            {labels.map((lbl, tIdx) => (
              <button
                key={lbl}
                className="cg__tgt"
                onClick={() => tapTarget(tIdx)}
                disabled={dartsUsed >= 3}
              >
                {lbl}
              </button>
            ))}
            <button
              className="cg__tgt cg__tgt--miss"
              onClick={tapMiss}
              disabled={dartsUsed >= 3}
            >
              MISS
            </button>
          </div>
        </div>
      )}

      {phase === 'turn-done' && (
        <div className="cg__confirm">
          <button className="cg__btn cg__btn--primary cg__btn--wide" onClick={confirmTurn}>
            SUIVANT →
          </button>
        </div>
      )}
    </div>
  );
}
