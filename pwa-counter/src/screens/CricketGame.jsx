import { useState, useRef, Fragment } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  initialCricketState, addHit, nextPlayer,
  CRICKET_TARGETS, CRICKET_MODE, isGloballyClosed,
} from '../modes/cricket.js';
import {
  initialSuperCricketState, addStandardHit, addSpecialMark, addSpecialScoring,
  nextPlayer as scNext, SC_TARGET_COUNT, SC_MODE,
  SC_IDX_DOUBLE, SC_IDX_TRIPLE, SC_IDX_BED,
} from '../modes/superCricket.js';
import { postGame } from '../postGame.js';
import ExitConfirmModal from './ExitConfirmModal.jsx';
import ElapsedTimer from '../components/ElapsedTimer.jsx';
import VictoryOverlay from '../components/VictoryOverlay.jsx';
import './CricketGame.css';

const CRICKET_LABELS = ['20', '19', '18', '17', '16', '15', 'BULL'];
const SC_LABELS = [...CRICKET_LABELS, 'DBL', 'TRP', 'BED'];

const NUMBER_GRID = Array.from({ length: 4 }, (_, r) =>
  Array.from({ length: 5 }, (_, c) => r * 5 + c + 1)
);
const MULTIPLIER_ROWS = [[3, 4, 5, 6], [7, 8, 9]];

const VIEW_KEY = 'dartsViewMode'; // 'apk' | 'classic'
function loadView() {
  return localStorage.getItem(VIEW_KEY) === 'classic' ? 'classic' : 'apk';
}

function playSound(name) {
  const src = name === 'mexicaine'
    ? `/sounds/mexicaine${Math.random() < 0.5 ? 1 : 2}.wav`
    : `/sounds/${name}.wav`;
  new Audio(src).play().catch(() => {});
}

function markSym(m) {
  if (!m) return ' ';
  if (m === 1) return '/';
  if (m === 2) return 'X';
  return '●';
}

function markSymClass(m, globClosed) {
  if (m >= 3 && globClosed) return 'cg__mark--glob-closed';
  if (m >= 3) return 'cg__mark--closed';
  return '';
}

function NumberPickerModal({ title, includeBull, bullLabel = 'BULL — 50 pts', onSelect, onDismiss }) {
  return (
    <div className="cg__dlg-overlay" onClick={onDismiss}>
      <div className="cg__dlg" onClick={e => e.stopPropagation()}>
        <p className="cg__dlg-title">{title}</p>
        <div className="cg__dlg-grid">
          {NUMBER_GRID.flat().map(n => (
            <button key={n} className="cg__dlg-num" onClick={() => onSelect(n)}>{n}</button>
          ))}
        </div>
        {includeBull && (
          <button className="cg__dlg-bull" onClick={() => onSelect(25)}>{bullLabel}</button>
        )}
        <button className="cg__dlg-cancel" onClick={onDismiss}>Annuler</button>
      </div>
    </div>
  );
}

function MultiplierPickerModal({ number, onSelect, onBack, onDismiss }) {
  return (
    <div className="cg__dlg-overlay" onClick={onDismiss}>
      <div className="cg__dlg" onClick={e => e.stopPropagation()}>
        <p className="cg__dlg-title">BED : combien de fois ?</p>
        <p className="cg__dlg-sub">Nombre : {number}</p>
        <div className="cg__dlg-grid cg__dlg-grid--mult">
          {MULTIPLIER_ROWS.flat().map(m => (
            <button key={m} className="cg__dlg-mult" onClick={() => onSelect(m)}>
              <span className="cg__dlg-mult-x">&times;{m}</span>
              <span className="cg__dlg-mult-pts">{m * number} pts</span>
            </button>
          ))}
        </div>
        <div className="cg__dlg-actions">
          <button className="cg__dlg-cancel" onClick={onBack}>&#8617; Retour</button>
          <button className="cg__dlg-cancel" onClick={onDismiss}>Annuler</button>
        </div>
      </div>
    </div>
  );
}

