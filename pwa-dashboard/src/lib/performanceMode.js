// Mode Performance (Epic 8.4): kill animated glows/canvas on weak devices.
// Input latency always beats cosmetics — CSS keys off
// <html data-reduce-animations="1">.
const KEY = 'reduce_animations';

export function isReducedAnimations() {
  return localStorage.getItem(KEY) === 'true';
}

export function setReducedAnimations(value) {
  localStorage.setItem(KEY, value ? 'true' : 'false');
  applyReducedAnimations();
}

export function applyReducedAnimations() {
  document.documentElement.toggleAttribute('data-reduce-animations', isReducedAnimations());
}
