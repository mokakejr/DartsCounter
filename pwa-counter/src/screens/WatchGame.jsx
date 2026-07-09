import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import SvgBoard from '../components/SvgBoard.jsx';
import { connectLive } from '../live.js';
import { censorName } from '../censor.js';
import './WatchGame.css';

// Barre d'interaction des gradins (Epic 12.2).
const EMOTES = ['👏', '🍺', '💨', '🍅'];
const EMOTE_THROTTLE_MS = 1000;
const CHAT_COOLDOWN_MS = 3000; // double du backend (14.4)
const CHAT_MAX_LEN = 60;
const CHAT_FADE_MS = 5000;

const SPECTATOR_NAME_KEY = 'dartsSpectatorName';

function anonymousName() {
  return `Spectateur-${Math.floor(100 + Math.random() * 900)}`;
}

// Notation cricket classique : 0 = rien, 1 = /, 2 = ✕, 3+ = fermé.
const MARKS = ['', '/', '✕', '⊗'];

function CricketTable({ detail, players, turnPlayer }) {
  return (
    <table className="watch__cricket">
      <thead>
        <tr>
          <th />
          {players.map(p => (
            <th key={p} className={p === turnPlayer ? 'watch__cricket-active' : ''}>{censorName(p)}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {detail.labels.map((label, t) => (
          <tr key={label}>
            <th>{label}</th>
            {players.map((p, i) => {
              const n = detail.marks?.[i]?.[t] ?? 0;
              return (
                <td key={p} className={n >= 3 ? 'watch__cricket-closed' : ''}>
                  {MARKS[Math.min(n, 3)]}
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// score_hit {multiplier, zone} -> marqueur SvgBoard {value, ring}
function hitFromDelta(scoreHit) {
  const { multiplier = 0, zone = 0 } = scoreHit ?? {};
  if (multiplier === 0) return { value: 0, ring: 'MISS' };
  if (zone === 25) return { value: 25, ring: multiplier >= 2 ? 'DBULL' : 'BULL' };
  return { value: zone, ring: multiplier === 3 ? 'T' : multiplier === 2 ? 'D' : 'S' };
}

/**
 * Les Gradins (Epics 12 + 14.2): clone read-only du match — même cible que
 * les joueurs, illumination des impacts en < 200 ms (le delta arrive par
 * WS), emotes et chat éphémère sans jamais pouvoir toucher au score.
 */
export default function WatchGame() {
  const { matchId } = useParams();
  const navigate = useNavigate();
  const [match, setMatch] = useState(null); // snapshot STATE, mis à jour par deltas
  const [gone, setGone] = useState(false);
  const [turnDarts, setTurnDarts] = useState([]); // marqueurs du tour en cours
  const [messages, setMessages] = useState([]); // chat éphémère
  const [chatOpen, setChatOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const connRef = useRef(null);
  const lastEmote = useRef(0);
  const lastChat = useRef(0);
  // Cricket : la cible s'anime en diffant le tableau des marques — chaque
  // SCORE_UPDATED correspond a un coup. On n'infère PAS l'anneau (S/D/T) :
  // les marques capent à 3, un T17 sur cible entamée ressort comme +1 mark
  // et donnerait un « simple » mensonger. On flashe toute la zone touchée.
  const prevMarks = useRef(null);
  const flashTimer = useRef(null);
  const [flashTarget, setFlashTarget] = useState(null);

  function cricketZoneFromDiff(detail) {
    const prev = prevMarks.current;
    prevMarks.current = detail.marks;
    if (!prev) return null;
    for (let i = 0; i < detail.marks.length; i++) {
      for (let t = 0; t < (detail.marks[i]?.length ?? 0); t++) {
        if ((detail.marks[i][t] ?? 0) > (prev[i]?.[t] ?? 0)) {
          const label = detail.labels?.[t];
          const value = label === 'BULL' ? 25 : parseInt(label, 10);
          return Number.isFinite(value) ? value : null; // DBL/TRP/BED : pas une case de la cible
        }
      }
    }
    return null;
  }

  const [boardShake, setBoardShake] = useState(false);

  function flashSector(value) {
    setFlashTarget(value);
    setBoardShake(true);
    clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setFlashTarget(null), 900);
    setTimeout(() => setBoardShake(false), 200);
  }
  // Identité connue -> direct aux gradins ; sinon on la demande d'abord
  // (avec bypass anonyme) — le chat signera de ce nom.
  const [name, setName] = useState(() => localStorage.getItem(SPECTATOR_NAME_KEY));
  const [nameDraft, setNameDraft] = useState('');

  function chooseName(value) {
    const chosen = censorName(value.trim().slice(0, 20)) || anonymousName();
    localStorage.setItem(SPECTATOR_NAME_KEY, chosen);
    setName(chosen);
  }

  useEffect(() => {
    if (!name) return undefined;
    const conn = connectLive(matchId, {
      role: 'spectator',
      name,
      onClose(code) {
        if (code === 4404) setGone(true);
      },
      onEvent(e) {
        switch (e.event) {
          case 'STATE':
            setMatch(e.match);
            prevMarks.current = e.match?.detail?.marks ?? null;
            break;
          case 'DART_THROWN': {
            setMatch(m => m && { ...m, turn_player: e.player_id, dart_index: e.dart_index });
            const d = hitFromDelta(e.score_hit);
            setTurnDarts(prev => [...prev.slice(-2), { ...d, key: Date.now() }]);
            if (d.ring !== 'MISS') flashSector(d.value);
            break;
          }
          case 'TURN_CHANGED':
            setMatch(m => m && { ...m, turn_player: e.player, dart_index: 0, round: e.round ?? m.round });
            setTurnDarts([]);
            break;
          case 'SCORE_UPDATED': {
            let zone = null;
            if (e.detail?.kind === 'cricket') {
              // Toute la zone s'illumine (S+D+T+numéro via flashSector) —
              // pas de marqueur planté : l'anneau exact n'est pas connu.
              zone = cricketZoneFromDiff(e.detail);
              if (zone != null) flashSector(zone);
            }
            const apply = () => setMatch(m => m && {
              ...m,
              scores: { ...m.scores, ...e.scores },
              round: e.round ?? m.round,
              detail: e.detail ?? m.detail,
            });
            // Impact d'abord, chiffres 300 ms plus tard : l'attente cree
            // l'anticipation (Epic "L'Ame de la Cible").
            if (zone != null) setTimeout(apply, 300);
            else apply();
            break;
          }
          case 'MATCH_STARTED':
            setMatch(m => m && { ...m, started: true });
            break;
          case 'MATCH_FINISHED':
            setMatch(m => m && { ...m, finished: true, winner: e.winner });
            break;
          case 'CHAT_MESSAGE': {
            const id = `${e.timestamp}-${Math.random()}`;
            setMessages(prev => [...prev.slice(-6), { id, sender: e.sender_id, message: e.message }]);
            setTimeout(() => setMessages(prev => prev.filter(msg => msg.id !== id)), CHAT_FADE_MS);
            break;
          }
          default:
        }
      },
    });
    connRef.current = conn;
    return () => {
      conn.close();
      connRef.current = null;
      clearTimeout(flashTimer.current);
    };
  }, [matchId, name]); // eslint-disable-line react-hooks/exhaustive-deps

  function sendEmote(emote) {
    const now = Date.now();
    if (now - lastEmote.current < EMOTE_THROTTLE_MS) return;
    lastEmote.current = now;
    connRef.current?.send({ event: 'EMOTE', emote });
  }

  function sendChat(e) {
    e.preventDefault();
    const message = draft.trim().slice(0, CHAT_MAX_LEN);
    const now = Date.now();
    if (!message || now - lastChat.current < CHAT_COOLDOWN_MS) return;
    lastChat.current = now;
    connRef.current?.send({ event: 'CHAT_MESSAGE', message });
    setDraft('');
    setChatOpen(false); // referme le clavier, la vue revient au match (14.2)
  }

  if (!name) {
    return (
      <div className="watch watch--empty">
        <form
          className="watch__identity"
          onSubmit={e => { e.preventDefault(); chooseName(nameDraft); }}
        >
          <p className="watch__identity-title">Qui est dans les gradins ?</p>
          <p className="watch__identity-sub">Ton nom signera tes messages dans le chat.</p>
          <input
            autoFocus
            className="watch__input"
            value={nameDraft}
            maxLength={20}
            placeholder="Ton pseudo"
            onChange={e => setNameDraft(e.target.value)}
          />
          <button type="submit" className="watch__identity-go" disabled={!nameDraft.trim()}>
            Rejoindre les gradins
          </button>
          <button type="button" className="watch__identity-anon" onClick={() => chooseName('')}>
            Continuer en anonyme ({anonymousName().slice(0, 11)}…)
          </button>
        </form>
      </div>
    );
  }

  if (!match) {
    return (
      <div className="watch watch--empty">
        <p>{gone ? 'Ce match est terminé ou introuvable.' : 'Connexion aux gradins…'}</p>
        <button className="watch__leave" onClick={() => navigate('/')}>← Accueil</button>
      </div>
    );
  }

  const scores = match.players.map(p => ({ name: p, score: match.scores?.[p] ?? 0 }));

  return (
    <div className="watch">
      <div className="watch__header">
        <button className="watch__leave" onClick={() => navigate('/')}>←</button>
        <span className="watch__live">
          {match.finished ? '⚫ TERMINÉ' : <>🔴 LIVE — {match.mode}{match.round > 1 ? ` · Tour ${match.round}` : ''}</>}
        </span>
      </div>

      <div className="watch__status">
        {match.finished
          ? (match.winner ? `🏆 ${censorName(match.winner)} remporte le match !` : 'Match terminé.')
          : match.turn_player
            ? `${censorName(match.turn_player)} prépare sa ${(match.dart_index ?? 0) + 1}ᵉ fléchette…`
            : 'En attente du premier lancer…'}
      </div>

      <div className={boardShake ? 'watch__board watch__board--shake' : 'watch__board'}>
        <SvgBoard interactive={false} darts={turnDarts} highlightTarget={flashTarget} />
      </div>

      {/* Cricket : l'avancée cible par cible, pas juste les points. */}
      {match.detail?.kind === 'cricket' && (
        <CricketTable detail={match.detail} players={match.players} turnPlayer={match.turn_player} />
      )}

      <div className="watch__scores">
        {scores.map(({ name: p, score }) => (
          <div key={p} className={`watch__score-row${p === match.turn_player ? ' watch__score-row--active' : ''}`}>
            <span>{censorName(p)}</span>
            <b>{score}</b>
          </div>
        ))}
      </div>

      {/* Chat éphémère (14.2): pas de fond opaque, fondu après 5 s. */}
      <div className="watch__chat">
        {messages.map(m => (
          <p key={m.id} className="watch__chat-msg">
            <b>{censorName(m.sender)}</b> {m.message}
          </p>
        ))}
      </div>

      <div className="watch__bar">
        {EMOTES.map(e => (
          <button key={e} className="watch__emote" onClick={() => sendEmote(e)} disabled={match.finished}>
            {e}
          </button>
        ))}
        <button className="watch__emote watch__emote--chat" onClick={() => setChatOpen(o => !o)}>
          💬
        </button>
      </div>

      {chatOpen && (
        <form className="watch__input-row" onSubmit={sendChat}>
          <input
            autoFocus
            className="watch__input"
            value={draft}
            maxLength={CHAT_MAX_LEN}
            placeholder={`Réaction à vif (60 max) — ${name}`}
            onChange={e => setDraft(e.target.value)}
          />
          <button type="submit" className="watch__send">➤</button>
        </form>
      )}
    </div>
  );
}
