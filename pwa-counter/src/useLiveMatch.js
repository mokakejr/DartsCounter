import { useCallback, useEffect, useRef, useState } from 'react';
import { connectLive } from './live.js';

/**
 * Côté joueur : connexion à la room du match (si un liveId a été créé au
 * setup), émission de deltas + réception des emotes des gradins (Epic 12.2).
 * Tout est no-op quand liveId est null (hors-ligne, backend ancien, solo).
 */
export function useLiveMatch(liveId, name, { onEvent } = {}) {
  const connRef = useRef(null);
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;
  const [emote, setEmote] = useState(null); // {emote, sender_id, key}

  useEffect(() => {
    if (!liveId) return undefined;
    const conn = connectLive(liveId, {
      role: 'player',
      name,
      onEvent: (payload) => {
        if (payload.event === 'EMOTE') {
          setEmote({ ...payload, key: Date.now() + Math.random() });
        }
        onEventRef.current?.(payload);
      },
    });
    connRef.current = conn;
    return () => { conn.close(); connRef.current = null; };
    // name volontairement figé à la connexion (identité du socket)
  }, [liveId]); // eslint-disable-line react-hooks/exhaustive-deps

  const emit = useCallback((event) => connRef.current?.send(event), []);

  return { emit, emote };
}
