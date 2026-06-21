import { useEffect } from 'react';

// Per-league theming: when a league declares a `color`, override the brand
// accent tokens at runtime (on :root) so the whole dashboard re-skins without
// touching tokens.css. When no color is set, we clear the overrides and the
// CSS defaults (red) take over again — no visual regression.

const VARS = ['--primary', '--primary-dim', '--series-1', '--series-2', '--series-3', '--series-4', '--series-5'];

function hexToRgb(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function toHex([r, g, b]) {
  return '#' + [r, g, b].map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
}

// amt > 0 lightens toward white, amt < 0 darkens toward black.
function shade(rgb, amt) {
  const target = amt < 0 ? 0 : 255;
  const t = Math.abs(amt);
  return rgb.map(v => v + (target - v) * t);
}

export function useLeagueTheme(color) {
  useEffect(() => {
    const root = document.documentElement;
    const rgb = color ? hexToRgb(color) : null;

    if (!rgb) {
      VARS.forEach(v => root.style.removeProperty(v));
      return;
    }

    const base = toHex(rgb);
    root.style.setProperty('--primary', base);
    root.style.setProperty('--primary-dim', toHex(shade(rgb, -0.45)));
    root.style.setProperty('--series-1', base);
    root.style.setProperty('--series-2', toHex(shade(rgb, 0.28)));
    root.style.setProperty('--series-3', toHex(shade(rgb, 0.55)));
    root.style.setProperty('--series-4', toHex(shade(rgb, -0.28)));
    root.style.setProperty('--series-5', toHex(shade(rgb, -0.55)));

    return () => { VARS.forEach(v => root.style.removeProperty(v)); };
  }, [color]);
}
