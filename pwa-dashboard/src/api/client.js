const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

function authHeaders(token) {
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function parseError(res, url) {
  const err = new Error(`HTTP ${res.status} on ${url}`);
  err.status = res.status;
  try {
    err.detail = (await res.json()).detail;
  } catch {
    // no JSON body — leave err.detail undefined
  }
  return err;
}

export async function apiGet(path, params = {}, token = null) {
  const url = new URL(path, API_URL);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null) url.searchParams.set(key, value);
  }
  const res = await fetch(url, { cache: 'no-store', headers: authHeaders(token) });
  if (!res.ok) throw await parseError(res, url);
  return res.json();
}

export async function apiPost(path, body, token = null) {
  const url = new URL(path, API_URL);
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders(token) },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw await parseError(res, url);
  return res.status === 204 ? null : res.json();
}

export async function apiPatch(path, body, token = null) {
  const url = new URL(path, API_URL);
  const res = await fetch(url, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...authHeaders(token) },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw await parseError(res, url);
  return res.json();
}

// Multipart upload — `params` go on the query string (e.g. ?slot=avatar),
// the file itself goes in the form body alongside the auth header.
export async function apiUpload(path, params, file, token = null) {
  const url = new URL(path, API_URL);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null) url.searchParams.set(key, value);
  }
  const form = new FormData();
  form.append('file', file);
  const res = await fetch(url, { method: 'POST', headers: authHeaders(token), body: form });
  if (!res.ok) throw await parseError(res, url);
  return res.json();
}
