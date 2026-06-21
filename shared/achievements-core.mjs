/* ════════════════════════════════════════════════════════════════════════
 * achievements-core.mjs — moteur de trophées PARTAGÉ (ESM).
 *
 * Source unique de vérité pour : stats par joueur, niveaux/XP, et définition
 * des trophées. Importé par le front React (pwa-dashboard/) ET par scripts/trophy-announce.js.
 * Aucune dépendance, aucune API DOM — logique pure portable.
 * ════════════════════════════════════════════════════════════════════════ */

export const ALL_MODES = ['Cricket', 'SuperCricket', 'Shanghai', 'FiftyOne'];

export const LEVELS = [
  { lv:1,  name:'Bras Cassé',                xp:0 },    { lv:2,  name:'Touriste du Comptoir',     xp:100 },
  { lv:3,  name:'PMU Lover',                 xp:250 },  { lv:4,  name:'Pilier de Bar',            xp:450 },
  { lv:5,  name:'Pointe Sèche',              xp:700 },  { lv:6,  name:'La Fléchette dans le Sang',xp:1000 },
  { lv:7,  name:"Tueur d'Apéro",             xp:1400 }, { lv:8,  name:'Roi du Triple 20',         xp:1900 },
  { lv:9,  name:'Vieux Briscard',            xp:2500 }, { lv:10, name:'Biceps en Tungstène',      xp:3200 },
  { lv:11, name:'Patron du Bar',             xp:4000 }, { lv:12, name:'Machine à 180',            xp:5000 },
  { lv:13, name:'Légende du Zinc',           xp:6500 }, { lv:14, name:'Dieu du Comptoir',         xp:8500 },
];

// Jours de match de la France à la CDM 2026 (phase de poules, groupe I).
export const FRANCE_WC_DATES = ['2026-06-16', '2026-06-22', '2026-06-26'];

export function levelForXP(xp) {
  let cur = LEVELS[0];
  for (const l of LEVELS) if (xp >= l.xp) cur = l;
  const next = LEVELS.find(l => l.xp > xp) || null;
  const floor = cur.xp;
  const ceil = next ? next.xp : cur.xp;
  const pct = next ? Math.round((xp - floor) / (ceil - floor) * 100) : 100;
  return { ...cur, xp, nextXP: ceil, pct, isMax: !next };
}

export function chronological(games) {
  return [...games].sort((a, b) => new Date(a.date) - new Date(b.date));
}

