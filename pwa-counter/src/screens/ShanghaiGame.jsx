import { useState, useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  initialShanghaiState,
  addScore,
  totalScore,
  isInstantWin,
  isBullTarget,
  leader,
  BULL,
} from '../modes/shanghai.js';
import { classicTargets, bullTargets, randomTargets, crazyTargets } from '../modes/shanghaiVariants.js';
import { postGame } from '../postGame.js';
import ExitConfirmModal from './ExitConfirmModal.jsx';
import ElapsedTimer from '../components/ElapsedTimer.jsx';
import SvgBoard from '../components/SvgBoard.jsx';
import VictoryOverlay from '../components/VictoryOverlay.jsx';
import EmoteSplash from '../components/EmoteSplash.jsx';
import ChatOverlay from '../components/ChatOverlay.jsx';
import Tribunes from '../components/Tribunes.jsx';
import { useLiveMatch } from '../useLiveMatch.js';
import { clearResume, loadResume, saveResume } from '../resume.js';
import { bigHit, smallHit } from '../juice.js';
import './ShanghaiGame.css';

const ZONES = [
  { zone: 0, label: 'MISS' },
  { zone: 1, label: '×1' },
  { zone: 2, label: '×2' },
  { zone: 3, label: '×3' },
];
const BULL_ZONES = [
  { zone: 0, label: 'MISS' },
  { zone: 1, label: 'BULL' },
  { zone: 2, label: 'D-BULL' },
];

// variant id (picked on the setup screen, same pattern as Cricket's
// Normal/Cut Throat) -> target generator
const TARGET_GENERATOR = {
  classic: classicTargets,
  bull: bullTargets,
  random: randomTargets,
  crazy: crazyTargets,
};
// variant id -> literal Game.mode posted to the backend (grouped under the
// same Elo scope server-side — see backend/app/models/elo.py MODE_FAMILY)
const BACKEND_MODE = {
  classic: 'Shanghai',
  bull: 'ShanghaiBull',
  random: 'ShanghaiRandom',
  crazy: 'ShanghaiCrazy',
};

