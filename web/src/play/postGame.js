const PROXY_URL = import.meta.env.VITE_PROXY_URL;
const CALLOUT_WH_KEY = 'dartsWebhookUrl';

const MODE_LABELS = {
  Shanghai: 'Shanghai', Cricket: 'Cricket', SuperCricket: 'Super Cricket', FiftyOne: '51',
};

function fmtDuration(s) {
  return `${Math.floor(s / 60)}m${String(s % 60).padStart(2, '0')}s`;
}

function notifyResult({ mode, players, scores, winner, duration }) {
  const url = localStorage.getItem(CALLOUT_WH_KEY);
  if (!url) return;
  const label = MODE_LABELS[mode] ?? mode;
  const lines = players.map((p, i) => `${p} : ${scores[i]} pts`).join('  ·  ');
  const text = `🏆 *${winner}* remporte *${label}* !\n${lines}\n⏱ ${fmtDuration(duration)}`;
  fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }) }).catch(() => {});
}

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
  const now = Date.now();
  const duration = Math.round((now - startedAt) / 1000);
  const payload = {
    id: String(startedAt),
    date: new Date(startedAt).toISOString(),
    mode,
    variant,
    players,
    scores,
    winner: winner ?? '',
    duration,
  };

  if (PROXY_URL) {
    fetch(PROXY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }).catch(() => {});
  }

  notifyResult({ mode, players, scores, winner: winner ?? '', duration });
}
