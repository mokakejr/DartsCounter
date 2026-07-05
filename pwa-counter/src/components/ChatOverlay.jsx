import { useEffect, useState } from 'react';
import { speak } from '../speech.js';
import './ChatOverlay.css';

/**
 * Chat des gradins côté joueur : mêmes règles que l'écran spectateur —
 * texte fugace sans fond opaque (text-shadow seul), disparition après 5 s,
 * jamais interactif (pointer-events none). Alimenté par les CHAT_MESSAGE
 * reçus via useLiveMatch ; muet en Mode Focus (le serveur ne les envoie
 * déjà plus, ceci est la double sécurité).
 */
const FADE_MS = 5000;
const MAX_SHOWN = 4;

export default function ChatOverlay({ message }) {
  const [messages, setMessages] = useState([]);

  useEffect(() => {
    if (!message) return;
    // Lecture vocale façon Twitch — les mains du joueur sont occupées.
    speak(`${message.sender_id} dit : ${message.message}`);
    const id = message.key;
    setMessages(prev => [...prev.slice(-(MAX_SHOWN - 1)), message]);
    const t = setTimeout(() => {
      setMessages(prev => prev.filter(m => m.key !== id));
    }, FADE_MS);
    return () => clearTimeout(t);
  }, [message]);

  if (messages.length === 0) return null;
  return (
    <div className="chat-overlay" aria-live="polite">
      {messages.map(m => (
        <p key={m.key} className="chat-overlay__msg">
          <b>{m.sender_id}</b> {m.message}
        </p>
      ))}
    </div>
  );
}
