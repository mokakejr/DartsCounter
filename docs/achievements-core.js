/* ════════════════════════════════════════════════════════════════════════
 * achievements-core.js — moteur de trophées PARTAGÉ (navigateur + Node).
 *
 * Source unique de vérité pour : stats par joueur, niveaux/XP, et définition
 * des trophées. Chargé par docs/index.html (en <script src>, avant le script
 * principal) ET par scripts/trophy-announce.js (via require) pour annoncer les
 * nouveaux trophées par webhook sans dupliquer la logique.
 *
 * En navigateur, l'API est exposée en globals (window) ; en Node via exports.
 * ════════════════════════════════════════════════════════════════════════ */
(function (root) {
  'use strict';

  const ALL_MODES = ['Cricket', 'SuperCricket', 'Shanghai', 'FiftyOne'];

  const LEVELS = [
    { lv:1,  name:'Débutant',    xp:0 },    { lv:2,  name:'Apprenti',    xp:100 },
    { lv:3,  name:'Habitué',     xp:250 },  { lv:4,  name:'Compétiteur', xp:450 },
    { lv:5,  name:'Régulier',    xp:700 },  { lv:6,  name:'Affûté',      xp:1000 },
    { lv:7,  name:'Vétéran',     xp:1400 }, { lv:8,  name:'Redoutable',  xp:1900 },
    { lv:9,  name:'Maestro',     xp:2500 }, { lv:10, name:'Expert',      xp:3200 },
    { lv:11, name:'Élite',       xp:4000 }, { lv:12, name:'Champion',    xp:5000 },
    { lv:13, name:'Légende',     xp:6500 }, { lv:14, name:'Immortel',    xp:8500 },
  ];

  // Jours de match de la France à la CDM 2026 (phase de poules, groupe I).
  const FRANCE_WC_DATES = ['2026-06-16', '2026-06-22', '2026-06-26'];

  function levelForXP(xp) {
    let cur = LEVELS[0];
    for (const l of LEVELS) if (xp >= l.xp) cur = l;
    const next = LEVELS.find(l => l.xp > xp) || null;
    const floor = cur.xp;
    const ceil = next ? next.xp : cur.xp;
    const pct = next ? Math.round((xp - floor) / (ceil - floor) * 100) : 100;
    return { ...cur, xp, nextXP: ceil, pct, isMax: !next };
  }

  function chronological(games) {
    return [...games].sort((a, b) => new Date(a.date) - new Date(b.date));
  }

  // One chronological pass computes everything per player.
  function computePlayerStats(games) {
    const S = {};
    const ensure = name => {
      if (!S[name]) S[name] = {
        name, wins:0, games:0, totalDuration:0, xp:0,
        curStreak:0, maxStreak:0, lossStreak:0, maxLossStreak:0, underdog:false, comeback:false,
        modeWins:{}, modeGames:{}, modesPlayed:new Set(), opponents:new Set(),
        shanghaiKillWins:0, cutThroatWins:0, speedWin:false, marathon:false, nightOwl:false,
        dayKeys:new Set(), friday13:false, afterMidnight:false, playedSat:false, playedSun:false,
        winDates:[], maxWinsInDay:0, maxWinsInWeek:0, allModesBonus:false,
      };
      return S[name];
    };

    for (const g of chronological(games)) {
      const dur = g.duration || 0;
      const date = new Date(g.date);
      const mmdd = `${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
      const ymd  = `${date.getFullYear()}-${mmdd}`;
      const wday = date.getDay();        // 0=dim … 6=sam
      const hr   = date.getHours();
      g.players.forEach(p => {
        const s = ensure(p);
        s.games++;
        s.totalDuration += dur;
        s.xp += 10; // played
        s.modesPlayed.add(g.mode);
        s.modeGames[g.mode] = (s.modeGames[g.mode] || 0) + 1;
        g.players.forEach(o => { if (o !== p) s.opponents.add(o); });
        if (dur > 1800) s.marathon = true;
        if (date.getHours() >= 22) s.nightOwl = true;
        s.dayKeys.add(mmdd); s.dayKeys.add(ymd);
        if (wday === 5 && date.getDate() === 13) s.friday13 = true;
        if (wday === 6) s.playedSat = true;
        if (wday === 0) s.playedSun = true;
        if (hr < 5) s.afterMidnight = true;

        if (g.winner === p) {
          s.wins++;
          s.xp += 20; // win
          s.modeWins[g.mode] = (s.modeWins[g.mode] || 0) + 1;
          if (g.players.length >= 4) s.xp += 10; // win vs 3+
          if (g.variant === 'Shanghai Kill') { s.shanghaiKillWins++; s.xp += 15; }
          if (g.variant === 'Cut Throat') s.cutThroatWins++;
          if (dur > 0 && dur < 120) s.speedWin = true;
          if (s.lossStreak >= 3) s.underdog = true;
          if (s.lossStreak >= 5) s.comeback = true;
          s.curStreak++;
          s.lossStreak = 0;
          if (s.curStreak >= 2) s.xp += 5 * s.curStreak; // streak bonus
          s.maxStreak = Math.max(s.maxStreak, s.curStreak);
          s.winDates.push(date);
        } else {
          s.curStreak = 0;
          s.lossStreak++;
          s.maxLossStreak = Math.max(s.maxLossStreak, s.lossStreak);
        }
        // all-modes one-time bonus (playing the 4 modes, win or not)
        if (!s.allModesBonus && ALL_MODES.every(m => s.modesPlayed.has(m))) {
          s.xp += 50; s.allModesBonus = true;
        }
      });
    }

    // derived window stats (wins in day / week)
    Object.values(S).forEach(s => {
      s.winDates.sort((a, b) => a - b);
      // wins per calendar day
      const dayCount = {};
      s.winDates.forEach(d => {
        const k = d.toISOString().slice(0, 10);
        dayCount[k] = (dayCount[k] || 0) + 1;
      });
      s.maxWinsInDay = Object.values(dayCount).reduce((m, v) => Math.max(m, v), 0);
      // sliding 7-day window
      let maxWeek = 0;
      for (let i = 0; i < s.winDates.length; i++) {
        let c = 0;
        for (let j = i; j < s.winDates.length; j++) {
          if (s.winDates[j] - s.winDates[i] <= 7 * 864e5) c++; else break;
        }
        maxWeek = Math.max(maxWeek, c);
      }
      s.maxWinsInWeek = maxWeek;
      // favorite mode
      let fav = null, favN = -1;
      Object.entries(s.modeGames).forEach(([m, n]) => { if (n > favN) { favN = n; fav = m; } });
      s.favoriteMode = fav;
      s.level = levelForXP(s.xp);
    });

    return S;
  }

  function isGoat(s, all) {
    const ranked = Object.values(all).sort((a, b) => b.wins - a.wins || b.games - a.games);
    return ranked.length > 0 && ranked[0].name === s.name && s.wins > 0;
  }

  // Trophées de rang XP : un par niveau (généré depuis LEVELS pour rester synchro).
  const LEVEL_ICONS = ['🌱','📘','🧭','🤺','🔆','🗡️','🪖','😈','🎼','🧪','🏵️','🥇','🌟','🪐'];
  const XP_RANKS = LEVELS.map((l, i) => ({
    id:'xp_lv' + l.lv, cat:'xp', ico:LEVEL_ICONS[i] || '⭐', name:l.name,
    desc:`Atteindre le niveau ${l.lv}${l.lv === LEVELS.length ? ' (max)' : ''} · ${l.name}`,
    cond:s => s.level.lv >= l.lv,
  }));

  // Achievements: cond(stat) où stat est l'objet calculé par joueur ; les achievements
  // "globaux" (ex. the_goat) reçoivent (stat, allStats). `cat` = clé de catégorie d'affichage.
  const ACHIEVEMENTS = [
    // ── Victoires & séries ──
    { id:'first_blood',       cat:'wins', ico:'🎯', name:'Premier Sang',     desc:'Remporter sa première partie',          cond:s => s.wins >= 1 },
    { id:'hat_trick',         cat:'wins', ico:'🎩', name:'Hat Trick',        desc:'3 victoires consécutives',              cond:s => s.maxStreak >= 3 },
    { id:'on_fire',           cat:'wins', ico:'🔥', name:'En Feu',           desc:'5 victoires consécutives',              cond:s => s.maxStreak >= 5 },
    { id:'unstoppable',       cat:'wins', ico:'⚡', name:'Inarrêtable',      desc:'10 victoires consécutives',             cond:s => s.maxStreak >= 10 },
    { id:'triple_threat',     cat:'wins', ico:'⚔️', name:'Triple Menace',    desc:'3 victoires dans la même journée',      cond:s => s.maxWinsInDay >= 3 },
    { id:'legend_week',       cat:'wins', ico:'🗓️', name:'Semaine Légendaire',desc:'5 victoires en 7 jours',               cond:s => s.maxWinsInWeek >= 5 },
    { id:'dominator',         cat:'wins', ico:'👑', name:'Dominateur',       desc:'Win rate > 60% sur 20+ parties',        cond:s => s.games >= 20 && s.wins / s.games > 0.6 },
    { id:'untouchable',       cat:'wins', ico:'🛡️', name:'Intouchable',      desc:'Win rate > 75% sur 30+ parties',        cond:s => s.games >= 30 && s.wins / s.games > 0.75 },
    { id:'quarter_century',   cat:'wins', ico:'🥈', name:'Quart de Siècle',  desc:'25 victoires',                          cond:s => s.wins >= 25 },
    { id:'the_goat',          cat:'wins', ico:'🐐', name:'GOAT',             desc:'Le plus de victoires, tous modes',      cond:(s,all) => isGoat(s, all) },
    { id:'underdog',          cat:'wins', ico:'🐕', name:'Underdog',         desc:'Gagner après 3 défaites de suite',      cond:s => s.underdog },
    { id:'comeback_king',     cat:'wins', ico:'🔄', name:'Roi du Retour',    desc:'Gagner après 5 défaites de suite',      cond:s => s.comeback },

    // ── Défaites ──
    { id:'rough_patch',       cat:'loss', ico:'🩹', name:'Mauvaise Passe',   desc:'3 défaites consécutives',               cond:s => s.maxLossStreak >= 3 },
    { id:'punching_ball',     cat:'loss', ico:'🥊', name:'Punching Ball',    desc:'5 défaites consécutives',               cond:s => s.maxLossStreak >= 5 },
    { id:'desert_crossing',   cat:'loss', ico:'🏜️', name:'Traversée du Désert',desc:'7 défaites consécutives',             cond:s => s.maxLossStreak >= 7 },
    { id:'cursed',            cat:'loss', ico:'🪦', name:'Maudit',           desc:'10 défaites consécutives',              cond:s => s.maxLossStreak >= 10 },

    // ── Modes de jeu ──
    { id:'cricket_master',    cat:'modes', ico:'🦗', name:'Maître du Cricket',desc:'10 victoires en Cricket',              cond:s => (s.modeWins.Cricket||0) >= 10 },
    { id:'shanghai_killer',   cat:'modes', ico:'💥', name:'Shanghai Killer',  desc:'Gagner par Shanghai Kill',             cond:s => s.shanghaiKillWins >= 1 },
    { id:'shanghai_hunter',   cat:'modes', ico:'🏹', name:'Chasseur Shanghai',desc:'5 victoires par Shanghai Kill',        cond:s => s.shanghaiKillWins >= 5 },
    { id:'cricket_tactician', cat:'modes', ico:'🧠', name:'Tacticien',        desc:'5 victoires en Cut Throat',            cond:s => s.cutThroatWins >= 5 },
    { id:'all_rounder',       cat:'modes', ico:'🌀', name:'All-Rounder',      desc:'Une victoire dans chaque mode',        cond:s => ALL_MODES.every(m => (s.modeWins[m]||0) >= 1) },
    { id:'mode_explorer',     cat:'modes', ico:'🗺️', name:'Explorateur',      desc:'Jouer les 4 modes de jeu',             cond:s => ALL_MODES.every(m => s.modesPlayed.has(m)) },

    // ── Performance ──
    { id:'speed_demon',       cat:'perf', ico:'🏎️', name:'Speed Demon',      desc:'Victoire en moins de 2 minutes',        cond:s => s.speedWin },
    { id:'marathon',          cat:'perf', ico:'🏃', name:'Marathonien',      desc:'Une partie de plus de 30 minutes',      cond:s => s.marathon },

    // ── Assiduité ──
    { id:'fifty',             cat:'volume', ico:'🏅', name:'Fidèle',          desc:'50 parties jouées',                    cond:s => s.games >= 50 },
    { id:'centurion',         cat:'volume', ico:'💯', name:'Centurion',       desc:'100 parties jouées',                   cond:s => s.games >= 100 },
    { id:'veteran',           cat:'volume', ico:'🎖️', name:'Vétéran Assidu',  desc:'250 parties jouées',                   cond:s => s.games >= 250 },
    { id:'social',            cat:'volume', ico:'👥', name:'Sociable',        desc:'Jouer avec 3 adversaires différents',  cond:s => s.opponents.size >= 3 },

    // ── XP & progression (un trophée par niveau, généré depuis LEVELS) ──
    ...XP_RANKS,

    // ── Jours spéciaux ──
    { id:'night_owl',         cat:'special', ico:'🦉', name:'Oiseau de Nuit',  desc:'Une partie après 22h',                cond:s => s.nightOwl },
    { id:'after_hours',       cat:'special', ico:'🌙', name:'After',           desc:'Une partie entre minuit et 5h',       cond:s => s.afterMidnight },
    { id:'bleus_day',         cat:'special', ico:'🇫🇷', name:'Allez les Bleus', desc:'Jouer un jour de match de la France (CDM 2026)', cond:s => FRANCE_WC_DATES.some(d => s.dayKeys.has(d)) },
    { id:'darts_final',       cat:'special', ico:'🎯', name:'Finale des Fléchettes', desc:'Jouer un 3 janvier (finale mondiale PDC)',  cond:s => s.dayKeys.has('01-03') },
    { id:'christmas',         cat:'special', ico:'🎄', name:'Esprit de Noël',  desc:'Jouer le 24 ou 25 décembre',          cond:s => s.dayKeys.has('12-24') || s.dayKeys.has('12-25') },
    { id:'new_year',          cat:'special', ico:'🎆', name:'Réveillon',       desc:'Jouer le 31 décembre ou le 1er janvier',cond:s => s.dayKeys.has('12-31') || s.dayKeys.has('01-01') },
    { id:'halloween',         cat:'special', ico:'🎃', name:'Citrouille',      desc:'Jouer un 31 octobre',                 cond:s => s.dayKeys.has('10-31') },
    { id:'april_fools',       cat:'special', ico:'🐟', name:'Poisson d\'Avril',desc:'Jouer un 1er avril',                  cond:s => s.dayKeys.has('04-01') },
    { id:'pi_day',            cat:'special', ico:'🥧', name:'Pi Day',          desc:'Jouer un 14 mars (3.14)',             cond:s => s.dayKeys.has('03-14') },
    { id:'friday_13',         cat:'special', ico:'🃏', name:'Vendredi 13',     desc:'Jouer un vendredi 13',                cond:s => s.friday13 },
    { id:'weekend_warrior',   cat:'special', ico:'🍻', name:'Guerrier du Week-end', desc:'Jouer un samedi et un dimanche', cond:s => s.playedSat && s.playedSun },
  ];

  function computeAchievements(stats) {
    const all = stats;
    const earned = {}; // id -> [{name, wins}]
    ACHIEVEMENTS.forEach(a => {
      earned[a.id] = [];
      Object.values(all).forEach(s => {
        if (a.cond(s, all)) earned[a.id].push({ name: s.name, wins: s.wins });
      });
    });
    return earned;
  }

  const api = {
    ALL_MODES, LEVELS, FRANCE_WC_DATES, LEVEL_ICONS, XP_RANKS, ACHIEVEMENTS,
    levelForXP, chronological, computePlayerStats, isGoat, computeAchievements,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else Object.assign(root, api); // navigateur : expose en globals
})(typeof window !== 'undefined' ? window : globalThis);
