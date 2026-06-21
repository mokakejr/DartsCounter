const PROXY_URL = import.meta.env.VITE_PROXY_URL;

/**
 * Fire-and-forget: push a league to the Cloudflare Worker proxy, which upserts
 * it (by id) into docs/data/leagues.json via the GitHub Contents API. Mirrors
 * play/postGame.js. Returns the fetch promise so callers can await persistence
 * if they want to refetch afterwards.
 *
 * @param {object}   league
 * @param {string}   league.id        – stable league id
 * @param {string}   league.name      – display name
 * @param {string[]} league.players   – roster
 * @param {string=}  league.color     – optional theme hex
 */
export function postLeague(league) {
  if (!PROXY_URL) return Promise.resolve();
  return fetch(`${PROXY_URL}/league`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(league),
  }).catch(() => {});
}
