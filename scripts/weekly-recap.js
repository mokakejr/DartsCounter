#!/usr/bin/env node
// Weekly darts recap — posts a Google Chat card every Friday at 17h
// Reads docs/data/games.json, filters current week (Mon→Fri), computes stats, POSTs webhook.

const fs   = require('fs');
const https = require('https');
const url  = require('url');

// ── Config ────────────────────────────────────────────────────────────────────

const WEBHOOK     = process.env.GOOGLE_CHAT_WEBHOOK;
const GAMES_FILE  = 'docs/data/games.json';
const STATS_URL   = `https://${process.env.GITHUB_REPOSITORY_OWNER || 'mokakejr'}.github.io/DartsCounter`;

// ── Helpers ─────────────────────────────��─────────────────────────────────────

function weekBounds() {
  const now = new Date();
  const day = now.getUTCDay(); // 0=Sun
  const mon = new Date(now);
  mon.setUTCDate(now.getUTCDate() - ((day + 6) % 7));
  mon.setUTCHours(0, 0, 0, 0);
  const fri = new Date(now);
  fri.setUTCHours(17, 0, 0, 0);
  return { from: mon.getTime(), to: fri.getTime(), monDate: mon, friDate: fri };
}

function fmtDate(d) {
  return d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
}

function fmtDuration(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h${String(m).padStart(2, '0')}`;
  return `${m}m`;
}

function parseNames(json) {
  try { return JSON.parse(json); } catch {
    return json.replace(/[\[\]"]/g, '').split(',').map(s => s.trim());
  }
}

function rankEmoji(i) {
  return ['🥇', '🥈', '🥉', '🏅', '🏅'][i] ?? '🏅';
}

function modeLabel(m) {
  return { Cricket: 'Cricket', SuperCricket: 'Super Cricket', Shanghai: 'Shanghai', FiftyOne: '51' }[m] ?? m;
}

// ── Send webhook ──────────────────────────────────────────────────────────────

function sendCard(body) {
  if (!WEBHOOK) { console.error('GOOGLE_CHAT_WEBHOOK not set'); process.exit(1); }

  const parsed  = new url.URL(WEBHOOK);
  const options = {
    hostname: parsed.hostname,
    path: parsed.pathname + parsed.search,
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=UTF-8' }
  };

  const req = https.request(options, res => {
    let data = '';
    res.on('data', chunk => { data += chunk; });
    res.on('end', () => {
      if (res.statusCode >= 400) {
        console.error(`Webhook error ${res.statusCode}: ${data}`);
        process.exit(1);
      }
      console.log(`Recap sent (HTTP ${res.statusCode})`);
    });
  });
  req.on('error', e => { console.error('Request error:', e.message); process.exit(1); });
  req.write(body);
  req.end();
}

// ── Build cards ��─────────────────────────────��────────────────────────────────

function buildEmptyCard(monDate, friDate) {
  return JSON.stringify({
    cardsV2: [{
      cardId: 'weekly_recap_empty',
      card: {
        header: {
          title: '🎯 RÉCAP DE LA SEMAINE',
          subtitle: `Du ${fmtDate(monDate)} au ${fmtDate(friDate)}`,
          imageUrl: 'https://fonts.gstatic.com/s/i/short-term/release/googlesymbols/emoji_events/default/48px.svg',
          imageType: 'CIRCLE'
        },
        sections: [{
          widgets: [{ textParagraph: { text: 'Semaine calme... À vos fléchettes la semaine prochaine ! 🎯' } }]
        }]
      }
    }]
  });
}

function buildWeeklyCard(games, monDate, friDate) {
  // ── Per-player stats ──
  const players = {};
  for (const g of games) {
    const names = Array.isArray(g.players) ? g.players : parseNames(g.players);
    for (const name of names) {
      if (!players[name]) players[name] = { wins: 0, played: 0 };
      players[name].played++;
      if (g.winner === name) players[name].wins++;
    }
  }
  const ranked = Object.entries(players)
    .sort((a, b) => b[1].wins - a[1].wins || b[1].played - a[1].played);

  // ── Global ──
  const totalGames   = games.length;
  const totalSeconds = games.reduce((s, g) => s + (g.duration ?? 0), 0);
  const avgSeconds   = Math.round(totalSeconds / totalGames);

  const modeCounts = {};
  for (const g of games) modeCounts[g.mode] = (modeCounts[g.mode] ?? 0) + 1;
  const modeBreakdown = Object.entries(modeCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([m, c]) => `${modeLabel(m)}: ${c}`)
    .join('  ·  ');

  // ── Highlights ──
  const longest       = [...games].sort((a, b) => (b.duration ?? 0) - (a.duration ?? 0))[0];
  const shortest      = [...games].sort((a, b) => (a.duration ?? 0) - (b.duration ?? 0))[0];
  const shanghaiKills = games.filter(g => g.variant === 'Shanghai Kill');

  function gameDesc(g) {
    if (!g) return '—';
    const names = Array.isArray(g.players) ? g.players : parseNames(g.players);
    return `${names.join(' vs ')} — ${fmtDuration(g.duration ?? 0)} (${modeLabel(g.mode)})`;
  }

  const highlightLines = [
    `⏱️ Partie la + longue : ${gameDesc(longest)}`,
    `⚡ Partie la + courte : ${gameDesc(shortest)}`,
    ...shanghaiKills.map(g => `💥 Shanghai Kill : ${g.winner} !`)
  ].join('\n');

  // ── Ranking rows (one columns widget per player) ──
  const rankingWidgets = [
    {
      columns: {
        columnItems: [
          { widgets: [{ textParagraph: { text: '*JOUEUR*' } }] },
          { widgets: [{ textParagraph: { text: '*VICTOIRES*' } }] },
          { widgets: [{ textParagraph: { text: '*PARTIES*' } }] }
        ]
      }
    },
    { divider: {} },
    ...ranked.map(([name, s], i) => {
      const rate   = Math.round((s.wins / s.played) * 100);
      const wLabel = s.wins === 1 ? '1 victoire' : `${s.wins} victoires`;
      return {
        columns: {
          columnItems: [
            { widgets: [{ textParagraph: { text: `${rankEmoji(i)} ${name}` } }] },
            { widgets: [{ textParagraph: { text: `${wLabel} (${rate}%)` } }] },
            { widgets: [{ textParagraph: { text: `${s.played} partie${s.played > 1 ? 's' : ''}` } }] }
          ]
        }
      };
    })
  ];

  return JSON.stringify({
    cardsV2: [{
      cardId: 'weekly_recap',
      card: {
        header: {
          title: '🎯 RÉCAP DE LA SEMAINE',
          subtitle: `Du ${fmtDate(monDate)} au ${fmtDate(friDate)}`,
          imageUrl: 'https://fonts.gstatic.com/s/i/short-term/release/googlesymbols/emoji_events/default/48px.svg',
          imageType: 'CIRCLE'
        },
        sections: [
          {
            header: '🏅 CLASSEMENT',
            widgets: rankingWidgets
          },
          {
            header: '📊 EN CHIFFRES',
            widgets: [{
              textParagraph: {
                text:
                  `Parties jouées : *${totalGames}*\n` +
                  `Temps total    : *${fmtDuration(totalSeconds)}*\n` +
                  `Durée moyenne  : *${fmtDuration(avgSeconds)}*\n` +
                  `Modes          : ${modeBreakdown}`
              }
            }]
          },
          {
            header: '⭐ HIGHLIGHTS',
            widgets: [
              { textParagraph: { text: highlightLines } },
              { divider: {} },
              { buttonList: { buttons: [{ text: 'VOIR TOUTES LES STATS 📊', onClick: { openLink: { url: STATS_URL } } }] } }
            ]
          }
        ]
      }
    }]
  });
}

// ── Main ──────────���───────────────────────────────────────────────────────────

function main() {
  if (!fs.existsSync(GAMES_FILE)) {
    console.log('No games file found — skipping recap.');
    process.exit(0);
  }

  const raw  = fs.readFileSync(GAMES_FILE, 'utf8').replace(/﻿/g, '');
  const all  = JSON.parse(raw);
  const { from, to, monDate, friDate } = weekBounds();

  const games = all.filter(g => {
    if (!g.date) return false;
    const t = new Date(g.date).getTime();
    return t >= from && t <= to;
  });

  console.log(`Week: ${fmtDate(monDate)} → ${fmtDate(friDate)} | Games found: ${games.length}`);

  if (games.length === 0) {
    sendCard(buildEmptyCard(monDate, friDate));
  } else {
    sendCard(buildWeeklyCard(games, monDate, friDate));
  }
}

main();
