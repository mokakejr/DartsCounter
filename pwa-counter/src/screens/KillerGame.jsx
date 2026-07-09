import { useState, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { assignNumbers, initialKillerState, canTarget, playDart, eliminationScores } from '../modes/killer.js';
import { postGame } from '../postGame.js';
import ExitConfirmModal from './ExitConfirmModal.jsx';
import ElapsedTimer from '../components/ElapsedTimer.jsx';
import EmoteSplash from '../components/EmoteSplash.jsx';
import ChatOverlay from '../components/ChatOverlay.jsx';
import Tribunes from '../components/Tribunes.jsx';
import { useLiveMatch } from '../useLiveMatch.js';
import { censorName } from '../censor.js';
import './KillerGame.css';

// L'état Killer complet est petit et JSON-safe : on l'expédie en bloc dans
// le detail — l'écran adverse et le resync STATE le rejouent tel quel.
function killerDetail(s) {
  return {
    kind: 'killer',
    players: s.players,
    eliminationOrder: s.eliminationOrder,
    currentPlayer: s.currentPlayer,
    dartsThisTurn: s.dartsThisTurn,
  };
}

export default function KillerGame() {
  const { state } = useLocation();
  const navigate = useNavigate();
  const players = state?.players ?? ['Joueur 1', 'Joueur 2'];
  const lives = Number.isInteger(state?.lives) ? state.lives : 3;
  const isDoubleOnly = state?.variant === 'double';
  const liveId = state?.liveId ?? null;
  // Remote (Epic 13): chaque client ne saisit que ses propres tours, l'état
  // adverse arrive par les deltas WS.
  const remote = state?.remote ?? false;
  const me = state?.me ?? null;

  // Generated once per game, shared by every player. Remote : les numéros
  // viennent du créateur via les options du match — mêmes numéros partout.
  const [numbers] = useState(() => state?.numbers ?? assignNumbers(players.length));
  const [game, setGame] = useState(() => initialKillerState(players, numbers, lives));
  const [phase, setPhase] = useState('playing'); // 'playing' | 'finished'
  const [showExit, setShowExit] = useState(false);
  const [history, setHistory] = useState([]); // previous game states, for undo
  const startedAt = useRef(Date.now());
  const [oppDart, setOppDart] = useState(0);
  const [oppLeft, setOppLeft] = useState(false);
  // Fin à distance sans vainqueur (abandon/inactivité).
  const [remoteAborted, setRemoteAborted] = useState(false);

  function applyDetail(d) {
    setGame(g => ({
      ...g,
      players: d.players ?? g.players,
      eliminationOrder: d.eliminationOrder ?? g.eliminationOrder,
      currentPlayer: d.currentPlayer ?? g.currentPlayer,
      dartsThisTurn: d.dartsThisTurn ?? g.dartsThisTurn,
    }));
  }

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
      if (e.event === 'DART_THROWN') {
        if (e.player_id !== me) setOppDart((e.dart_index ?? 0) + 1);
      } else if (e.event === 'SCORE_UPDATED' && e.detail?.kind === 'killer') {
        if (e.player_id === me) return; // écho de mon propre delta
        applyDetail(e.detail);
      } else if (e.event === 'TURN_CHANGED' && e.player) {
        const idx = players.indexOf(e.player);
        setGame(g => ({
          ...g,
          currentPlayer: idx !== -1 ? idx : g.currentPlayer,
          dartsThisTurn: 0,
        }));
        setOppDart(0);
      } else if (e.event === 'MATCH_FINISHED') {
        setGame(g => ({ ...g, finished: true, winner: e.winner ?? g.winner }));
        if (!e.winner) setRemoteAborted(true);
        setPhase('finished');
      } else if (e.event === 'STATE' && e.match) {
        // Reconnexion en pleine partie : le snapshot serveur fait foi.
        if (e.match.detail?.kind === 'killer') applyDetail(e.match.detail);
        if (e.match.finished) setPhase('finished');
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

  const thrower = game.players[game.currentPlayer];
  // Handover (13.2): hors de mon tour, la saisie est verrouillée.
  const myTurn = !remote || thrower.name === me;

  function finish(ng) {
    emit({ event: 'MATCH_FINISHED', winner: ng.winner });
    postGame({
      mode: 'Killer',
      variant: isDoubleOnly ? 'Double Only' : 'Any',
      players,
      scores: eliminationScores(ng),
      winner: ng.winner,
      startedAt: startedAt.current,
      isCasual: true,
      extra: { eliminationOrder: ng.eliminationOrder, lives, numbers },
    });
    setGame(ng);
    setPhase('finished');
  }

  function throwDart(targetIndex) {
    if (phase !== 'playing' || !myTurn) return;
    // Remote : chaque fléchette est commitée et diffusée au tap — il n'y a
    // aucun tampon local à annuler, l'undo est entièrement désactivé.
    if (remote) setHistory([]);
    else setHistory(h => [...h, game]);
    const next = playDart(game, targetIndex);
    emit({
      event: 'DART_THROWN',
      player: thrower.name,
      dart_index: game.dartsThisTurn,
      score_hit: {
        multiplier: targetIndex == null ? 0 : 1,
        zone: targetIndex == null ? 0 : game.players[targetIndex].number,
      },
    });
    emit({
      event: 'SCORE_UPDATED',
      scores: Object.fromEntries(next.players.map(p => [p.name, p.lives])),
      detail: killerDetail(next),
    });
    // Killer avance le tour DANS playDart : sans ce handover explicite, le
    // turn_player serveur ne bougerait jamais et la garde de tour remote
    // jetterait tous les DART_THROWN adverses.
    if (!next.finished && next.currentPlayer !== game.currentPlayer) {
      emit({ event: 'TURN_CHANGED', player: next.players[next.currentPlayer].name });
    }
    if (next.finished) {
      finish(next);
    } else {
      setGame(next);
    }
  }

  function undo() {
    if (remote || !history.length) return;
    setGame(history[history.length - 1]);
    setHistory(h => h.slice(0, -1));
  }

  // ── Finished screen
  if (phase === 'finished') {
    const podium = [game.winner, ...[...game.eliminationOrder].reverse()].filter(n => n != null);
    return (
      <div className="kg kg--finished">
        <p className="kg__fin-eyebrow">{remoteAborted ? 'PARTIE INTERROMPUE' : 'FIN DE PARTIE'}</p>
        <div className="kg__podium">
          {podium.map((name, rank) => (
            <div key={name} className={`kg__podium-row${rank === 0 && !remoteAborted ? ' kg__podium-row--first' : ''}`}>
              <span className="kg__podium-rank">#{rank + 1}</span>
              <span className="kg__podium-name">{censorName(name)}</span>
            </div>
          ))}
        </div>
        <Tribunes liveId={liveId} />
        <div className="kg__fin-actions">
          <button
            className="kg__btn kg__btn--secondary"
            onClick={() => navigate('/setup', { state: { mode: 'killer', isCasual: true, variant: state?.variant, lives } })}
          >
            REJOUER
          </button>
          <button className="kg__btn kg__btn--primary" onClick={() => navigate('/')}>
            ACCUEIL
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="kg">
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

      {/* Verrouillage hors tour (13.2) — même overlay que le 51. */}
      {remote && !myTurn && (
        <div className="kg__remote-overlay">
          <p className="kg__remote-title">Au tour de {censorName(thrower.name)}…</p>
          <p className="kg__remote-sub">
            {oppLeft
              ? '⚠️ Déconnecté — il peut revenir avec le même lien'
              : `Fléchette ${Math.min(oppDart + 1, 3)}/3`}
          </p>
        </div>
      )}

      <div className="kg__header">
        <button className="kg__back" onClick={() => setShowExit(true)}>←</button>
        {liveId && (
          <button
            className="kg__back"
            title={focusMode ? 'Emotes bloquées (Mode Focus)' : 'Bloquer les emotes des gradins'}
            onClick={toggleFocus}
          >
            {focusMode ? '🔕' : '🔔'}
          </button>
        )}
        <span className="kg__title">KILLER{isDoubleOnly ? ' · DOUBLE' : ''}</span>
        <ElapsedTimer startedAt={startedAt.current} />
      </div>

      <div className="kg__player">
        <span className="kg__player-name">{censorName(thrower.name)}</span>
        <span className="kg__player-sub">
          N°{thrower.number} · {thrower.isKiller ? 'Killer 🔪' : 'Pas encore killer'} · dart {game.dartsThisTurn + 1}/3
        </span>
      </div>

      {/* Targets — MISS + one button per active player. Opponents are
          disabled until the thrower has become a killer. */}
      <div className="kg__targets">
        <button className="kg__target kg__target--miss" onClick={() => throwDart(null)} disabled={!myTurn}>
          MANQUÉ
        </button>
        {game.players.map((p, i) => {
          if (p.eliminated) return null;
          const enabled = canTarget(game, game.currentPlayer, i) && myTurn;
          const isSelf = i === game.currentPlayer;
          return (
            <button
              key={p.name}
              className={`kg__target${isSelf ? ' kg__target--self' : ''}`}
              disabled={!enabled}
              onClick={() => throwDart(i)}
            >
              <span className="kg__target-name">{censorName(p.name)}{isSelf ? ' (toi)' : ''}</span>
              <span className="kg__target-num">{isDoubleOnly ? `D${p.number}` : `N°${p.number}`}</span>
            </button>
          );
        })}
      </div>

      {/* Undo — remote : chaque fléchette est déjà chez l'adversaire. */}
      {!remote && (
        <button className="kg__undo" onClick={undo} disabled={history.length === 0}>⟲ Annuler</button>
      )}

      {/* Status table */}
      <div className="kg__status">
        {game.players.map((p, i) => (
          <div
            key={p.name}
            className={`kg__status-row${p.eliminated ? ' kg__status-row--out' : ''}${i === game.currentPlayer ? ' kg__status-row--active' : ''}`}
          >
            <span className="kg__status-name">{censorName(p.name)}</span>
            <span className="kg__status-num">N°{p.number}</span>
            <span className="kg__status-killer">{p.isKiller && !p.eliminated ? '🔪' : ''}</span>
            <span className="kg__status-lives">{p.eliminated ? 'ÉLIMINÉ' : '♥'.repeat(p.lives)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
