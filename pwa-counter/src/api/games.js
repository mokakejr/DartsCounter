import { apiPost } from './client.js';

export function postGameToServer(payload) {
  return apiPost('/games', payload);
}