export default function ShanghaiGame() {
  const { state } = useLocation();
  const navigate = useNavigate();
  const players = state?.players ?? ['Joueur 1', 'Joueur 2'];
  const isCasual = state?.isCasual ?? false;
  const liveId = state?.liveId ?? null;
  const shanghaiVariant = TARGET_GENERATOR[state?.variant] ? state.variant : 'classic';

  // Generated once per game, shared by every player — never previewed ahead
  // of the current round.
  // Reprise apres reload accidentel — les cibles tirees au sort (random/
  // crazy) doivent persister avec la partie, sinon tout change au reload.
  const resume = loadResume('/shanghai', players);
  const [targets] = useState(() => resume?.targets ?? TARGET_GENERATOR[shanghaiVariant]());
  const [game, setGame] = useState(() => resume?.game ?? initialShanghaiState(players, targets));
  const [darts, setDarts] = useState(resume?.darts ?? []);
  // pending: { pts, isShanghai, nextGame } — set when 3 darts entered, cleared on confirm
  const [pending, setPending] = useState(null);
  // phase: 'playing' | 'turn-done' | 'shanghai' | 'finished'
  const [phase, setPhase] = useState('playing');
  const [showExit, setShowExit] = useState(false);
  // [{game, darts, pending, phase}] — undo traverses confirmed turns too, not just the current one
  const [history, setHistory] = useState([]);
  const startedAt = useRef(Date.now());
  // Fléchettes lancées par joueur — alimente extra.darts (XP Ferveur).
  const dartsThrown = useRef(Object.fromEntries(players.map(p => [p, 0])));
  // Diffusion live (Epic 11) + Mode Focus (12.2).
  const { emit, emote, chatMessage } = useLiveMatch(liveId, players[0]);
  const [focusMode, setFocusMode] = useState(false);
  function toggleFocus() {
    setFocusMode(f => {
      emit({ event: 'DND', enabled: !f });
      return !f;
    });
  }

  useEffect(() => {
    if (phase === 'playing' || phase === 'turn-done') {
      saveResume('/shanghai', players, { game, targets, darts , nav: state });
    }
  }, [game, darts]); // eslint-disable-line react-hooks/exhaustive-deps

  const round = game.currentRound;
  const player = game.currentPlayer;
  const target = targets[round];
  const isBullRound = isBullTarget(target);
  const zones = isBullRound ? BULL_ZONES : ZONES;
  const turnPts = darts.reduce((s, z) => s + z * target, 0);

  function pushHistory() {
    setHistory(h => [...h, { game, darts, pending, phase }]);
  }

  function tapZone(zone) {
    if (phase !== 'playing' || darts.length >= 3) return;
    // Juice (Epic 4.4): impact lourd sur triple/double-bull, léger sinon.
    if (zone === 3 || (isBullRound && zone === 2)) bigHit();
    else if (zone > 0) smallHit();
    emit({
      event: 'DART_THROWN',
      player: players[player],
      dart_index: darts.length,
      score_hit: { multiplier: zone, zone: target },
    });
    pushHistory();
    setDarts(prev => [...prev, zone]);
  }

  // Tap direct sur la cible SVG: la zone à viser est en surbrillance, tout
  // le reste compte MISS (Epic 4.3). Le juice est géré par SvgBoard.
  function onBoardHit(hit) {
    if (phase !== 'playing' || darts.length >= 3) return;
    let zone = 0;
    if (hit.value === target) {
      if (isBullRound) zone = hit.ring === 'DBULL' ? 2 : 1;
      else zone = hit.ring === 'T' ? 3 : hit.ring === 'D' ? 2 : 1;
    }
    emit({
      event: 'DART_THROWN',
      player: players[player],
      dart_index: darts.length,
      score_hit: { multiplier: zone, zone: target },
    });
    pushHistory();
    setDarts(prev => [...prev, zone]);
  }

  // Commit turn once 3 darts are entered
  useEffect(() => {
    if (darts.length !== 3 || phase !== 'playing') return;
    const pts = darts.reduce((s, z) => s + z * target, 0);
    const shanghai = isInstantWin(darts, target);
    const nextGame = addScore(game, player, round, pts, shanghai);
    setPending({ pts, isShanghai: shanghai, nextGame });
    setPhase(shanghai ? 'shanghai' : 'turn-done');
  }, [darts]); // eslint-disable-line react-hooks/exhaustive-deps

  function undo() {
    if (!history.length) return;
    const prev = history[history.length - 1];
    setGame(prev.game);
    setDarts(prev.darts);
    setPending(prev.pending);
    setPhase(prev.phase);
    setHistory(h => h.slice(0, -1));
  }

  function finish(ng) {
    const win = leader(ng);
    dartsThrown.current[players[player]] += 3;
    emit({
      event: 'SCORE_UPDATED',
      scores: Object.fromEntries(players.map((n, i) => [n, totalScore(ng, i)])),
      round: ng.currentRound + 1,
    });
    emit({ event: 'MATCH_FINISHED', winner: win !== null ? players[win] : null });
    postGame({
      mode: BACKEND_MODE[shanghaiVariant],
      variant: pending?.isShanghai ? 'Shanghai Kill' : 'Normal',
      players, scores: players.map((_, i) => totalScore(ng, i)),
      winner: win !== null ? players[win] : '',
      startedAt: startedAt.current,
      isCasual,
      extra: { targets, darts: dartsThrown.current },
    });
    setGame(ng);
    setPhase('finished');
  }

  function confirmTurn() {
    if (!pending) return;
    pushHistory();
    dartsThrown.current[players[player]] += 3;
    const ng = pending.nextGame;
    setDarts([]);
    setPending(null);
    if (ng.finished) {
      finish(ng);
    } else {
      emit({
        event: 'SCORE_UPDATED',
        scores: Object.fromEntries(players.map((n, i) => [n, totalScore(ng, i)])),
        round: ng.currentRound + 1,
      });
      emit({ event: 'TURN_CHANGED', player: players[ng.currentPlayer], round: ng.currentRound + 1 });
      setGame(ng);
      setPhase('playing');
    }
  }

  // Auto-advance after Shanghai animation
  useEffect(() => {
    if (phase !== 'shanghai' || !pending) return;
    const t = setTimeout(() => {
      finish(pending.nextGame);
      setDarts([]);
      setPending(null);
    }, 2400);
    return () => clearTimeout(t);
  }, [phase, pending]); // eslint-disable-line react-hooks/exhaustive-deps

  const rankings = players
    .map((name, i) => ({ name, i, total: totalScore(game, i) }))
    .sort((a, b) => b.total - a.total);
  const maxScore = Math.max(...rankings.map(r => r.total), 1);

  // ── Finished screen
  if (phase === 'finished') {
    const win = leader(game);
    return (
      <div className="sg sg--finished">
        {win !== null && (
          <VictoryOverlay
            winner={players[win]}
            losers={players.filter((_, i) => i !== win)}
            dartsThrown={dartsThrown.current[players[win]] ?? 0}
          />
        )}
        <p className="sg__fin-eyebrow">FIN DE PARTIE</p>
        <div className="sg__podium">
          {rankings.map((r, rank) => (
            <div key={r.name} className={`sg__podium-row${rank === 0 ? ' sg__podium-row--first' : ''}`}>
              <span className="sg__podium-rank">#{rank + 1}</span>
              <span className="sg__podium-name">{r.name}</span>
              <span className="sg__podium-pts">{r.total} pts</span>
            </div>
          ))}
          {win === null && <p className="sg__podium-tie">Égalité !</p>}
        </div>
        <Tribunes liveId={liveId} />
        <div className="sg__fin-actions">
          <button
            className="sg__btn sg__btn--secondary"
            onClick={() => navigate('/setup', { state: { mode: 'shanghai', isCasual } })}
          >
            REJOUER
          </button>
          <button className="sg__btn sg__btn--primary" onClick={() => navigate('/')}>
            ACCUEIL
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="sg">
      <ExitConfirmModal
        open={showExit}
        onConfirm={() => {
          // Quitter = clore le match live, sinon il reste 🔴 LIVE au dashboard.
          emit({ event: 'MATCH_FINISHED', aborted: true });
          clearResume();
          navigate('/');
        }}
        onCancel={() => setShowExit(false)}
      />

      {/* Shanghai win overlay */}
      {phase === 'shanghai' && (
        <div className="sg__overlay">
          <p className="sg__overlay-icon">🎯</p>
          <p className="sg__overlay-title">SHANGHAI !</p>
          <p className="sg__overlay-sub">{players[player]} remporte la partie !</p>
        </div>
      )}

      <EmoteSplash emote={focusMode ? null : emote} />
      <ChatOverlay message={focusMode ? null : chatMessage} />

      {/* Header */}
      <div className="sg__header">
        <button className="sg__back" onClick={() => setShowExit(true)}>←</button>
        {liveId && (
          <button
            className="sg__back"
            title={focusMode ? 'Emotes bloquées (Mode Focus)' : 'Bloquer les emotes des gradins'}
            onClick={toggleFocus}
          >
            {focusMode ? '🔕' : '🔔'}
          </button>
        )}
        <div className="sg__round-badge">
          R<span className="sg__round-num">{round + 1}</span>
          <span className="sg__round-sep">/</span>
          {targets.length}
        </div>
        <ElapsedTimer startedAt={startedAt.current} />
      </div>

      {/* Cible SVG : la zone du round en rouge fluo, le reste assombri
          (Epic 4.3). Tap direct possible — hors cible = MISS. */}
      <div className="sg__board">
        <SvgBoard
          highlightTarget={target}
          onHit={onBoardHit}
          interactive={phase === 'playing' && darts.length < 3}
          darts={darts.filter(z => z > 0).map(z => ({
            value: target,
            ring: isBullRound ? (z === 2 ? 'DBULL' : 'BULL') : (z === 3 ? 'T' : z === 2 ? 'D' : 'S'),
          }))}
        />
        <p className="sg__target-label">
          {target === BULL ? 'BULL' : `CIBLE : ${target}`}
        </p>
      </div>

      {/* Current player */}
      <div className="sg__player">
        <span className="sg__player-name">{players[player]}</span>
        <span className="sg__player-total">{totalScore(game, player)} pts</span>
      </div>

      {/* Dart slots */}
      <div className="sg__darts">
        {[0, 1, 2].map(i => {
          const z = darts[i];
          const filled = z != null;
          const isMiss = z === 0;
          return (
            <div
              key={i}
              className={`sg__dart${filled ? ' sg__dart--filled' : ''}${isMiss ? ' sg__dart--miss' : ''}`}
            >
              {filled ? (isMiss ? '✕' : `×${z}`) : ''}
            </div>
          );
        })}
      </div>

      {/* Live turn score */}
      <div className="sg__turn-pts">
        {darts.length > 0
          ? <span>+{turnPts} pt{turnPts !== 1 ? 's' : ''} ce tour</span>
          : <span className="sg__turn-hint">Tap pour lancer</span>
        }
      </div>

      {/* Zone buttons — always rendered, disabled when turn is over */}
      <div className={`sg__zones${isBullRound ? ' sg__zones--bull' : ''}`}>
        {zones.map(({ zone, label }) => {
          const pts = zone === 0 ? 0 : zone * target;
          return (
            <button
              key={zone}
              className={`sg__zone sg__zone--${zone}`}
              onClick={() => tapZone(zone)}
              disabled={phase !== 'playing' || darts.length >= 3}
            >
              <span className="sg__zone-label">{label}</span>
              <span className="sg__zone-pts">{pts > 0 ? `${pts} pts` : '—'}</span>
            </button>
          );
        })}
      </div>

      {/* Action area — fixed height to prevent layout shift */}
      <div className="sg__action">
        {phase === 'turn-done' && (
          <>
            <p className="sg__confirm-pts">+{pending?.pts ?? 0} pts</p>
            <button className="sg__btn sg__btn--primary sg__btn--wide" onClick={confirmTurn}>
              SUIVANT
            </button>
          </>
        )}
      </div>

      {/* Undo — traverses confirmed turns too */}
      {(phase === 'playing' || phase === 'turn-done') ? (
        <button className="sg__undo" onClick={undo} disabled={history.length === 0}>⟲ Annuler</button>
      ) : (
        <div className="sg__undo-placeholder" />
      )}

      {/* Score table */}
      <div className="sg__scores">
        {rankings.map(({ name, i, total }) => (
          <div
            key={name}
            className={`sg__score-row${i === player && phase === 'playing' ? ' sg__score-row--active' : ''}`}
          >
            <span className="sg__score-name">{name}</span>
            <div className="sg__score-bar-track">
              <div
                className="sg__score-bar-fill"
                style={{ width: `${(total / maxScore) * 100}%` }}
              />
            </div>
            <span className="sg__score-pts">{total}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
