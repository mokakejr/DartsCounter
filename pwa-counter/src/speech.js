// Lecture vocale des messages des gradins (Web Speech API native, style
// Twitch TTS) — file séquentielle anti-chevauchement.
//
// Champ de mines multi-navigateurs, contournements dans l'ordre :
// - Chrome : utterance GC-able avant lecture (référencée jusqu'à onend) ;
//   synthèse auto-suspendue (resume() avant chaque speak)
// - iOS/WebKit : déverrouillage obligatoire par un speak() DANS un geste
//   utilisateur ; une utterance VIDE ('') ne se joue jamais et coince la
//   file (prime avec une espace, volume 1) ; onend non fiable (timeout de
//   secours sinon la file se fige définitivement) ; voix explicite plutôt
//   que le seul hint lang (chargement asynchrone des voix)

let frVoice = null;

function refreshVoices() {
  try {
    const voices = window.speechSynthesis?.getVoices() ?? [];
    frVoice = voices.find(v => v.lang?.toLowerCase().startsWith('fr')) ?? null;
  } catch { /* no-op */ }
}
if (typeof window !== 'undefined' && window.speechSynthesis) {
  refreshVoices();
  window.speechSynthesis.onvoiceschanged = refreshVoices;
}

let primed = false;
function primeSpeech() {
  if (primed) return;
  primed = true;
  try {
    const synth = window.speechSynthesis;
    if (!synth) return;
    synth.cancel(); // réveille le moteur et vide tout résidu (iOS)
    const unlock = new SpeechSynthesisUtterance(' '); // JAMAIS '' sur iOS
    unlock.volume = 1; // volume 0 ne compte pas comme déverrouillage
    unlock.rate = 2;
    synth.speak(unlock);
  } catch { /* no-op */ }
}
if (typeof document !== 'undefined') {
  document.addEventListener('pointerdown', primeSpeech, { once: true, capture: true });
  document.addEventListener('touchend', primeSpeech, { once: true, capture: true });
}

// File séquentielle : un message à la fois, le suivant part sur onend
// (ou sur le timeout de secours si iOS oublie de le déclencher).
const queue = [];
let speaking = false;
const MAX_QUEUE = 3;
const STUCK_TIMEOUT_MS = 15000;

function processQueue() {
  if (speaking || queue.length === 0) return;
  const synth = window.speechSynthesis;
  if (!synth) { queue.length = 0; return; }
  speaking = true;
  const utterance = new SpeechSynthesisUtterance(queue.shift());
  utterance.lang = 'fr-FR';
  if (frVoice) utterance.voice = frVoice;
  utterance.rate = 1.05;
  utterance.volume = 1;
  const timer = setTimeout(done, STUCK_TIMEOUT_MS);
  function done() {
    clearTimeout(timer);
    if (!speaking) return;
    speaking = false;
    processQueue();
  }
  utterance.onend = done;
  utterance.onerror = done;
  try {
    synth.resume();
    synth.speak(utterance);
  } catch {
    done();
  }
}

export function speak(text) {
  if (queue.length >= MAX_QUEUE) return; // les gradins s'emballent : on droppe
  queue.push(text);
  processQueue();
}
