import { apiGet } from './client.js';

// Toutes les saisons (mensuelles), pour le sélecteur (C6). Chaque saison :
// {id, name, start_date, end_date, is_active}.
export function fetchSeasons() {
  return apiGet('/seasons');
}
