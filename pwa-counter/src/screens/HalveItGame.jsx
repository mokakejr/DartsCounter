import { useState, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  HALVEIT_SEQUENCES, roundLabel, initialHalveItState, scoreRound, leader,
} from '../modes/halveIt.js';
import { postGame } from '../postGame.js';
import ExitConfirmModal from './ExitConfirmModal.jsx';
import ElapsedTimer from '../components/ElapsedTimer.jsx';
import EmoteSplash from '../components/EmoteSplash.jsx';
import ChatOverlay from '../components/ChatOverlay.jsx';
import Tribunes from '../components/Tribunes.jsx';
import { useLiveMatch } from '../useLiveMatch.js';
import { censorName } from '../censor.js';
import './HalveItGame.css';

export default function HalveItGame() {
  const { state } = useLocation();
  const navigate = useNavigate();
  const players = state?.players ?? ['Joueur 1', 'Joueur 2'];
  const isSeqShort = state?.variant === 'short';
  // Séquence déterministe par variante — rien d'aléatoire à synchroniser en
  // remote, la variante transite par les options du match.
  const sequence = HALVEIT_SEQUENCES[isSeqShort ? 'short' : 'standard'];
  const liveId = state?.liveId ?? null;
  // Remote (Epic 13): chaque client ne saisit que ses propres tours, l'état
  // adverse arrive par les deltas WS.
  const remote = state?.remote ?? false;
  const me = state?.me ?? null;

  const [game, setGame] = useState(() => initialHalveItState(players, sequence));
  const [input, setInput] = useState('');
  const [phase, setPhase] = useState('playing'); // 'playing' | 'finished'
  const [showExit, setShowExit] = useState(false);
  // [{game}] — undo traverses confirmed turns too
  const [history, setHistory] = useState([]);
  const startedAt = useRef(Date.now());
  const [oppLeft, setOppLeft] = useState(false);
  // Fin à distance sans vainqueur (abandon/inactivité).
  const [remoteAborted, setRemoteAborted] = useState(false);

  // Diffusion live (Epic 11) + Mode Focus (12.2) — comme 51/Cricket/Shanghai.
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
        setGame(g => ({
          ...g,
          scores: players.map((n, i) => e.scores[n] ?? g.scores[i]),
          // les émissions portent round = currentRound + 1 (affichage)
          currentRound: e.round != null ? e.round - 1 : g.currentRound,
        }));
      } else if (e.event === 'TURN_CHANGED' && e.player) {
        const idx = players.indexOf(e.player);
        setGame(g => ({
          ...g,
          currentPlayer: idx !== -1 ? idx : g.currentPlayer,
          currentRound: e.round != null ? e.round - 1 : g.currentRound,
        }));
      } else if (e.event === 'MATCH_FINISHED') {
        // leader() recalcule le vainqueur depuis les scores synchronisés.
        setGame(g => ({ ...g, finished: true }));
        if (!e.winner) setRemoteAborted(true);
        setPhase('finished');
      } else if (e.event === 'STATE' && e.match) {
        // Reconnexion : l'état Halve It, c'est exactement scores + round +
        // joueur — le snapshot serveur suffit.
        const m = e.match;
        setGame(g => ({
          ...g,
          scores: players.map((n, i) => m.scores?.[n] ?? g.scores[i]),
          currentPlayer: Math.max(players.indexOf(m.turn_player), 0),
          currentRound: m.round != null ? Math.max(m.round - 1, 0) : g.currentRound,
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
  const target = sequence[game.currentRound];
  const points = parseInt(input, 10) || 0;
  const willHalve = input !== '' && points === 0;
  const currentScore = game.scores[player];
  // Handover (13.2): hors de mon tour, la saisie est verrouillée.
  const myTurn = !remote || players[player] === me;

  function pressDigit(d) {
    if (!myTurn) return;
    setInput(prev => {
      const next = prev + d;
      return parseInt(next, 10) > 180 ? prev : next;
    });
  }

  function pressBack() {
    setInput(prev => prev.slice(0, -1));
  }

  function confirm() {
    if (!myTurn) return;
    // Remote : un tour confirmé est déjà chez l'adversaire — undo désactivé.
    if (remote) setHistory([]);
    else setHistory(h => [...h, { game }]);
    const scored = scoreRound(game, player, points);
    emit({
      event: 'SCORE_UPDATED',
      scores: Object.fromEntries(players.map((n, i) => [n, scored.scores[i]])),
      round: scored.currentRound + 1,
    });
    if (scored.finished) {
      const win = leader(scored);
      emit({ event: 'MATCH_FINISHED', winner: win !== null ? players[win] : null });
      postGame({
        mode: 'HalveIt',
        variant: isSeqShort ? 'Short' : 'Standard',
        players, scores: scored.scores,
        winner: win !== null ? players[win] : '',
        startedAt: startedAt.current,
        isCasual: true,
      });
    } else {
      emit({ event: 'TURN_CHANGED', player: players[scored.currentPlayer], round: scored.currentRound + 1 });
    }
    setGame(scored);
    setPhase(scored.finished ? 'finished' : 'playing');
    setInput('');
  }

  function undo() {
    if (remote || !history.length) return;
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
        <p className="hi__fin-eyebrow">{remoteAborted ? 'PARTIE INTERROMPUE' : 'FIN DE PARTIE'}</p>
        <div className="hi__podium">
          {ranked.map((r, rank) => (
            <div key={r.name} className={`hi__podium-row${rank === 0 && !remoteAborted ? ' hi__podium-row--first' : ''}`}>
              <span className="hi__podium-rank">#{rank + 1}</span>
              <span className="hi__podium-name">{censorName(r.name)}</span>
              <span className="hi__podium-pts">{r.score} pts</span>
            </div>
          ))}
          {win === null && !remoteAborted && <p className="hi__podium-tie">Égalité !</p>}
        </div>
        <Tribunes liveId={liveId} />
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
        onConfirm={() => {
          // Quitter = clore le match live, sinon il reste 🔴 LIVE au dashboard.
          emit({ event: 'MATCH_FINISHED', aborted: true });
          navigate('/');
        }}
        onCancel={() => setShowExit(false)}
      />

      <EmoteSplash emote={focusMode ? null : emote} />
      <ChatOverlay message={focusMode ? null : chatMessage} />

      {/* Verrouillage hors tour (13.2) — pas de compteur de fléchettes :
          la saisie adverse est un total au pavé numérique. */}
      {remote && !myTurn && (
        <div className="hi__remote-overlay">
          <p className="hi__remote-title">Au tour de {censorName(players[player])}…</p>
          <p className="hi__remote-sub">
            {oppLeft
              ? '⚠️ Déconnecté — il peut revenir avec le même lien'
              : 'saisie en cours'}
          </p>
        </div>
      )}

      <div className="hi__header">
        <button className="hi__back" onClick={() => setShowExit(true)}>←</button>
        {liveId && (
          <button
            className="hi__back"
            title={focusMode ? 'Emotes bloquées (Mode Focus)' : 'Bloquer les emotes des gradins'}
            onClick={toggleFocus}
          >
            {focusMode ? '🔕' : '🔔'}
          </button>
        )}
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
        <span className="hi__player-name">{censorName(players[player])}</span>
        <span className="hi__player-total">{currentScore} pts</span>
      </div>

      {/* Score table — remontée sous le joueur courant et scrollable, pour voir
          le score de tous les joueurs à chaque instant (comme le 51). */}
      <div className="hi__scores">
        {players.map((name, i) => (
          <div key={name} className={`hi__row${i === player ? ' hi__row--active' : ''}`}>
            <span className="hi__row-name">{censorName(name)}</span>
            <span className="hi__row-val">{game.scores[i]}</span>
          </div>
        ))}
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
          <button key={d} className="hi__key" onClick={() => pressDigit(String(d))} disabled={!myTurn}>
            {d}
          </button>
        ))}
        <button className="hi__key hi__key--back" onClick={pressBack} disabled={!myTurn}>⌫</button>
        <button className="hi__key" onClick={() => pressDigit('0')} disabled={!myTurn}>0</button>
        <button
          className={`hi__key hi__key--ok${input !== '' ? ' hi__key--ok-active' : ''}`}
          onClick={confirm}
          disabled={input === '' || !myTurn}
        >
          ✓
        </button>
      </div>

      {/* Undo — remote : un tour confirmé est déjà chez l'adversaire. */}
      {!remote && (
        <button className="hi__undo" onClick={undo} disabled={history.length === 0}>⟲ Annuler</button>
      )}
    </div>
  );
}
