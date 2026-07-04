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
import VictoryOverlay from '../components/VictoryOverlay.jsx';
import EmoteSplash from '../components/EmoteSplash.jsx';
import Tribunes from '../components/Tribunes.jsx';
import { useLiveMatch } from '../useLiveMatch.js';
import './FiftyOneGame.css';

// Dart-Wheel par défaut (Epic 4.1) — le numpad reste dispo via le toggle.
const INPUT_MODE_KEY = 'dartsInputMode';

export default function FiftyOneGame() {
  const { state } = useLocation();
  const navigate = useNavigate();
  const players = state?.players ?? ['J1', 'J2'];
  const isCasual = state?.isCasual ?? false;
  const liveId = state?.liveId ?? null;
  // Remote (Epic 13): chaque client ne saisit que ses propres tours, l'état
  // adverse arrive par les deltas WS.
  const remote = state?.remote ?? false;
  const me = state?.me ?? null;

  const [game, setGame] = useState(() => initialFiftyOneState(players));
  const [input, setInput] = useState('');
  const [boardDarts, setBoardDarts] = useState([]); // [{value, ring}] du tour
  // En remote, le Dart-Wheel est obligatoire : l'overlay adverse
  // (« Fléchette 2/3 ») est nourri par les DART_THROWN, que le clavier
  // n'émet pas.
  const [inputMode, setInputMode] = useState(() =>
    (state?.remote ? 'board' : localStorage.getItem(INPUT_MODE_KEY) || 'board')
  );
  const [phase, setPhase] = useState('playing'); // 'playing' | 'finished'
  const [showExit, setShowExit] = useState(false);
  // [{game}] — lets a player undo a confirmed turn, not just the in-progress input
  const [history, setHistory] = useState([]);
  const startedAt = useRef(Date.now());
  // Fléchettes réellement lancées par joueur — alimente extra.darts (XP Ferveur).
  const dartsThrown = useRef(Object.fromEntries(players.map(p => [p, 0])));
  const [oppDart, setOppDart] = useState(0);
  const [oppLeft, setOppLeft] = useState(false);

  // Diffusion live (Epic 11) + Mode Focus (12.2): bloque les emotes entrantes.
  const { emit, emote } = useLiveMatch(liveId, remote ? me : players[0], {
    onEvent(e) {
      if (!remote) return;
      // Deltas adverses -> état local (les échos de mes propres événements
      // sont idempotents).
      if (e.player_id && e.player_id !== me) setOppLeft(false); // il est vivant
      if (e.event === 'PLAYER_LEFT' && e.player_id !== me) {
        setOppLeft(true);
      } else if (e.event === 'SCORE_UPDATED' && e.scores) {
        setGame(g => ({ ...g, fives: players.map((n, i) => e.scores[n] ?? g.fives[i]) }));
      } else if (e.event === 'TURN_CHANGED' && e.player) {
        const idx = players.indexOf(e.player);
        if (idx !== -1) setGame(g => ({ ...g, currentPlayer: idx }));
        setOppDart(0);
      } else if (e.event === 'DART_THROWN' && e.player_id !== me) {
        setOppDart((e.dart_index ?? 0) + 1);
      } else if (e.event === 'MATCH_FINISHED') {
        const idx = players.indexOf(e.winner);
        setGame(g => ({ ...g, winner: idx !== -1 ? idx : g.winner }));
        setPhase('finished');
      } else if (e.event === 'STATE' && e.match) {
        // Reconnexion en pleine partie : le snapshot serveur fait foi pour
        // les scores et le tour — on rattrape les deltas manqués.
        const m = e.match;
        setGame(g => ({
          ...g,
          fives: players.map((n, i) => m.scores?.[n] ?? g.fives[i]),
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
  // Handover (13.2): hors de mon tour, le Dart-Wheel est verrouillé.
  const myTurn = !remote || players[player] === me;
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

  const RING_MULT = { S: 1, D: 2, T: 3, BULL: 1, DBULL: 2, MISS: 0 };

  function onBoardHit(hit) {
    if (phase !== 'playing' || boardDarts.length >= 3 || !myTurn) return;
    emit({
      event: 'DART_THROWN',
      player: players[player],
      dart_index: boardDarts.length,
      score_hit: { multiplier: RING_MULT[hit.ring] ?? 0, zone: hit.value },
    });
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
    if (!myTurn) return;
    setHistory(h => [...h, { game }]);
    // Le nombre de fléchettes réellement lancées nourrit la Ferveur (XP).
    dartsThrown.current[players[player]] += inputMode === 'board' ? boardDarts.length : 3;
    // Invalid score (not multiple of 5, or bust) → pass turn with 0
    const scored = scoreTurn(game, player, validScore ? turnTotal : 0);
    emit({
      event: 'SCORE_UPDATED',
      scores: Object.fromEntries(players.map((n, i) => [n, scored.fives[i]])),
    });
    if (scored.winner !== null) {
      emit({ event: 'MATCH_FINISHED', winner: players[scored.winner] });
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
      const nxt = nextPlayer(scored);
      emit({ event: 'TURN_CHANGED', player: players[nxt.currentPlayer] });
      setGame(nxt);
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
    // Remote : un tour confirmé est déjà chez l'adversaire — pas d'undo
    // au-delà des fléchettes du tour en cours (13.2).
    if (remote) return;
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
        {game.winner !== null && (
          <VictoryOverlay
            winner={players[game.winner]}
            losers={players.filter((_, i) => i !== game.winner)}
            dartsThrown={dartsThrown.current[players[game.winner]] ?? 0}
          />
        )}
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
        <Tribunes liveId={liveId} />
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
        {liveId && (
          <button
            className="f51__back"
            title={focusMode ? 'Emotes bloquées (Mode Focus)' : 'Bloquer les emotes des gradins'}
            onClick={toggleFocus}
          >
            {focusMode ? '🔕' : '🔔'}
          </button>
        )}
        <ElapsedTimer startedAt={startedAt.current} />
      </div>

      <EmoteSplash emote={focusMode ? null : emote} />

      {remote && !myTurn && (
        <div className="f51__remote-overlay">
          <p className="f51__remote-title">Au tour de {players[player]}…</p>
          <p className="f51__remote-sub">
            {oppLeft
              ? '⚠️ Déconnecté — il peut revenir avec le même lien'
              : `Fléchette ${Math.min(oppDart + 1, 3)}/3`}
          </p>
        </div>
      )}

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

      {!remote && (
        <button className="f51__input-toggle" onClick={toggleInputMode}>
          {inputMode === 'board' ? '⌨️ Saisie clavier' : '🎯 Saisie sur cible'}
        </button>
      )}

      {/* Undo — traverses confirmed turns too */}
      <button
        className="f51__undo"
        onClick={undo}
        disabled={remote ? boardDarts.length === 0 : history.length === 0 && boardDarts.length === 0}
      >
        ⟲ Annuler
      </button>
    </div>
  );
}
