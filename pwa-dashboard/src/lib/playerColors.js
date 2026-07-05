// Color hashing (Epic 2.3): a player keeps the same curve color forever,
// on every device — derived from the name, no palette index to drift.
// The logged-in user is ALWAYS the app primary red: "moi vs les autres".

const PRIMARY = '#E61E2A';

// FNV-1a — stable, tiny, good spread for short strings.
function hash(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function stringToColor(key) {
  const h = hash(String(key));
  const hue = h % 360;
  // Keep away from the primary red (±25°) so nobody impersonates "me".
  const safeHue = hue < 25 || hue > 335 ? (hue + 60) % 360 : hue;
  const sat = 55 + (h >> 9) % 25; // 55-79%
  const light = 50 + (h >> 17) % 15; // 50-64%
  return `hsl(${safeHue}, ${sat}%, ${light}%)`;
}

export function playerColor(name, currentUserName) {
  return name === currentUserName ? PRIMARY : stringToColor(name);
}
