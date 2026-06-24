import { apiGet } from './client.js';

export function fetchEloSettings() {
  return apiGet('/elo/settings');
}
