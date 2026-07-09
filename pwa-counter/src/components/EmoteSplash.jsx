import { useEffect, useRef, useState } from 'react';
import { plop, reduced } from '../juice.js';
import './EmoteSplash.css';

// Une emote des gradins traverse brièvement l'écran des joueurs (Epic 12.2)
// avec un léger « plopp ». Rendu conditionné au Mode Focus par l'appelant.
// La garde lastKey évite de rejouer la dernière emote au réveil de la cloche.
export default function EmoteSplash({ emote }) {
  const lastKey = useRef(null);
  const [current, setCurrent] = useState(null);

  useEffect(() => {
    if (!emote || emote.key === lastKey.current) return;
    lastKey.current = emote.key;
    setCurrent(emote);
    plop();
  }, [emote]);

  if (!current || reduced()) return null;
  return (
    <div key={current.key} className="emote-splash" aria-hidden>
      <span className="emote-splash__glyph">{current.emote}</span>
    </div>
  );
}
