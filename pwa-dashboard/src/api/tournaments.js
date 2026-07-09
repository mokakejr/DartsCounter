import { apiGet, apiPost } from './client.js';

export function fetchTournaments(leagueId) {
  return apiGet('/tournaments', { league_id: leagueId });
}

export function fetchSeason() {
  return apiGet('/seasons/current');
}

export function createTournament(token, payload) {
  return apiPost('/tournaments', payload, token);
}

export function enterTournament(tournamentId, name) {
  return apiPost(`/tournaments/${tournamentId}/enter`, { name });
}
