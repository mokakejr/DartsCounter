// Lecture vocale des messages des gradins (Web Speech API native, style
// Twitch TTS). Suit le toggle 🔔/🔕 : en Mode Focus, ChatOverlay ne reçoit
// plus de messages, donc plus de voix non plus. no-op si l'API manque.
//
// Champ de mines multi-navigateurs, contournements dans l'ordre :
// - Chrome : l'utterance peut être ramassée par le GC avant lecture (on la
//   référence jusqu'à la fin) ; la synthèse s'auto-suspend (resume() avant
//   chaque speak)
// - iOS/WebKit : la synthèse doit être déverrouillée par un speak() DANS un
//   geste utilisateur ; une utterance VIDE ('') ne se joue jamais et coince
//   toute la file (on prime avec une espace) ; cancel() de réveil d'abord ;
//   onend n'est pas fiable (nettoyage par timeout sinon la file "pleine"
//   coupe le son définitivement) ; mieux vaut une voix explicite que le
//   seul hint lang quand les voix chargent en asynchrone

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

const inFlight = new Set();
const MAX_QUEUE = 3;
const STUCK_TIMEOUT_MS = 15000;

export function speak(text) {
  try {
    const synth = window.speechSynthesis;
    if (!synth || inFlight.size >= MAX_QUEUE) return;
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'fr-FR';
    if (frVoice) utterance.voice = frVoice;
    utterance.rate = 1.05;
    utterance.volume = 1;
    const timer = setTimeout(() => inFlight.delete(utterance), STUCK_TIMEOUT_MS);
    const done = () => {
      clearTimeout(timer);
      inFlight.delete(utterance);
    };
    utterance.onend = done;
    utterance.onerror = done;
    inFlight.add(utterance);
    synth.resume();
    synth.speak(utterance);
  } catch { /* no-op */ }
}
