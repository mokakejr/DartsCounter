import { apiDelete, apiGet, apiPatch, apiPost } from './client.js';

export function fetchMyLeagues(token) {
  return apiGet('/leagues/mine', {}, token);
}

export function createLeague(token, name) {
  return apiPost('/leagues', { name }, token);
}

export function joinLeague(token, code) {
  return apiPost('/leagues/join', { code }, token);
}

export function renameLeague(token, leagueId, name) {
  return apiPatch(`/leagues/${leagueId}`, { name }, token);
}

export function deleteLeague(token, leagueId) {
  return apiDelete(`/leagues/${leagueId}`, token);
}

export function addLeagueMember(token, leagueId, name) {
  return apiPost(`/leagues/${leagueId}/members`, { name }, token);
}

export function removeLeagueMember(token, leagueId, playerId) {
  return apiDelete(`/leagues/${leagueId}/members/${playerId}`, token);
}
