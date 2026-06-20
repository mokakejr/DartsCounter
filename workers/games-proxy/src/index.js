const ALLOWED_ORIGINS = [
  'https://mokakejr.github.io',
  'http://localhost:5173',
  'http://localhost:4173',
];

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') ?? '';
    const corsHeaders = {
      'Access-Control-Allow-Origin': ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    if (request.method !== 'POST') {
      return new Response('Method not allowed', { status: 405, headers: corsHeaders });
    }

    let game;
    try {
      game = await request.json();
    } catch {
      return new Response('Invalid JSON', { status: 400, headers: corsHeaders });
    }

    if (!game.mode || !Array.isArray(game.players) || !Array.isArray(game.scores)) {
      return new Response('Missing required fields', { status: 400, headers: corsHeaders });
    }

    try {
      await updateGitHub(env, game);
    } catch (err) {
      console.error('GitHub update failed:', err);
      return new Response(`GitHub update failed: ${err.message}`, { status: 502, headers: corsHeaders });
    }

    if (env.GOOGLE_CHAT_WEBHOOK) {
      try {
        await postToChat(env.GOOGLE_CHAT_WEBHOOK, game);
      } catch (err) {
        console.error('Google Chat failed:', err);
      }
    }

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  },
};

// ── GitHub Contents API ────────────────────────────────────────────────────────

async function updateGitHub(env, game) {
  const { GITHUB_TOKEN, GITHUB_REPO_OWNER, GITHUB_REPO_NAME } = env;
  const apiUrl = `https://api.github.com/repos/${GITHUB_REPO_OWNER}/${GITHUB_REPO_NAME}/contents/docs/data/games.json`;
  const ghHeaders = {
    Authorization: `Bearer ${GITHUB_TOKEN}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'DartsCounter-Worker/1.0',
  };

  const getResp = await fetch(apiUrl, { headers: ghHeaders });
  let sha = '';
  let existing = [];

  if (getResp.ok) {
    const data = await getResp.json();
    sha = data.sha ?? '';
    existing = base64ToJson(data.content);
  } else if (getResp.status !== 404) {
    throw new Error(`GET failed: HTTP ${getResp.status}`);
  }

  const updated = [game, ...existing].slice(0, 200);

  const putBody = JSON.stringify({
    message: 'chore: add game result',
    content: jsonToBase64(updated),
    ...(sha ? { sha } : {}),
  });

  const putResp = await fetch(apiUrl, {
    method: 'PUT',
    headers: { ...ghHeaders, 'Content-Type': 'application/json' },
    body: putBody,
  });

  if (!putResp.ok) {
    const text = await putResp.text();
    throw new Error(`PUT failed: HTTP ${putResp.status}: ${text}`);
  }
}

// ── Google Chat card ───────────────────────────────────────────────────────────

async function postToChat(webhookUrl, game) {
  const { mode, variant, players, scores, winner, duration } = game;
  const isShanghaiKill = mode === 'Shanghai' && variant === 'Shanghai Kill';
  const isCutThroat = variant === 'CutThroat';

  const modeLabel = isShanghaiKill
    ? 'SHANGHAI KILL 🎯'
    : variant && variant !== 'Normal'
      ? `${mode} · ${variant}`
      : mode;

  const entries = players.map((name, i) => ({ name, score: scores[i] }));
  const winnerEntries = entries.filter(e => e.name === winner);
  const otherEntries = entries.filter(e => e.name !== winner)
    .sort((a, b) => isCutThroat
      ? (Number(a.score) - Number(b.score))
      : (Number(b.score) - Number(a.score)));
  const sorted = [...winnerEntries, ...otherEntries];
  const total = sorted.length;

  const rankEmojis = ['🥇', '🥈', '🥉', '🪓', '💀'];
  const playerRows = sorted.map(({ name, score }, rank) => {
    const emoji = rankEmojis[rank] ?? '🎯';
    let statusText, colorJson;
    if (rank === 0) {
      statusText = 'VAINQUEUR';
      colorJson = '"red":0,"green":0.8,"blue":0,"alpha":1';
    } else if (rank === total - 1) {
      statusText = 'ELIMINE';
      colorJson = '"red":1,"green":0,"blue":0,"alpha":1';
    } else {
      statusText = 'QUALIFIE';
      colorJson = '"red":0,"green":0.5,"blue":1,"alpha":1';
    }
    const scoreText = isShanghaiKill && rank === 0 ? 'SHANGHAI!' : `${score} pts`;
    return `{"columns":{"columnItems":[` +
      `{"widgets":[{"textParagraph":{"text":"${emoji} ${jsonEsc(name)}"}}]},` +
      `{"widgets":[{"textParagraph":{"text":"${scoreText}"}}]},` +
      `{"widgets":[{"buttonList":{"buttons":[{"text":"${statusText}","color":{${colorJson}}}]}}]}` +
      `]}}`;
  }).join(',');

  const statsUrl = `https://mokakejr.github.io/DartsCounter-/#classement`;
  const durationStr = formatDuration(duration ?? 0);

  const card = `{"cardsV2":[{"cardId":"darts_result","card":{"header":{` +
    `"title":"🎯 ${modeLabel.toUpperCase()} - LE VERDICT",` +
    `"subtitle":"Partie terminée · ${durationStr}",` +
    `"imageUrl":"https://fonts.gstatic.com/s/i/short-term/release/googlesymbols/emoji_events/default/48px.svg",` +
    `"imageType":"CIRCLE"},"sections":[{"widgets":[` +
    `{"columns":{"columnItems":[` +
    `{"widgets":[{"textParagraph":{"text":"JOUEUR"}}]},` +
    `{"widgets":[{"textParagraph":{"text":"SCORE"}}]},` +
    `{"widgets":[{"textParagraph":{"text":"STATUT"}}]}` +
    `]}},{"divider":{}},` +
    playerRows +
    `,{"divider":{}},` +
    `{"buttonList":{"buttons":[{"text":"VOIR LES STATS 📊","onClick":{"openLink":{"url":"${statsUrl}"}}}]}}` +
    `]}]}}]}`;

  const resp = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=UTF-8' },
    body: card,
  });
  if (!resp.ok) {
    throw new Error(`HTTP ${resp.status}`);
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function jsonToBase64(obj) {
  const bytes = new TextEncoder().encode(JSON.stringify(obj));
  let binary = '';
  bytes.forEach(b => { binary += String.fromCharCode(b); });
  return btoa(binary);
}

function base64ToJson(b64) {
  const binary = atob(b64.replace(/\n/g, ''));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return JSON.parse(new TextDecoder().decode(bytes));
}

function jsonEsc(s) {
  return String(s)
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r');
}

function formatDuration(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    : `${m}:${String(s).padStart(2, '0')}`;
}
