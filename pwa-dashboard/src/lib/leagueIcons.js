// League icon presets (Epic 3.2 step 2) — ids are stored on the backend,
// rendering stays client-side. ponytail: emoji glyphs; swap for real SVGs
// if branding ever matters.
export const LEAGUE_ICONS = [
  { id: 'target', glyph: '🎯' },
  { id: 'beer', glyph: '🍺' },
  { id: 'crown', glyph: '👑' },
  { id: 'fire', glyph: '🔥' },
  { id: 'skull', glyph: '💀' },
  { id: 'boar', glyph: '🐗' },
  { id: 'bolt', glyph: '⚡' },
  { id: 'joker', glyph: '🃏' },
  { id: 'trophy', glyph: '🏆' },
  { id: 'tavern', glyph: '🍻' },
];

export function leagueGlyph(iconId) {
  return LEAGUE_ICONS.find(i => i.id === iconId)?.glyph ?? '🎯';
}
