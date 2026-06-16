// Trophy rarity derived from how many players hold it relative to the roster.
// Rarer = more prestigious. Returns a tier descriptor (or null if locked).
const TIERS = {
  legendary: { key: 'legendary', label: 'Légendaire', color: 'var(--rar-legendary)' },
  epic:      { key: 'epic',      label: 'Épique',     color: 'var(--rar-epic)' },
  rare:      { key: 'rare',      label: 'Rare',       color: 'var(--rar-rare)' },
  common:    { key: 'common',    label: 'Commun',     color: 'var(--rar-common)' },
};

export function rarityTier(earnersCount, totalPlayers) {
  if (!earnersCount) return null; // locked
  const ratio = totalPlayers ? earnersCount / totalPlayers : 1;
  if (earnersCount === 1 || ratio <= 0.2) return TIERS.legendary;
  if (ratio <= 0.4) return TIERS.epic;
  if (ratio <= 0.7) return TIERS.rare;
  return TIERS.common;
}
