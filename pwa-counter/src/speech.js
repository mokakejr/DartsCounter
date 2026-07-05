// Lecture vocale des messages des gradins (Web Speech API native, style
// Twitch TTS). Suit le toggle 🔔/🔕 : en Mode Focus, ChatOverlay ne reçoit
// plus de messages, donc plus de voix non plus. no-op si l'API manque.
//
// Deux bugs Chrome connus contournés ici :
// - l'utterance peut être ramassée par le GC avant d'être lue -> on garde
//   une référence tant que la lecture n'est pas terminée
// - la synthèse se met parfois en pause toute seule (onglet en arrière-plan,
//   longue inactivité) -> resume() systématique avant speak()
const inFlight = new Set();
const MAX_QUEUE = 3;

// iOS/WebKit ne joue la synthèse que si un speak() a déjà eu lieu dans un
// geste utilisateur : on "déverrouille" avec une utterance vide au premier
// tap n'importe où dans l'app.
let primed = false;
function primeSpeech() {
  if (primed) return;
  primed = true;
  try {
    const unlock = new SpeechSynthesisUtterance('');
    unlock.volume = 0;
    window.speechSynthesis?.speak(unlock);
  } catch { /* no-op */ }
}
if (typeof document !== 'undefined') {
  document.addEventListener('pointerdown', primeSpeech, { once: true, capture: true });
}

export function speak(text) {
  try {
    const synth = window.speechSynthesis;
    if (!synth || inFlight.size >= MAX_QUEUE) return;
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'fr-FR';
    utterance.rate = 1.05;
    utterance.volume = 1;
    const done = () => inFlight.delete(utterance);
    utterance.onend = done;
    utterance.onerror = done;
    inFlight.add(utterance);
    synth.resume();
    synth.speak(utterance);
  } catch { /* no-op */ }
}
