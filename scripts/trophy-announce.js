#!/usr/bin/env node
// Trophy announcer — posts a Google Chat card when the latest game unlocks
// one or more trophies (for one or more players).
//
// Triggered by .github/workflows/trophy-announce.yml on push to games.json.
// Reuses the shared trophy engine (shared/achievements-core.mjs) so the logic
// never drifts from the dashboard. The engine is ESM, loaded via dynamic import.

const fs    = require('fs');
const https = require('https');
const url   = require('url');
const path  = require('path');

// ── Config ──────────────────────────────────────────────────────────────────
const WEBHOOK    = (process.env.GOOGLE_CHAT_WEBHOOK || '').trim();
const GAMES_FILE = 'docs/data/games.json';
const STATS_URL  = `https://${process.env.GITHUB_REPOSITORY_OWNER || 'mokakejr'}.github.io/DartsCounter`;
const TROPHY_IMG = 'https://fonts.gstatic.com/s/i/short-term/release/googlesymbols/emoji_events/default/48px.svg';

// ── Send webhook (même pattern que weekly-recap.js) ───────────────────────────
function sendCard(body) {
  if (!WEBHOOK) {
    console.error(`GOOGLE_CHAT_WEBHOOK is empty (length=${process.env.GOOGLE_CHAT_WEBHOOK?.length ?? 0}).`);
    process.exit(1);
  }
  const parsed  = new url.URL(WEBHOOK);
  const options = {
    hostname: parsed.hostname,
    path: parsed.pathname + parsed.search,
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=UTF-8' },
  };
  const req = https.request(options, res => {
    let data = '';
    res.on('data', c => { data += c; });
    res.on('end', () => {
      if (res.statusCode >= 400) { console.error(`Webhook error ${res.statusCode}: ${data}`); process.exit(1); }
      console.log(`Trophy announcement sent (HTTP ${res.statusCode})`);
    });
  });
  req.on('error', e => { console.error('Request error:', e.message); process.exit(1); });
  req.write(body);
  req.end();
}

// ── Detect newly-unlocked trophies ────────────────────────────────────────────
// Compare trophy holders with vs without the most recent game (games[0], car
// l'app insère en tête). Renvoie { joueur: [trophée, …] } pour les nouveaux.
function newlyUnlocked(allGames, core) {
  const earnedAfter  = core.computeAchievements(core.computePlayerStats(allGames));
  const earnedBefore = core.computeAchievements(core.computePlayerStats(allGames.slice(1)));
  const byPlayer = {};
  for (const a of core.ACHIEVEMENTS) {
    const before = new Set((earnedBefore[a.id] || []).map(e => e.name));
    for (const e of (earnedAfter[a.id] || [])) {
      if (!before.has(e.name)) (byPlayer[e.name] = byPlayer[e.name] || []).push(a);
    }
  }
  return byPlayer;
}

// ── Build card ────────────────────────────────────────────────────────────────
function buildCard(byPlayer) {
  const players = Object.keys(byPlayer);
  const total   = players.reduce((n, p) => n + byPlayer[p].length, 0);

  const sections = players.map(name => {
    const achs  = byPlayer[name];
    const lines = achs.map(a => `${a.ico} <b>${a.name}</b> — ${a.desc}`).join('<br>');
    const buttons = achs.slice(0, 6).map(a => ({
      text: `${a.ico} ${a.name}`,
      onClick: { openLink: { url: `${STATS_URL}/#trophee/${a.id}` } },
    }));
    return {
      header: `🎉 ${name}`,
      widgets: [
        { textParagraph: { text: lines } },
        { buttonList: { buttons } },
      ],
    };
  });

  return JSON.stringify({
    cardsV2: [{
      cardId: 'trophy_unlock',
      card: {
        header: {
          title: total > 1 ? '🏆 NOUVEAUX TROPHÉES !' : '🏆 NOUVEAU TROPHÉE !',
          subtitle: players.length > 1
            ? `${players.length} joueurs à l'honneur · ${total} trophées`
            : `${players[0]} décroche ${total > 1 ? total + ' trophées' : 'un trophée'}`,
          imageUrl: TROPHY_IMG,
          imageType: 'CIRCLE',
        },
        sections,
      },
    }],
  });
}

// ── Main ────────────────────────────────────────────────────────────────────
async function main() {
  if (!fs.existsSync(GAMES_FILE)) { console.log('No games file — skipping.'); process.exit(0); }
  const raw = fs.readFileSync(GAMES_FILE, 'utf8').replace(/﻿/g, '');
  const all = JSON.parse(raw);
  if (!Array.isArray(all) || all.length === 0) { console.log('No games — skipping.'); process.exit(0); }

  // Shared trophy engine is ESM — load it via dynamic import from CommonJS.
  const coreUrl = require('url').pathToFileURL(path.join(__dirname, '..', 'shared', 'achievements-core.mjs')).href;
  const core = await import(coreUrl);

  const byPlayer = newlyUnlocked(all, core);
  const players = Object.keys(byPlayer);
  if (players.length === 0) { console.log('No new trophy from the latest game — skipping.'); process.exit(0); }

  console.log('New trophies:', players.map(p => `${p}: ${byPlayer[p].map(a => a.id).join(', ')}`).join(' | '));
  sendCard(buildCard(byPlayer));
}

main().catch(e => { console.error(e); process.exit(1); });
