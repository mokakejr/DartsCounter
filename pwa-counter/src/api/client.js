const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

// A couple of quick retries smooth over transient blips (flaky wifi at the
// dartboard) without immediately falling back to the offline queue for
// every momentary hiccup.
async function withRetry(fn, attempts = 2, delayMs = 400) {
  let lastErr;
  for (let i = 0; i <= attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (i < attempts) await new Promise(r => setTimeout(r, delayMs * (i + 1)));
    }
  }
  throw lastErr;
}

export async function apiGet(path, params = {}) {
  return withRetry(async () => {
    const url = new URL(path, API_URL);
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null) url.searchParams.set(key, value);
    }
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status} on ${url}`);
    return res.json();
  });
}

export async function apiPost(path, body) {
  return withRetry(async () => {
    const res = await fetch(new URL(path, API_URL), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} on ${path}`);
    return res.json();
  });
}
