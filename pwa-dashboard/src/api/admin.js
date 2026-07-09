import { apiDelete, apiGet, apiPatch, apiPost } from './client.js';

export const adminLogs = (token, limit = 100) =>
  apiGet('/admin/logs', { limit }, token);

// Games
export const adminDeleteGame = (token, gameId) =>
  apiDelete(`/admin/games/${gameId}`, token);

// ELO & Trophies
export const adminRecomputeElo = (token) =>
  apiPost('/admin/elo/recompute', {}, token);

export const adminRecomputeTrophies = (token) =>
  apiPost('/admin/trophies/recompute', {}, token);

// Players
export const adminListPlayers = (token) =>
  apiGet('/admin/players', {}, token);

export const adminResetPassword = (token, playerId, newPassword) =>
  apiPatch(`/admin/players/${playerId}/password`, { new_password: newPassword }, token);

export const adminSetRole = (token, playerId, isAdmin) =>
  apiPatch(`/admin/players/${playerId}/role`, { is_admin: isAdmin }, token);

// Webhooks
export const adminListWebhooks = (token) =>
  apiGet('/admin/webhooks', {}, token);

export const adminToggleWebhook = (token, webhookId) =>
  apiPatch(`/admin/webhooks/${webhookId}/toggle`, {}, token);

export const adminTestWebhook = (token, webhookId) =>
  apiPost(`/admin/webhooks/${webhookId}/test`, {}, token);

// Seasons
export const adminListSeasons = (token) =>
  apiGet('/admin/seasons', {}, token);

export const adminCreateSeason = (token, name, startDate) =>
  apiPost('/admin/seasons', { name, start_date: startDate ?? null }, token);

export const adminUpdateSeason = (token, seasonId, data) =>
  apiPatch(`/admin/seasons/${seasonId}`, data, token);