// One chronological pass computes everything per player.
export function computePlayerStats(games) {
  const S = {};
  const ensure = name => {
    if (!S[name]) S[name] = {
      name, wins:0, games:0, totalDuration:0, xp:0,
      curStreak:0, maxStreak:0, lossStreak:0, maxLossStreak:0, underdog:false, comeback:false, phoenix:false,
      modeWins:{}, modeGames:{}, modesPlayed:new Set(), opponents:new Set(),
      shanghaiKillWins:0, cutThroatWins:0, speedWin:false, marathon:false, nightOwl:false,
      dayKeys:new Set(), friday13:false, afterMidnight:false, playedSat:false, playedSun:false,
      winDates:[], maxWinsInDay:0, maxWinsInWeek:0, allModesBonus:false,
      // itération 2 — champs additionnels pour les nouveaux trophées
      beat:{}, speedWinCount:0, longWin:false,
      dayGames:{}, dayWins:{}, dayModesWon:{},
      perfectDay:false, maxModesWonInDay:0, distinctDays:0, maxDayStreak:0,
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
    (g.players ?? []).forEach(p => {
      const s = ensure(p);
      s.games++;
      s.totalDuration += dur;
      s.xp += 10; // played
      s.modesPlayed.add(g.mode);
      s.modeGames[g.mode] = (s.modeGames[g.mode] || 0) + 1;
      s.dayGames[ymd] = (s.dayGames[ymd] || 0) + 1;
      g.players.forEach(o => { if (o !== p) s.opponents.add(o); });
      if (dur > 1800) s.marathon = true;
      if (hr >= 22) s.nightOwl = true;
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
        if (dur > 0 && dur < 120) { s.speedWin = true; s.speedWinCount++; }
        if (dur > 1800) s.longWin = true;
        s.dayWins[ymd] = (s.dayWins[ymd] || 0) + 1;
        (s.dayModesWon[ymd] = s.dayModesWon[ymd] || new Set()).add(g.mode);
        g.players.forEach(o => { if (o !== p) s.beat[o] = (s.beat[o] || 0) + 1; });
        if (s.lossStreak >= 3) s.underdog = true;
        if (s.lossStreak >= 5) s.comeback = true;
        if (s.lossStreak >= 7) s.phoenix = true;
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

    // per-day derived stats (itération 2)
    const days = Object.keys(s.dayGames);
    s.distinctDays = days.length;
    s.perfectDay = days.some(d => s.dayGames[d] >= 3 && (s.dayWins[d] || 0) === s.dayGames[d]);
    s.maxModesWonInDay = Object.values(s.dayModesWon).reduce((m, set) => Math.max(m, set.size), 0);
    // longest run of consecutive calendar days played
    const sorted = days.slice().sort();
    let run = sorted.length ? 1 : 0, best = run;
    for (let i = 1; i < sorted.length; i++) {
      const prev = new Date(sorted[i - 1] + 'T00:00:00Z');
      const cur = new Date(sorted[i] + 'T00:00:00Z');
      run = (cur - prev === 864e5) ? run + 1 : 1;
      best = Math.max(best, run);
    }
    s.maxDayStreak = best;
  });

  return S;
}

export function isGoat(s, all) {
  const ranked = Object.values(all).sort((a, b) => b.wins - a.wins || b.games - a.games);
  return ranked.length > 0 && ranked[0].name === s.name && s.wins > 0;
}

// Trophées de rang XP : un par niveau (généré depuis LEVELS pour rester synchro).
export const LEVEL_ICONS = ['🦴','🍺','🐎','🍷','🎯','🔥','🍻','🎩','🧔','💪','👑','🚀','🐐','🍾'];
export const XP_RANKS = LEVELS.map((l, i) => ({
  id:'xp_lv' + l.lv, cat:'xp', ico:LEVEL_ICONS[i] || '⭐', name:l.name,
  desc:`Atteindre le niveau ${l.lv}${l.lv === LEVELS.length ? ' (max)' : ''} · ${l.name}`,
  cond:s => s.level.lv >= l.lv,
}));

// Achievements: cond(stat) où stat est l'objet calculé par joueur ; les achievements
// "globaux" (ex. the_goat) reçoivent (stat, allStats). `cat` = clé de catégorie d'affichage.
export const ACHIEVEMENTS = [
  // ── Victoires & séries ──
  { id:'first_blood',       cat:'wins', ico:'🎯', name:'Premier Sang',     desc:'Remporter sa première partie',          cond:s => s.wins >= 1, prog:s => [s.wins, 1] },
  { id:'hat_trick',         cat:'wins', ico:'🎩', name:'Hat Trick',        desc:'3 victoires consécutives',              cond:s => s.maxStreak >= 3, prog:s => [s.maxStreak, 3] },
  { id:'on_fire',           cat:'wins', ico:'🔥', name:'En Feu',           desc:'5 victoires consécutives',              cond:s => s.maxStreak >= 5, prog:s => [s.maxStreak, 5] },
  { id:'unstoppable',       cat:'wins', ico:'⚡', name:'Inarrêtable',      desc:'10 victoires consécutives',             cond:s => s.maxStreak >= 10, prog:s => [s.maxStreak, 10] },
  { id:'triple_threat',     cat:'wins', ico:'⚔️', name:'Triple Menace',    desc:'3 victoires dans la même journée',      cond:s => s.maxWinsInDay >= 3, prog:s => [s.maxWinsInDay, 3] },
  { id:'legend_week',       cat:'wins', ico:'🗓️', name:'Semaine Légendaire',desc:'5 victoires en 7 jours',               cond:s => s.maxWinsInWeek >= 5, prog:s => [s.maxWinsInWeek, 5] },
  { id:'dominator',         cat:'wins', ico:'👑', name:'Dominateur',       desc:'Win rate > 60% sur 20+ parties',        cond:s => s.games >= 20 && s.wins / s.games > 0.6 },
  { id:'untouchable',       cat:'wins', ico:'🛡️', name:'Intouchable',      desc:'Win rate > 75% sur 30+ parties',        cond:s => s.games >= 30 && s.wins / s.games > 0.75 },
  { id:'quarter_century',   cat:'wins', ico:'🥈', name:'Quart de Siècle',  desc:'25 victoires',                          cond:s => s.wins >= 25, prog:s => [s.wins, 25] },
  { id:'the_goat',          cat:'wins', ico:'🐐', name:'GOAT',             desc:'Le plus de victoires, tous modes',      cond:(s,all) => isGoat(s, all) },
  { id:'underdog',          cat:'wins', ico:'🐕', name:'Underdog',         desc:'Gagner après 3 défaites de suite',      cond:s => s.underdog },
  { id:'comeback_king',     cat:'wins', ico:'🔄', name:'Roi du Retour',    desc:'Gagner après 5 défaites de suite',      cond:s => s.comeback },
  { id:'phoenix',           cat:'wins', ico:'🦅', name:'Phénix',           desc:'Gagner après 7 défaites de suite',      cond:s => s.phoenix },

  // ── Défaites ──
  { id:'rough_patch',       cat:'loss', ico:'🩹', name:'Mauvaise Passe',   desc:'3 défaites consécutives',               cond:s => s.maxLossStreak >= 3,  prog:s => [s.maxLossStreak, 3] },
  { id:'punching_ball',     cat:'loss', ico:'🥊', name:'Punching Ball',    desc:'5 défaites consécutives',               cond:s => s.maxLossStreak >= 5,  prog:s => [s.maxLossStreak, 5] },
  { id:'desert_crossing',   cat:'loss', ico:'🏜️', name:'Traversée du Désert',desc:'7 défaites consécutives',             cond:s => s.maxLossStreak >= 7,  prog:s => [s.maxLossStreak, 7] },
  { id:'cursed',            cat:'loss', ico:'🪦', name:'Maudit',           desc:'10 défaites consécutives',              cond:s => s.maxLossStreak >= 10, prog:s => [s.maxLossStreak, 10] },
  { id:'bottomless_pit',    cat:'loss', ico:'🕳️', name:'Puits sans Fond',  desc:'12 défaites consécutives',              cond:s => s.maxLossStreak >= 12, prog:s => [s.maxLossStreak, 12] },
  { id:'are_you_serious',   cat:'loss', ico:'😐', name:"T'es sérieux ?",    desc:'20 défaites consécutives',              cond:s => s.maxLossStreak >= 20, prog:s => [s.maxLossStreak, 20] },

  // ── Modes de jeu ──
  { id:'cricket_master',    cat:'modes', ico:'🦗', name:'Maître du Cricket',desc:'10 victoires en Cricket',              cond:s => (s.modeWins.Cricket||0) >= 10, prog:s => [s.modeWins.Cricket||0, 10] },
  { id:'shanghai_killer',   cat:'modes', ico:'💥', name:'Shanghai Killer',  desc:'Gagner par Shanghai Kill',             cond:s => s.shanghaiKillWins >= 1 },
  { id:'shanghai_hunter',   cat:'modes', ico:'🏹', name:'Chasseur Shanghai',desc:'5 victoires par Shanghai Kill',        cond:s => s.shanghaiKillWins >= 5, prog:s => [s.shanghaiKillWins, 5] },
  { id:'cricket_tactician', cat:'modes', ico:'🧠', name:'Tacticien',        desc:'5 victoires en Cut Throat',            cond:s => s.cutThroatWins >= 5, prog:s => [s.cutThroatWins, 5] },
  { id:'all_rounder',       cat:'modes', ico:'🌀', name:'All-Rounder',      desc:'Une victoire dans chaque mode',        cond:s => ALL_MODES.every(m => (s.modeWins[m]||0) >= 1) },
  { id:'mode_explorer',     cat:'modes', ico:'🗺️', name:'Explorateur',      desc:'Jouer les 4 modes de jeu',             cond:s => ALL_MODES.every(m => s.modesPlayed.has(m)) },

  // ── Performance ──
  { id:'speed_demon',       cat:'perf', ico:'🏎️', name:'Speed Demon',      desc:'Victoire en moins de 2 minutes',        cond:s => s.speedWin },
  { id:'marathon',          cat:'perf', ico:'🏃', name:'Marathonien',      desc:'Une partie de plus de 30 minutes',      cond:s => s.marathon },

  // ── Assiduité ──
  { id:'fifty',             cat:'volume', ico:'🏅', name:'Fidèle',          desc:'50 parties jouées',                    cond:s => s.games >= 50, prog:s => [s.games, 50] },
  { id:'centurion',         cat:'volume', ico:'💯', name:'Centurion',       desc:'100 parties jouées',                   cond:s => s.games >= 100, prog:s => [s.games, 100] },
  { id:'veteran',           cat:'volume', ico:'🎖️', name:'Vétéran Assidu',  desc:'250 parties jouées',                   cond:s => s.games >= 250, prog:s => [s.games, 250] },
  { id:'social',            cat:'volume', ico:'👥', name:'Sociable',        desc:'Jouer avec 3 adversaires différents',  cond:s => s.opponents.size >= 3, prog:s => [s.opponents.size, 3] },

  // ── Itération 2 — nouveaux trophées ──
  { id:'perfectionist',     cat:'wins',  ico:'💎', name:'Perfectionniste', desc:'100% de victoires sur 10+ parties',     cond:s => s.games >= 10 && s.wins === s.games, prog:s => [s.wins === s.games ? s.games : 0, 10] },
  { id:'giant_slayer',      cat:'wins',  ico:'🗡️', name:'Tueur de GOAT',    desc:'Battre le n°1 du classement',           cond:(s,all) => { const g = Object.values(all).sort((a,b)=>b.wins-a.wins||b.games-a.games)[0]; return g && g.name !== s.name && (s.beat[g.name]||0) >= 1; } },
  { id:'nemesis',           cat:'wins',  ico:'😈', name:'Némésis',          desc:'Battre le même adversaire 5 fois',      cond:s => Math.max(0, ...Object.values(s.beat)) >= 5, prog:s => [Math.max(0, ...Object.values(s.beat)), 5] },
  { id:'perfect_day',       cat:'wins',  ico:'🎰', name:'Carton Plein',     desc:'Une journée de 3+ victoires sans défaite', cond:s => s.perfectDay },
  { id:'half_century',      cat:'wins',  ico:'🏆', name:'Demi-Siècle',      desc:'50 victoires',                          cond:s => s.wins >= 50, prog:s => [s.wins, 50] },
  { id:'double_mode',       cat:'modes', ico:'🤹', name:'Doublé',           desc:'Gagner 2 modes différents le même jour', cond:s => s.maxModesWonInDay >= 2, prog:s => [s.maxModesWonInDay, 2] },
  { id:'master_of_four',    cat:'modes', ico:'🎲', name:'Maître des 4',     desc:'5 victoires dans chacun des 4 modes',   cond:s => ALL_MODES.every(m => (s.modeWins[m]||0) >= 5), prog:s => [ALL_MODES.filter(m => (s.modeWins[m]||0) >= 5).length, 4] },
  { id:'sniper',            cat:'perf',  ico:'🥷', name:'Sniper',           desc:'3 victoires éclair (< 2 min)',          cond:s => s.speedWinCount >= 3, prog:s => [s.speedWinCount, 3] },
  { id:'cold_blood',        cat:'perf',  ico:'🧊', name:'Sang-Froid',       desc:'Gagner une partie de plus de 30 min',   cond:s => s.longWin },
  { id:'stakhanoviste',     cat:'volume',ico:'🛠️', name:'Stakhanoviste',    desc:'Le plus de parties jouées',             cond:(s,all) => { const t = Object.values(all).sort((a,b)=>b.games-a.games)[0]; return t && t.name === s.name && s.games > 0; } },
  { id:'regular',           cat:'volume',ico:'📅', name:'Habitué',          desc:'Jouer 10 jours différents',             cond:s => s.distinctDays >= 10, prog:s => [s.distinctDays, 10] },
  { id:'consistency',       cat:'volume',ico:'⏳', name:'Régularité',       desc:'Jouer 3 jours de suite',                cond:s => s.maxDayStreak >= 3, prog:s => [s.maxDayStreak, 3] },

  // ── XP & progression (un trophée par niveau, généré depuis LEVELS) ──
  ...XP_RANKS,

  // ── Jours spéciaux ──
  { id:'night_owl',         cat:'special', ico:'🦉', name:'Oiseau de Nuit',  desc:'Une partie après 22h',                cond:s => s.nightOwl },
  { id:'after_hours',       cat:'special', ico:'🌙', name:'After',           desc:'Une partie entre minuit et 5h',       cond:s => s.afterMidnight },
  { id:'bleus_day',         cat:'special', ico:'🐓', name:'Allez les Bleus', desc:'Jouer un jour de match de la France (CDM 2026)', cond:s => FRANCE_WC_DATES.some(d => s.dayKeys.has(d)) },
  { id:'darts_final',       cat:'special', ico:'🎯', name:'Finale des Fléchettes', desc:'Jouer un 3 janvier (finale mondiale PDC)',  cond:s => s.dayKeys.has('01-03') },
  { id:'christmas',         cat:'special', ico:'🎄', name:'Esprit de Noël',  desc:'Jouer le 24 ou 25 décembre',          cond:s => s.dayKeys.has('12-24') || s.dayKeys.has('12-25') },
  { id:'new_year',          cat:'special', ico:'🎆', name:'Réveillon',       desc:'Jouer le 31 décembre ou le 1er janvier',cond:s => s.dayKeys.has('12-31') || s.dayKeys.has('01-01') },
  { id:'halloween',         cat:'special', ico:'🎃', name:'Citrouille',      desc:'Jouer un 31 octobre',                 cond:s => s.dayKeys.has('10-31') },
  { id:'april_fools',       cat:'special', ico:'🐟', name:"Poisson d'Avril", desc:'Jouer un 1er avril',                  cond:s => s.dayKeys.has('04-01') },
  { id:'pi_day',            cat:'special', ico:'🥧', name:'Pi Day',          desc:'Jouer un 14 mars (3.14)',             cond:s => s.dayKeys.has('03-14') },
  { id:'friday_13',         cat:'special', ico:'🃏', name:'Vendredi 13',     desc:'Jouer un vendredi 13',                cond:s => s.friday13 },
  { id:'weekend_warrior',   cat:'special', ico:'🍻', name:'Guerrier du Week-end', desc:'Jouer un samedi et un dimanche', cond:s => s.playedSat && s.playedSun },
];

export function computeAchievements(stats) {
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
