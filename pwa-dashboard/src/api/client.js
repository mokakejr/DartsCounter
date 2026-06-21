const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

export async function apiGet(path, params = {}) {
  const url = new URL(path, API_URL);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null) url.searchParams.set(key, value);
  }
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`HTTP ${res.status} on ${url}`);
  return res.json();
}
