import { useEffect } from 'react';
import { plop, reduced } from '../juice.js';
import './EmoteSplash.css';

// Une emote des gradins traverse brièvement l'écran des joueurs (Epic 12.2)
// avec un léger « plopp ». Rendu conditionné au Mode Focus par l'appelant.
export default function EmoteSplash({ emote }) {
  useEffect(() => {
    if (emote) plop();
  }, [emote]);

  if (!emote || reduced()) return null;
  return (
    <div key={emote.key} className="emote-splash" aria-hidden>
      <span className="emote-splash__glyph">{emote.emote}</span>
    </div>
  );
}
