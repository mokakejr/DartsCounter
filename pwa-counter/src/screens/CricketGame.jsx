import { useState, useEffect, useRef, Fragment } from 'react';
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
import EmoteSplash from '../components/EmoteSplash.jsx';
import ChatOverlay from '../components/ChatOverlay.jsx';
import Tribunes from '../components/Tribunes.jsx';
import { useLiveMatch } from '../useLiveMatch.js';
import { clearResume, loadResume, saveResume } from '../resume.js';
import VictoryOverlay from '../components/VictoryOverlay.jsx';
import { censorName } from '../censor.js';
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
  // Remote (Epic 13): chaque client ne saisit que ses propres tours, l'état
  // adverse arrive par les deltas WS.
  const remote = state?.remote ?? false;
  const me = state?.me ?? null;

  // Reprise apres reload accidentel : l'etat de jeu est snapshotte a chaque
  // coup (voir l'effet saveResume plus bas). Hors remote : l'état y est
  // resynchronisé par le serveur via STATE.
  const resume = remote ? null : loadResume(isSC ? '/super-cricket' : '/cricket', players);
  const [game, setGame] = useState(() =>
    resume?.game
    ?? (isSC
      ? initialSuperCricketState(players, variant === 'cutthroat' ? SC_MODE.CUT_THROAT : SC_MODE.NORMAL)
      : initialCricketState(players, variant === 'cutthroat' ? CRICKET_MODE.CUT_THROAT : CRICKET_MODE.NORMAL))
  );
  const [dartsUsed, setDartsUsed] = useState(resume?.dartsUsed ?? 0);
  const [multiplier, setMultiplier] = useState(1);
  // phase: 'playing' | 'turn-done' | 'finished'
  const [phase, setPhase] = useState(resume?.phase === 'turn-done' ? 'turn-done' : 'playing');
  // SC always uses the board (grid) view; Cricket remembers last choice
  const [view, setView] = useState(() => isSC ? 'apk' : loadView());
  const [history, setHistory] = useState([]); // [{game, dartsUsed, phase}]
  const [showExit, setShowExit] = useState(false);
  // null | {type:'double'|'triple'|'bedNumber'} | {type:'bedMultiplier', number}
  const [scoringDialog, setScoringDialog] = useState(null);
  const startedAt = useRef(Date.now());
  const liveId = state?.liveId ?? null;
  const [oppLeft, setOppLeft] = useState(false);
  // Fin à distance sans vainqueur (adversaire parti / inactivité) — pas de
  // VictoryOverlay sur un match avorté.
  const [remoteAborted, setRemoteAborted] = useState(false);
  // Les émissions passent par des useEffect([game]) : appliquer un delta
  // adverse re-déclencherait ces effects et renverrait l'état en boucle.
  // Le drapeau est posé avant chaque setGame entrant et relâché par un
  // effect placé APRÈS les deux émetteurs (ordre d'exécution garanti).
  const inbound = useRef(false);

  const labels = isSC ? SC_LABELS : CRICKET_LABELS;

  // Diffusion live (Epic 11) + Mode Focus (12.2) — comme 51/Shanghai.
  const { emit, emote, chatMessage } = useLiveMatch(liveId, remote ? me : players[0], {
    onEvent(e) {
      if (!remote) return;
      if (e.player_id && e.player_id !== me) setOppLeft(false); // il est vivant
      if (e.event === 'PLAYER_LEFT' && e.player_id !== me) {
        setOppLeft(true);
        return;
      }
      // NB: pour TURN_CHANGED le serveur pose player_id = event.player (le
      // NOUVEAU joueur), pas l'émetteur — on ne filtre les échos que sur les
      // deltas où player_id est bien l'expéditeur ; le reste est idempotent.
      if (e.event === 'SCORE_UPDATED' && e.scores) {
        if (e.player_id === me) return; // écho de mon propre delta
        inbound.current = true;
        setGame(g => ({
          ...g,
          points: players.map((n, i) => e.scores[n] ?? g.points[i]),
          marks: e.detail?.kind === 'cricket' && e.detail.marks ? e.detail.marks : g.marks,
        }));
      } else if (e.event === 'TURN_CHANGED' && e.player) {
        const idx = players.indexOf(e.player);
        if (idx !== -1) {
          inbound.current = true;
          setGame(g => ({ ...g, currentPlayer: idx }));
        }
        setDartsUsed(0);
        setMultiplier(1);
        setPhase('playing');
        setHistory([]); // un tour confirmé est déjà chez l'adversaire
      } else if (e.event === 'MATCH_FINISHED') {
        const idx = players.indexOf(e.winner);
        if (idx !== -1) {
          inbound.current = true;
          setGame(g => ({ ...g, winner: idx }));
        } else {
          setRemoteAborted(true);
        }
        setPhase('finished');
      } else if (e.event === 'STATE' && e.match) {
        // Reconnexion en pleine partie : le snapshot serveur fait foi
        // (points + tableau des marques via detail + tour).
        const m = e.match;
        inbound.current = true;
        setGame(g => ({
          ...g,
          points: players.map((n, i) => m.scores?.[n] ?? g.points[i]),
          marks: m.detail?.kind === 'cricket' && m.detail.marks ? m.detail.marks : g.marks,
          currentPlayer: Math.max(players.indexOf(m.turn_player), 0),
        }));
        if (m.finished) setPhase('finished');
      }
    },
  });
  const [focusMode, setFocusMode] = useState(false);
  function toggleFocus() {
    setFocusMode(f => {
      emit({ event: 'DND', enabled: !f });
      return !f;
    });
  }

  const player = game.currentPlayer;
  const isAPK = view === 'apk';
  // Handover (13.2): hors de mon tour, la saisie est verrouillée.
  const myTurn = !remote || players[player] === me;

  // Une synchro complète par évolution d'état : points + tableau des marques
  // (le spectateur suit l'avancée du Cricket cible par cible) — couvre tous
  // les chemins de saisie ET les undo sans instrumenter chaque handler.
  useEffect(() => {
    if (!remote && phase !== 'finished') {
      saveResume(isSC ? '/super-cricket' : '/cricket', players, { game, dartsUsed, phase , nav: state });
    }
    if (inbound.current) return; // delta adverse : ne pas le renvoyer
    emit({
      event: 'SCORE_UPDATED',
      scores: Object.fromEntries(players.map((n, i) => [n, game.points[i]])),
      detail: { kind: 'cricket', labels, marks: game.marks },
    });
  }, [game]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (inbound.current) return;
    emit({ event: 'TURN_CHANGED', player: players[game.currentPlayer] });
  }, [game.currentPlayer]); // eslint-disable-line react-hooks/exhaustive-deps

  // Relâche le drapeau une fois les émetteurs ci-dessus passés.
  useEffect(() => {
    inbound.current = false;
  }, [game]);

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

  // Undo traverses confirmed turns too — history is only cleared by leaving
  // the screen. Remote: l'historique est vidé aux frontières de tour, l'undo
  // reste donc borné à mon tour en cours (le re-broadcast via l'effect
  // SCORE_UPDATED auto-corrige l'écran adverse).
  function undo() {
    if (!history.length || !myTurn) return;
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
    emit({ event: 'MATCH_FINISHED', winner: players[next.winner] });
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
    if (phase !== 'playing' || !myTurn) return;
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
    if (!myTurn) return;
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
    if (phase !== 'playing' || !myTurn) return;
    if (!isAPK && dartsUsed >= 3) return;
    pushHistory();
    const used = dartsUsed + 1;
    setDartsUsed(used);
    if (!isAPK && used >= 3) setPhase('turn-done');
  }

  // ── Classic mode: multiplier + target buttons ──────────────────────────────

  function tapTarget(tIdx) {
    if (dartsUsed >= 3 || phase !== 'playing' || !myTurn) return;
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
    if (dartsUsed >= 3 || phase !== 'playing' || !myTurn) return;
    pushHistory();
    setMultiplier(1);
    const used = dartsUsed + 1;
    setDartsUsed(used);
    if (used >= 3) setPhase('turn-done');
  }

  // ── Shared ────────────────────────────────────────────────────────────────────────────

  function confirmTurn() {
    if (!myTurn) return;
    // Remote : un tour confirmé est déjà chez l'adversaire — l'undo ne doit
    // pas franchir la frontière du tour (13.2).
    if (remote) setHistory([]);
    else pushHistory();
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
        {!remoteAborted && (
          <VictoryOverlay winner={ranked[0]?.name} losers={ranked.slice(1).map(r => r.name)} />
        )}
        <p className="cg__eyebrow">FIN DE PARTIE</p>
        <div className="cg__podium">
          {ranked.map((r, rank) => (
            <div key={r.name} className={`cg__podium-row${rank === 0 ? ' cg__podium-row--first' : ''}`}>
              <span className="cg__podium-rank">#{rank + 1}</span>
              <span className="cg__podium-name">{censorName(r.name)}</span>
              <span className="cg__podium-pts">{r.pts} pts</span>
            </div>
          ))}
        </div>
        <Tribunes liveId={liveId} />
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
        onConfirm={() => {
          emit({ event: 'MATCH_FINISHED', aborted: true });
          clearResume();
          navigate('/');
        }}
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

      <EmoteSplash emote={focusMode ? null : emote} />
      <ChatOverlay message={focusMode ? null : chatMessage} />

      {/* Verrouillage hors tour (13.2) — bandeau fin plutôt qu'un overlay :
          on regarde les marques adverses tomber en direct. */}
      {remote && !myTurn && (
        <div className="cg__remote-banner">
          <span className="cg__remote-title">Au tour de {censorName(players[player])}…</span>
          <span className="cg__remote-sub">
            {oppLeft ? '⚠️ Déconnecté — il peut revenir avec le même lien' : 'saisie verrouillée'}
          </span>
        </div>
      )}

      {/* Header */}
      <div className="cg__header">
        <button className="cg__back" onClick={() => setShowExit(true)}>&larr;</button>
        {liveId && (
          <button
            className="cg__back"
            title={focusMode ? 'Emotes bloquées (Mode Focus)' : 'Bloquer les emotes des gradins'}
            onClick={toggleFocus}
          >
            {focusMode ? '🔕' : '🔔'}
          </button>
        )}
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
        <span className="cg__player-name">{censorName(players[player])}</span>
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
                  {censorName(name)}
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
              const canTap = isAPK && phase === 'playing' && !globClosed && myTurn;
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
            <button className="cg__btn cg__btn--primary cg__btn--wide" onClick={confirmTurn} disabled={!myTurn}>
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
                  disabled={dartsUsed >= 3 || !myTurn}
                >
                  {lbl}
                </button>
              ))}
              <button
                className="cg__tgt cg__tgt--miss"
                onClick={tapMiss}
                disabled={dartsUsed >= 3 || !myTurn}
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