export default function CricketGame() {
  const { state } = useLocation();
  const navigate = useNavigate();
  const players = state?.players ?? ['J1', 'J2'];
  const isSC = state?.mode === 'superCricket';
  const variant = state?.variant === 'cutthroat' ? 'cutthroat' : 'normal';
  const isCasual = state?.isCasual ?? false;
  const variantLabel = variant === 'cutthroat' ? 'CutThroat' : 'Normal';

  const [game, setGame] = useState(() =>
    isSC
      ? initialSuperCricketState(players, variant === 'cutthroat' ? SC_MODE.CUT_THROAT : SC_MODE.NORMAL)
      : initialCricketState(players, variant === 'cutthroat' ? CRICKET_MODE.CUT_THROAT : CRICKET_MODE.NORMAL)
  );
  const [dartsUsed, setDartsUsed] = useState(0);
  const [multiplier, setMultiplier] = useState(1);
  // phase: 'playing' | 'turn-done' | 'finished'
  const [phase, setPhase] = useState('playing');
  // SC always uses the board (grid) view; Cricket remembers last choice
  const [view, setView] = useState(() => isSC ? 'apk' : loadView());
  const [history, setHistory] = useState([]); // [{game, dartsUsed, phase}]
  const [showExit, setShowExit] = useState(false);
  // null | {type:'double'|'triple'|'bedNumber'} | {type:'bedMultiplier', number}
  const [scoringDialog, setScoringDialog] = useState(null);
  const startedAt = useRef(Date.now());

  const player = game.currentPlayer;
  const labels = isSC ? SC_LABELS : CRICKET_LABELS;
  const isAPK = view === 'apk';

  function switchView(v) {
    setView(v);
    localStorage.setItem(VIEW_KEY, v);
    if (v === 'classic' && phase === 'playing' && dartsUsed >= 3) {
      setPhase('turn-done');
    }
  }

  function pushHistory() {
    setHistory(h => [...h, { game, dartsUsed, phase }]);
  }

  // Undo traverses confirmed turns too — history is only cleared by leaving the screen.
  function undo() {
    if (!history.length) return;
    const prev = history[history.length - 1];
    setGame(prev.game);
    setDartsUsed(prev.dartsUsed);
    setPhase(prev.phase);
    setMultiplier(1);
    setScoringDialog(null);
    setHistory(h => h.slice(0, -1));
  }

  function finishIfWon(next, mode) {
    if (next.winner === null) return false;
    postGame({
      mode, variant: variantLabel,
      players, scores: players.map((_, i) => next.points[i]),
      winner: players[next.winner],
      startedAt: startedAt.current,
      isCasual,
    });
    setPhase('finished');
    return true;
  }

  // ── APK mode: tap directly on board cell ────────────────────────────────────────────

  function tapCell(tIdx) {
    if (phase !== 'playing') return;
    // APK (table view): unlimited clicks — no 3-dart limit
    if (!isAPK && dartsUsed >= 3) return;

    // SC special targets (DBL/TRP/BED): once the player has closed it, further
    // taps score points via a number/multiplier picker instead of just marking.
    if (isSC && tIdx >= 7) {
      const alreadyClosed = game.marks[player][tIdx] >= 3;
      const globClosed = players.every((_, p) => game.marks[p][tIdx] >= 3);
      if (alreadyClosed && !globClosed) {
        setScoringDialog({ type: tIdx === SC_IDX_DOUBLE ? 'double' : tIdx === SC_IDX_TRIPLE ? 'triple' : 'bedNumber' });
        return;
      }
    }

    pushHistory();
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
    if (!finishIfWon(next, isSC ? 'SuperCricket' : 'Cricket') && !isAPK && used >= 3) {
      // Classic mode only: auto-transition after 3 darts
      setPhase('turn-done');
    }
  }

  // ── SC scoring dialogs: DOUBLE/TRIPLE/BED points once the target is closed ──

  function applySpecialScoring(targetIdx, pts) {
    pushHistory();
    const next = addSpecialScoring(game, player, targetIdx, pts);
    setGame(next);
    setScoringDialog(null);
    setDartsUsed(d => d + 1);
    finishIfWon(next, 'SuperCricket');
  }

  function pickDoubleNumber(number) {
    applySpecialScoring(SC_IDX_DOUBLE, number === 25 ? 50 : 2 * number);
  }

  function pickTripleNumber(number) {
    applySpecialScoring(SC_IDX_TRIPLE, 3 * number);
  }

  function pickBedNumber(number) {
    setScoringDialog({ type: 'bedMultiplier', number });
  }

  function pickBedMultiplier(mult) {
    applySpecialScoring(SC_IDX_BED, mult * scoringDialog.number);
  }

  function tapMissAPK() {
    if (phase !== 'playing') return;
    if (!isAPK && dartsUsed >= 3) return;
    pushHistory();
    const used = dartsUsed + 1;
    setDartsUsed(used);
    if (!isAPK && used >= 3) setPhase('turn-done');
  }

  // ── Classic mode: multiplier + target buttons ──────────────────────────────

  function tapTarget(tIdx) {
    if (dartsUsed >= 3 || phase !== 'playing') return;
    pushHistory();
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
    if (!finishIfWon(next, isSC ? 'SuperCricket' : 'Cricket') && used >= 3) {
      setPhase('turn-done');
    }
  }

  function tapMiss() {
    if (dartsUsed >= 3 || phase !== 'playing') return;
    pushHistory();
    setMultiplier(1);
    const used = dartsUsed + 1;
    setDartsUsed(used);
    if (used >= 3) setPhase('turn-done');
  }

  // ── Shared ────────────────────────────────────────────────────────────────────────────

  function confirmTurn() {
    pushHistory();
    setGame(g => isSC ? scNext(g) : nextPlayer(g));
    setDartsUsed(0);
    setMultiplier(1);
    setPhase('playing');
  }

  // ── Finished screen ────────────────────────────────────────────────────────────
  if (phase === 'finished') {
    const ranked = players
      .map((name, i) => ({ name, pts: game.points[i] }))
      .sort((a, b) => variant === 'cutthroat' ? a.pts - b.pts : b.pts - a.pts);
    return (
      <div className="cg cg--finished">
        <VictoryOverlay winner={ranked[0]?.name} losers={ranked.slice(1).map(r => r.name)} />
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
            onClick={() => navigate('/setup', { state: { mode: isSC ? 'superCricket' : 'cricket', variant } })}>
            REJOUER
          </button>
          <button className="cg__btn cg__btn--primary" onClick={() => navigate('/')}>ACCUEIL</button>
        </div>
      </div>
    );
  }

  return (
    <div className={`cg${isSC ? ' cg--sc' : ''}`}>
      <ExitConfirmModal
        open={showExit}
        onConfirm={() => navigate('/')}
        onCancel={() => setShowExit(false)}
      />

      {scoringDialog?.type === 'double' && (
        <NumberPickerModal title="Double : quel nombre ?" includeBull onSelect={pickDoubleNumber} onDismiss={() => setScoringDialog(null)} />
      )}
      {scoringDialog?.type === 'triple' && (
        <NumberPickerModal title="Triple : quel nombre ?" includeBull={false} onSelect={pickTripleNumber} onDismiss={() => setScoringDialog(null)} />
      )}
      {scoringDialog?.type === 'bedNumber' && (
        <NumberPickerModal title="BED : quel nombre ?" includeBull bullLabel="BULL — 25" onSelect={pickBedNumber} onDismiss={() => setScoringDialog(null)} />
      )}
      {scoringDialog?.type === 'bedMultiplier' && (
        <MultiplierPickerModal
          number={scoringDialog.number}
          onSelect={pickBedMultiplier}
          onBack={() => setScoringDialog({ type: 'bedNumber' })}
          onDismiss={() => setScoringDialog(null)}
        />
      )}

      {/* Header */}
      <div className="cg__header">
        <button className="cg__back" onClick={() => setShowExit(true)}>&larr;</button>
        <div className="cg__title-wrap">
          <span className="cg__title">{isSC ? 'SUPER CRICKET' : 'CRICKET'}</span>
          {variant === 'cutthroat' && <span className="cg__title-sub">CUT THROAT</span>}
          <ElapsedTimer startedAt={startedAt.current} />
        </div>
      </div>

      {/* View toggle — Super Cricket's DBL/TRP/BED scoring dialogs only exist in the board view */}
      {!isSC && (
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
      )}

      {/* Current player */}
      <div className="cg__player">
        <span className="cg__player-name">{players[player]}</span>
        <span className="cg__player-pts">{game.points[player]} pts</span>
      </div>

      {/* Score board */}
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
              // APK mode: no dartsUsed limit — unlimited clicks
              const canTap = isAPK && phase === 'playing' && !globClosed;
              const isSpecial = isSC && tIdx >= 7;
              return (
                <Fragment key={lbl}>
                  {isSC && tIdx === 7 && (
                    <tr className="cg__row-sc-divider">
                      <td colSpan={players.length + 1} />
                    </tr>
                  )}
                  <tr className={globClosed ? 'cg__row--closed' : ''}>
                    <td className={`cg__td-lbl${isSpecial ? ' cg__td-lbl--special' : ''}`}>{lbl}</td>
                    {players.map((_, pIdx) => {
                      const isCurrentPlayer = pIdx === player;
                      const tappable = canTap && isCurrentPlayer;
                      const m = game.marks[pIdx][tIdx];
                      const scSpecialClosed = isSpecial && m >= 3 && !globClosed;
                      return (
                        <td
                          key={pIdx}
                          className={[
                            'cg__td-mark',
                            isCurrentPlayer ? 'cg__td-mark--active' : '',
                            tappable ? 'cg__td-mark--tappable' : '',
                            scSpecialClosed ? 'cg__td-mark--sc-special-closed' : '',
                          ].filter(Boolean).join(' ')}
                          onClick={tappable ? () => tapCell(tIdx) : undefined}
                        >
                          <span className={markSymClass(m, globClosed)}>
                            {markSym(m)}
                          </span>
                        </td>
                      );
                    })}
                  </tr>
                </Fragment>
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

      {/* Controls — fixed min-height via CSS keeps board height stable on view switch */}
      <div className="cg__controls">
        {/* APK mode: MISS / MEXICAINE / GAUFRE sound buttons */}
        {isAPK && phase === 'playing' && (
          <div className="cg__sound-row">
            <button
              className="cg__sound-btn cg__sound-btn--miss"
              onClick={() => { playSound('miss'); tapMissAPK(); }}
            >
              MISS
            </button>
            <button
              className="cg__sound-btn cg__sound-btn--mex"
              onClick={() => playSound('mexicaine')}
            >
              MEXICAINE
            </button>
            <button
              className="cg__sound-btn cg__sound-btn--gaufre"
              onClick={() => playSound('gaufre')}
            >
              GAUFRE
            </button>
          </div>
        )}

        {/* SUIVANT — APK: always visible while playing; Classic: only after 3 darts */}
        {(isAPK ? phase === 'playing' : phase === 'turn-done') && (
          <div className="cg__confirm">
            <button className="cg__btn cg__btn--primary cg__btn--wide" onClick={confirmTurn}>
              SUIVANT &rarr;
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
                  &times;{m}
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

        {/* Annuler — always rendered, disabled when no history */}
        <div className="cg__undo-wrap">
          <button
            className="cg__btn--undo"
            onClick={undo}
            disabled={history.length === 0}
          >
            &#8635; Annuler
          </button>
        </div>
      </div>
    </div>
  );
}
