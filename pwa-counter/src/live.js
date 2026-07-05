// Client live (Epic 11): création de match éphémère + room WebSocket.
// TOUT est best-effort — hors-ligne ou backend sans /live, le jeu local
// fonctionne exactement comme avant (aucune erreur ne remonte à l'UI).

import { apiPost } from './api/client.js';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';
const WS_URL = API_URL.replace(/^http/, 'ws');

export async function createLiveMatch({ mode, players, variant = null, remote = false }) {
  try {
    return await apiPost('/live/matches', { mode, players, variant, remote });
  } catch {
    return null;
  }
}

/**
 * Room WebSocket avec reconnexion simple et file d'émission.
 * onEvent(payload) reçoit tous les événements entrants.
 */
export function connectLive(matchId, { role, name, onEvent }) {
  let socket = null;
  let closed = false;
  let retries = 0;
  const queue = [];

  function open() {
    if (closed) return;
    try {
      socket = new WebSocket(
        `${WS_URL}/ws/live/${matchId}?role=${encodeURIComponent(role)}&name=${encodeURIComponent(name)}`
      );
    } catch {
      return;
    }
    socket.onopen = () => {
      retries = 0;
      while (queue.length) socket.send(JSON.stringify(queue.shift()));
    };
    socket.onmessage = (e) => {
      try { onEvent?.(JSON.parse(e.data)); } catch { /* frame illisible */ }
    };
    socket.onclose = () => {
      socket = null;
      if (!closed && retries < 5) {
        retries += 1;
        setTimeout(open, Math.min(1000 * retries, 5000));
      }
    };
    socket.onerror = () => {};
  }

  open();

  return {
    send(event) {
      if (closed) return;
      if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(event));
      else if (queue.length < 50) queue.push(event);
    },
    close() {
      closed = true;
      socket?.close();
    },
  };
}
