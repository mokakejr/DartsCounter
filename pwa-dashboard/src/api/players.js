import { apiGet, apiPatch, apiPost, apiUpload } from './client.js';

export function fetchPlayers() {
  return apiGet('/players');
}

export function fetchMe(token) {
  return apiGet('/players/me', {}, token);
}

export function signup(name, password) {
  return apiPost('/auth/signup', { name, password });
}

export function login(name, password) {
  return apiPost('/auth/login', { name, password });
}

export function updateProfile(token, updates) {
  return apiPatch('/players/me', updates, token);
}

// slot: 'avatar' | 'flight'
export function uploadImage(token, slot, file) {
  return apiUpload('/players/me/image', { slot }, file, token);
}

export function ping(token) {
  return apiPost('/players/ping', {}, token);
}

export function fetchPlayerRatings(name) {
  return apiGet(`/players/${encodeURIComponent(name)}/ratings`);
}

// scope: omit for every scope (global + each mode), or pass one to filter.
export function fetchPlayerEloHistory(name, scope) {
  return apiGet(`/players/${encodeURIComponent(name)}/elo-history`, scope ? { scope } : {});
}
