import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import SvgBoard from '../components/SvgBoard.jsx';
import { connectLive } from '../live.js';
import './WatchGame.css';

// Barre d'interaction des gradins (Epic 12.2).
const EMOTES = ['👏', '🍺', '💨', '🍅'];
const EMOTE_THROTTLE_MS = 1000;
const CHAT_COOLDOWN_MS = 3000; // double du backend (14.4)
const CHAT_MAX_LEN = 60;
const CHAT_FADE_MS = 5000;

function spectatorName() {
  let name = localStorage.getItem('dartsSpectatorName');
  if (!name) {
    name = `Spectateur-${Math.floor(100 + Math.random() * 900)}`;
    localStorage.setItem('dartsSpectatorName', name);
  }
  return name;
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
  const name = useRef(spectatorName()).current;

  useEffect(() => {
    const conn = connectLive(matchId, {
      role: 'spectator',
      name,
      onEvent(e) {
        switch (e.event) {
          case 'STATE':
            setMatch(e.match);
            break;
          case 'DART_THROWN':
            setMatch(m => m && { ...m, turn_player: e.player_id, dart_index: e.dart_index });
            setTurnDarts(prev => [...prev.slice(-2), { ...hitFromDelta(e.score_hit), key: Date.now() }]);
            break;
          case 'TURN_CHANGED':
            setMatch(m => m && { ...m, turn_player: e.player, dart_index: 0, round: e.round ?? m.round });
            setTurnDarts([]);
            break;
          case 'SCORE_UPDATED':
            setMatch(m => m && { ...m, scores: { ...m.scores, ...e.scores }, round: e.round ?? m.round });
            break;
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
    // Room inexistante/expirée : le WS ferme sans STATE — petit timeout UX.
    const t = setTimeout(() => setGone(g => g || !connRef.current), 100);
    return () => { clearTimeout(t); conn.close(); connRef.current = null; };
  }, [matchId, name]);

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
          ? (match.winner ? `🏆 ${match.winner} remporte le match !` : 'Match terminé.')
          : match.turn_player
            ? `${match.turn_player} prépare sa ${(match.dart_index ?? 0) + 1}ᵉ fléchette…`
            : 'En attente du premier lancer…'}
      </div>

      <SvgBoard interactive={false} darts={turnDarts} />

      <div className="watch__scores">
        {scores.map(({ name: p, score }) => (
          <div key={p} className={`watch__score-row${p === match.turn_player ? ' watch__score-row--active' : ''}`}>
            <span>{p}</span>
            <b>{score}</b>
          </div>
        ))}
      </div>

      {/* Chat éphémère (14.2): pas de fond opaque, fondu après 5 s. */}
      <div className="watch__chat">
        {messages.map(m => (
          <p key={m.id} className="watch__chat-msg">
            <b>{m.sender}</b> {m.message}
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
