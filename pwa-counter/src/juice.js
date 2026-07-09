// Feedback viscéral (Epic 4.4): haptique + son, no-op partout où l'API
// n'existe pas. Respecte localStorage.reduce_animations (mode performance).

export function reduced() {
  return localStorage.getItem('reduce_animations') === 'true';
}

export function vibrate(pattern) {
  if (reduced()) return;
  try { navigator.vibrate?.(pattern); } catch { /* no-op */ }
}

let audioCtx = null;

// "Thud" d'impact sans asset binaire: burst de bruit filtré passe-bas via
// WebAudio. ponytail: remplacer par un vrai sample si le rendu déçoit.
export function thud(intensity = 1) {
  if (reduced()) return;
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const ctx = audioCtx;
    const dur = 0.09;
    const buffer = ctx.createBuffer(1, ctx.sampleRate * dur, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / data.length) ** 2;
    }
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 180 + 120 * intensity;
    const gain = ctx.createGain();
    gain.gain.value = Math.min(0.5 * intensity, 0.8);
    src.connect(filter).connect(gain).connect(ctx.destination);
    src.start();
  } catch { /* no-op */ }
}

// « Plopp » aigu et court — l'impact d'une emote des gradins (Epic 12.2).
export function plop() {
  if (reduced()) return;
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const ctx = audioCtx;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(520, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(180, ctx.currentTime + 0.09);
    gain.gain.setValueAtTime(0.25, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.1);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.11);
  } catch { /* no-op */ }
}

// Screen-shake: pose une classe 150ms sur <html>, le CSS fait le reste.
export function shake() {
  if (reduced()) return;
  const el = document.documentElement;
  el.classList.remove('juice-shake');
  void el.offsetWidth; // reflow pour relancer l'animation
  el.classList.add('juice-shake');
  setTimeout(() => el.classList.remove('juice-shake'), 180);
}

// Le combo "gros coup" (triple, bull) — Epic 4.4.
export function bigHit() {
  vibrate(20);
  shake();
  thud(1.4);
}

export function smallHit() {
  vibrate(8);
  thud(0.6);
}
