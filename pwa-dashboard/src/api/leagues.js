import { apiDelete, apiGet, apiPatch, apiPost } from './client.js';

export function fetchMyLeagues(token) {
  return apiGet('/leagues/mine', {}, token);
}

export function fetchPublicLeagues(token) {
  return apiGet('/leagues/public', {}, token);
}

export function createLeague(token, { name, motto, icon, privacy_level }) {
  return apiPost('/leagues', { name, motto, icon, privacy_level }, token);
}

export function joinLeague(token, code) {
  return apiPost('/leagues/join', { code }, token);
}

// PUBLIC league: joins directly; APPLICATION league: files a PENDING request.
export function joinLeagueDirect(token, leagueId) {
  return apiPost(`/leagues/${leagueId}/join`, {}, token);
}

export function updateLeague(token, leagueId, fields) {
  return apiPatch(`/leagues/${leagueId}`, fields, token);
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

export function setMemberRole(token, leagueId, playerId, role) {
  return apiPatch(`/leagues/${leagueId}/members/${playerId}/role`, { role }, token);
}

export function fetchJoinRequests(token, leagueId) {
  return apiGet(`/leagues/${leagueId}/requests`, {}, token);
}

export function decideJoinRequest(token, leagueId, playerId, action) {
  return apiPost(`/leagues/${leagueId}/requests/${playerId}`, { action }, token);
}

export function fetchDisputes(token, leagueId) {
  return apiGet(`/leagues/${leagueId}/disputes`, {}, token);
}

export function adjudicateGame(token, gameId, action) {
  return apiPost(`/games/${gameId}/adjudicate`, { action }, token);
}

export function reportGame(token, gameId, reason) {
  return apiPost(`/games/${gameId}/report`, { reason }, token);
}

export function fetchLeagueEvents(token, leagueId, { limit = 50, offset = 0 } = {}) {
  return apiGet(`/leagues/${leagueId}/events`, { limit, offset }, token);
}

export function respectEvent(token, leagueId, eventId) {
  return apiPost(`/leagues/${leagueId}/events/${eventId}/respect`, {}, token);
}

export function provokeEvent(token, leagueId, eventId) {
  return apiPost(`/leagues/${leagueId}/events/${eventId}/provoke`, {}, token);
}

export function fetchPantheon(token, leagueId) {
  return apiGet(`/leagues/${leagueId}/pantheon`, {}, token);
}

export function setLeagueWebhook(token, leagueId, webhookUrl) {
  return apiPatch(`/leagues/${leagueId}/webhook`, { webhook_url: webhookUrl }, token);
}

export function testLeagueWebhook(token, leagueId) {
  return apiPost(`/leagues/${leagueId}/webhook/test`, {}, token);
}
