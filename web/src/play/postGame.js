const PROXY_URL = import.meta.env.VITE_PROXY_URL;

/**
 * Fire-and-forget: send a finished game to the Cloudflare Worker proxy,
 * which writes it to docs/data/games.json via the GitHub Contents API.
 *
 * @param {object} opts
 * @param {string}   opts.mode      – 'Shanghai' | 'Cricket' | 'SuperCricket' | 'FiftyOne'
 * @param {string}   opts.variant   – 'Normal' | 'Shanghai Kill' | 'CutThroat'
 * @param {string[]} opts.players   – player names in original order
 * @param {number[]} opts.scores    – parallel to players
 * @param {string}   opts.winner    – winning player name, or '' for tie
 * @param {number}   opts.startedAt – Date.now() captured when the game screen mounted
 */
export function postGame({ mode, variant, players, scores, winner, startedAt }) {
  if (!PROXY_URL) return;

  const now = Date.now();
  const payload = {
    id: String(startedAt),
    date: new Date(startedAt).toISOString(),
    mode,
    variant,
    players,
    scores,
    winner: winner ?? '',
    duration: Math.round((now - startedAt) / 1000),
  };

  fetch(PROXY_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }).catch(() => {});
}
