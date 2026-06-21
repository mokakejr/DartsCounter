import { apiGet } from './client.js';

export function fetchPlayers() {
  return apiGet('/players');
}
