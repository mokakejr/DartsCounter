// Mirrors backend/app/services/elo.py's rank ladder exactly, so the
// dashboard never hardcodes tier boundaries — they're derived from the
// same admin-editable settings (GET /elo/settings) the engine itself uses.

const RANK_TIERS = ['Silver', 'Gold', 'Platinum', 'Diamond'];

const TIER_COLOR_VAR = {
  Bronze: '--tier-bronze',
  Silver: '--tier-silver',
  Gold: '--tier-gold',
  Platinum: '--tier-platinum',
  Diamond: '--tier-diamond',
  Champion: '--tier-champion',
  'Grand Champion': '--tier-grand-champion',
};

// "Silver II" -> "Silver", "Grand Champion" -> "Grand Champion", "Bronze" -> "Bronze"
export function tierOf(rank) {
  if (!rank) return null;
  if (rank.startsWith('Grand Champion')) return 'Grand Champion';
  if (rank.startsWith('Champion')) return 'Champion';
  return rank.split(' ')[0];
}

export function rankColor(rank) {
  return `var(${TIER_COLOR_VAR[tierOf(rank)] || '--text'})`;
}

// [(tierName, lowerBoundInclusive, upperBoundExclusive), ...] ascending,
// Bronze through Grand Champion — see rank_tier_boundaries in elo.py.
export function rankTierBoundaries(settings) {
  const bounds = [['Bronze', -Infinity, settings.bronze_ceiling]];
  const third = settings.rank_tier_value / 3;
  let start = settings.bronze_ceiling;
  for (const tier of RANK_TIERS) {
    ['I', 'II', 'III'].forEach((sub, i) => {
      bounds.push([`${tier} ${sub}`, start + i * third, start + (i + 1) * third]);
    });
    start += settings.rank_tier_value;
  }
  const championSpan = settings.champion_multiplier * settings.rank_tier_value;
  bounds.push(['Champion', start, start + championSpan]);
  start += championSpan;
  bounds.push(['Grand Champion', start, Infinity]);
  return bounds;
}

// [{ range: '0–4', k: 800 }, { range: '5–9', k: 400 }, ...] from the
// admin-configured k_factors/k_thresholds — see get_k_factor in elo.py.
export function kSchedule(settings) {
  const { k_factors, k_thresholds } = settings;
  const rows = [];
  let start = 0;
  k_thresholds.forEach((threshold, i) => {
    rows.push({ range: `${start}–${threshold - 1}`, k: k_factors[i] });
    start = threshold;
  });
  rows.push({ range: `${start}+`, k: k_factors[k_factors.length - 1] });
  return rows;
}
