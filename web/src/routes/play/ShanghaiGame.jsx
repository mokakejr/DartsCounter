import { useState, useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  initialShanghaiState,
  addScore,
  totalScore,
  isShanghai,
  leader,
  SHANGHAI_ROUNDS,
} from '../../play/models/shanghai.js';
import { postGame } from '../../play/postGame.js';
import ExitConfirmModal from './ExitConfirmModal.jsx';
import './ShanghaiGame.css';

const ZONES = [
  { zone: 0, label: 'MISS' },
  { zone: 1, label: '×1' },
  { zone: 2, label: '×2' },
  { zone: 3, label: '×3' },
];

export default function ShanghaiGame() {
  const { state } = useLocation();
  const navigate = useNavigate();
  const players = state?.players ?? ['Joueur 1', 'Joueur 2'];

  const [game, setGame] = useState(() => initialShanghaiState(players));
  const [darts, setDarts] = useState([]);
  // pending: { pts, isShanghai, nextGame } — set when 3 darts entered, cleared on confirm
  const [pending, setPending] = useState(null);
  // phase: 'playing' | 'turn-done' | 'shanghai' | 'finished'
  const [phase, setPhase] = useState('playing');
  const [showExit, setShowExit] = useState(false);
  const startedAt = useRef(Date.now());
  const isKill = useRef(false);

  const round = game.currentRound;
  const player = game.currentPlayer;
  const target = round + 1;
  const turnPts = darts.reduce((s, z) => s + z * target, 0);

  function tapZone(zone) {
    if (phase !== 'playing') return;
    setDarts(prev => prev.length >= 3 ? prev : [...prev, zone]);
  }

  // Commit turn once 3 darts are entered
  useEffect(() => {
    if (darts.length !== 3 || phase !== 'playing') return;
    const pts = darts.reduce((s, z) => s + z * target, 0);
    const shanghai = isShanghai(darts);
    const nextGame = addScore(game, player, round, pts, shanghai);
    setPending({ pts, isShanghai: shanghai, nextGame });
    if (shanghai) isKill.current = true;
    setPhase(shanghai ? 'shanghai' : 'turn-done');
  }, [darts]); // eslint-disable-line react-hooks/exhaustive-deps

  function undo() {
    if (phase !== 'playing') return;
    setDarts(d => d.slice(0, -1));
  }

  function confirmTurn() {
    if (!pending) return;
    const ng = pending.nextGame;
    setGame(ng);
    setDarts([]);
    setPending(null);
    if (ng.finished) {
      const win = leader(ng);
      postGame({
        mode: 'Shanghai', variant: 'Normal',
        players, scores: players.map((_, i) => totalScore(ng, i)),
        winner: win !== null ? players[win] : '',
        startedAt: startedAt.current,
      });
      setPhase('finished');
    } else {
      setPhase('playing');
    }
  }

  // Auto-advance after Shanghai animation
  useEffect(() => {
    if (phase !== 'shanghai' || !pending) return;
    const t = setTimeout(() => {
      const ng = pending.nextGame;
      const win = leader(ng);
      postGame({
        mode: 'Shanghai', variant: 'Shanghai Kill',
        players, scores: players.map((_, i) => totalScore(ng, i)),
        winner: win !== null ? players[win] : '',
        startedAt: startedAt.current,
      });
      setGame(ng);
      setDarts([]);
      setPending(null);
      setPhase('finished');
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
        <div className="sg__fin-actions">
          <button
            className="sg__btn sg__btn--secondary"
            onClick={() => navigate('/play/setup', { state: { mode: 'shanghai' } })}
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
        onConfirm={() => navigate('/play')}
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

      {/* Header */}
      <div className="sg__header">
        <button className="sg__back" onClick={() => setShowExit(true)}>←</button>
        <div className="sg__round-badge">
          R<span className="sg__round-num">{round + 1}</span>
          <span className="sg__round-sep">/</span>
          {SHANGHAI_ROUNDS}
        </div>
        <div className="sg__spacer" />
      </div>

      {/* Target */}
      <div className="sg__target">
        <div className="sg__target-ring">
          <span className="sg__target-num">{target}</span>
        </div>
        <p className="sg__target-label">CIBLE</p>
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

      {/* Zone buttons */}
      {phase === 'playing' && (
        <div className="sg__zones">
          {ZONES.map(({ zone, label }) => {
            const pts = zone === 0 ? 0 : zone * target;
            return (
              <button
                key={zone}
                className={`sg__zone sg__zone--${zone}`}
                onClick={() => tapZone(zone)}
                disabled={darts.length >= 3}
              >
                <span className="sg__zone-label">{label}</span>
                <span className="sg__zone-pts">{pts > 0 ? `${pts} pts` : '—'}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* Turn done — confirm */}
      {phase === 'turn-done' && (
        <div className="sg__confirm">
          <p className="sg__confirm-pts">+{pending?.pts ?? 0} pts</p>
          <button className="sg__btn sg__btn--primary sg__btn--wide" onClick={confirmTurn}>
            SUIVANT →
          </button>
        </div>
      )}

      {/* Undo */}
      {phase === 'playing' && darts.length > 0 && (
        <button className="sg__undo" onClick={undo}>⟲ Annuler</button>
      )}
      {(phase !== 'playing' || darts.length === 0) && <div className="sg__undo-placeholder" />}

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
