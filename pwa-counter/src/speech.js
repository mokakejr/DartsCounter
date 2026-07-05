// Lecture vocale des messages des gradins (Web Speech API native, style
// Twitch TTS). Suit le toggle 🔔/🔕 : en Mode Focus, ChatOverlay ne reçoit
// plus de messages, donc plus de voix non plus. no-op si l'API manque.
export function speak(text) {
  try {
    const synth = window.speechSynthesis;
    if (!synth) return;
    // Pas de file interminable si les gradins s'emballent : max 2 en attente.
    if (synth.pending) synth.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'fr-FR';
    utterance.rate = 1.05;
    utterance.volume = 0.9;
    synth.speak(utterance);
  } catch { /* no-op */ }
}
