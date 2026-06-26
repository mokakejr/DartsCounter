"""Python port of shared/achievements-core.mjs — pure logic, no DB dependency.

Call newly_unlocked_per_player(all_games, new_game_id) to detect trophies
unlocked by the latest game. all_games must include the new game already.
"""

from datetime import datetime, timedelta

ALL_MODES = ["Cricket", "SuperCricket", "Shanghai", "FiftyOne"]

FRANCE_WC_DATES = {"2026-06-16", "2026-06-22", "2026-06-26"}

LEVELS = [
    {"lv": 1,  "name": "Bras Cassé",                  "xp": 0},
    {"lv": 2,  "name": "Touriste du Comptoir",         "xp": 100},
    {"lv": 3,  "name": "PMU Lover",                    "xp": 250},
    {"lv": 4,  "name": "Pilier de Bar",                "xp": 450},
    {"lv": 5,  "name": "Pointe Sèche",                 "xp": 700},
    {"lv": 6,  "name": "La Fléchette dans le Sang",    "xp": 1000},
    {"lv": 7,  "name": "Tueur d'Apéro",                "xp": 1400},
    {"lv": 8,  "name": "Roi du Triple 20",             "xp": 1900},
    {"lv": 9,  "name": "Vieux Briscard",               "xp": 2500},
    {"lv": 10, "name": "Biceps en Tungstène",           "xp": 3200},
    {"lv": 11, "name": "Patron du Bar",                "xp": 4000},
    {"lv": 12, "name": "Machine à 180",                "xp": 5000},
    {"lv": 13, "name": "Légende du Zinc",              "xp": 6500},
    {"lv": 14, "name": "Dieu du Comptoir",             "xp": 8500},
]

LEVEL_ICONS = ["🦴", "🍺", "🐎", "🍷", "🎯", "🔥", "🍻", "🎩", "🧔", "💪", "👑", "🚀", "🐐", "🍾"]


def level_for_xp(xp: int) -> dict:
    cur = LEVELS[0]
    for lvl in LEVELS:
        if xp >= lvl["xp"]:
            cur = lvl
    nxt = next((lvl for lvl in LEVELS if lvl["xp"] > xp), None)
    floor = cur["xp"]
    ceil = nxt["xp"] if nxt else cur["xp"]
    pct = round((xp - floor) / (ceil - floor) * 100) if nxt else 100
    return {**cur, "xp": xp, "nextXP": ceil, "pct": pct, "isMax": nxt is None}


def _ensure(S: dict, name: str) -> dict:
    if name not in S:
        S[name] = {
            "name": name, "wins": 0, "games": 0, "total_duration": 0, "xp": 0,
            "cur_streak": 0, "max_streak": 0, "loss_streak": 0, "max_loss_streak": 0,
            "underdog": False, "comeback": False, "phoenix": False,
            "mode_wins": {}, "mode_games": {}, "modes_played": set(), "opponents": set(),
            "shanghai_kill_wins": 0, "cut_throat_wins": 0,
            "speed_win": False, "speed_win_count": 0, "marathon": False, "long_win": False,
            "night_owl": False, "day_keys": set(), "friday13": False,
            "after_midnight": False, "played_sat": False, "played_sun": False,
            "win_dates": [], "max_wins_in_day": 0, "max_wins_in_week": 0,
            "all_modes_bonus": False,
            "beat": {}, "day_games": {}, "day_wins": {}, "day_modes_won": {},
            "perfect_day": False, "max_modes_won_in_day": 0, "distinct_days": 0,
            "max_day_streak": 0, "favorite_mode": None, "level": level_for_xp(0),
        }
    return S[name]


def compute_player_stats(games: list[dict]) -> dict[str, dict]:
    S: dict[str, dict] = {}

    for g in sorted(games, key=lambda x: x["date"]):
        dur = g.get("duration") or 0
        raw_date = g["date"]
        # Accept both ISO strings and datetime objects
        if isinstance(raw_date, str):
            date = datetime.fromisoformat(raw_date.replace("Z", "+00:00"))
        else:
            date = raw_date

        # isoweekday() % 7 → 0=Sunday … 6=Saturday, matching JS getDay()
        wday = date.isoweekday() % 7
        mmdd = date.strftime("%m-%d")
        ymd = date.strftime("%Y-%m-%d")
        hr = date.hour

        for p in (g.get("players") or []):
            s = _ensure(S, p)
            s["games"] += 1
            s["total_duration"] += dur
            s["xp"] += 10
            s["modes_played"].add(g["mode"])
            s["mode_games"][g["mode"]] = s["mode_games"].get(g["mode"], 0) + 1
            s["day_games"][ymd] = s["day_games"].get(ymd, 0) + 1

            for opp in (g.get("players") or []):
                if opp != p:
                    s["opponents"].add(opp)

            if dur > 1800:
                s["marathon"] = True
            if hr >= 22:
                s["night_owl"] = True
            s["day_keys"].add(mmdd)
            s["day_keys"].add(ymd)
            if wday == 5 and date.day == 13:  # Friday (wday 5 in JS) = isoweekday%7==5
                s["friday13"] = True
            if wday == 6:  # Saturday in JS getDay()
                s["played_sat"] = True
            if wday == 0:  # Sunday in JS getDay()
                s["played_sun"] = True
            if hr < 5:
                s["after_midnight"] = True

            if g.get("winner") == p:
                s["wins"] += 1
                s["xp"] += 20
                s["mode_wins"][g["mode"]] = s["mode_wins"].get(g["mode"], 0) + 1
                if len(g.get("players") or []) >= 4:
                    s["xp"] += 10
                if g.get("variant") == "Shanghai Kill":
                    s["shanghai_kill_wins"] += 1
                    s["xp"] += 15
                if g.get("variant") == "Cut Throat":
                    s["cut_throat_wins"] += 1
                if 0 < dur < 120:
                    s["speed_win"] = True
                    s["speed_win_count"] += 1
                if dur > 1800:
                    s["long_win"] = True
                s["day_wins"][ymd] = s["day_wins"].get(ymd, 0) + 1
                if ymd not in s["day_modes_won"]:
                    s["day_modes_won"][ymd] = set()
                s["day_modes_won"][ymd].add(g["mode"])
                for opp in (g.get("players") or []):
                    if opp != p:
                        s["beat"][opp] = s["beat"].get(opp, 0) + 1
                if s["loss_streak"] >= 3:
                    s["underdog"] = True
                if s["loss_streak"] >= 5:
                    s["comeback"] = True
                if s["loss_streak"] >= 7:
                    s["phoenix"] = True
                s["cur_streak"] += 1
                s["loss_streak"] = 0
                if s["cur_streak"] >= 2:
                    s["xp"] += 5 * s["cur_streak"]
                s["max_streak"] = max(s["max_streak"], s["cur_streak"])
                s["win_dates"].append(date)
            else:
                s["cur_streak"] = 0
                s["loss_streak"] += 1
                s["max_loss_streak"] = max(s["max_loss_streak"], s["loss_streak"])

            if not s["all_modes_bonus"] and all(m in s["modes_played"] for m in ALL_MODES):
                s["xp"] += 50
                s["all_modes_bonus"] = True

    # Derived stats (post-loop)
    for s in S.values():
        s["win_dates"].sort()

        # max wins in a single calendar day
        day_count: dict[str, int] = {}
        for d in s["win_dates"]:
            k = d.strftime("%Y-%m-%d")
            day_count[k] = day_count.get(k, 0) + 1
        s["max_wins_in_day"] = max(day_count.values(), default=0)

        # max wins in any 7-day sliding window
        wdates = s["win_dates"]
        max_week = 0
        for i in range(len(wdates)):
            c = sum(1 for j in range(i, len(wdates)) if wdates[j] - wdates[i] <= timedelta(days=7))
            max_week = max(max_week, c)
        s["max_wins_in_week"] = max_week

        # favorite mode
        fav, fav_n = None, -1
        for m, n in s["mode_games"].items():
            if n > fav_n:
                fav_n = n
                fav = m
        s["favorite_mode"] = fav

        s["level"] = level_for_xp(s["xp"])

        # day-based derived stats
        days = list(s["day_games"].keys())
        s["distinct_days"] = len(days)
        s["perfect_day"] = any(
            s["day_games"][d] >= 3 and s["day_wins"].get(d, 0) == s["day_games"][d]
            for d in days
        )
        s["max_modes_won_in_day"] = max(
            (len(modes) for modes in s["day_modes_won"].values()), default=0
        )
        # longest consecutive calendar-day streak
        sorted_days = sorted(days)
        run, best = (1, 1) if sorted_days else (0, 0)
        for i in range(1, len(sorted_days)):
            prev = datetime.fromisoformat(sorted_days[i - 1])
            cur = datetime.fromisoformat(sorted_days[i])
            run = run + 1 if (cur - prev) == timedelta(days=1) else 1
            best = max(best, run)
        s["max_day_streak"] = best

    return S


def _is_goat(s: dict, all_stats: dict) -> bool:
    ranked = sorted(all_stats.values(), key=lambda x: (-x["wins"], -x["games"]))
    return bool(ranked) and ranked[0]["name"] == s["name"] and s["wins"] > 0


def _is_giant_slayer(s: dict, all_stats: dict) -> bool:
    ranked = sorted(all_stats.values(), key=lambda x: (-x["wins"], -x["games"]))
    if not ranked:
        return False
    top = ranked[0]
    return top["name"] != s["name"] and s["beat"].get(top["name"], 0) >= 1


def _is_stakhanoviste(s: dict, all_stats: dict) -> bool:
    ranked = sorted(all_stats.values(), key=lambda x: -x["games"])
    return bool(ranked) and ranked[0]["name"] == s["name"] and s["games"] > 0


# XP rank trophies — one per level; lv=l["lv"] default-captures to avoid closure trap
_XP_RANKS = [
    {
        "id": f"xp_lv{lvl['lv']}",
        "cat": "xp",
        "ico": LEVEL_ICONS[i],
        "name": lvl["name"],
        "desc": (
            f"Atteindre le niveau {lvl['lv']}"
            + (" (max)" if i == len(LEVELS) - 1 else "")
            + f" · {lvl['name']}"
        ),
        "cond": lambda s, _, lv=lvl["lv"]: s["level"]["lv"] >= lv,
    }
    for i, lvl in enumerate(LEVELS)
]

ACHIEVEMENTS: list[dict] = [
    # ── Victoires & séries ──
    {"id": "first_blood",     "cat": "wins",    "ico": "🎯", "name": "Premier Sang",       "desc": "Remporter sa première partie",                  "cond": lambda s, _: s["wins"] >= 1},
    {"id": "hat_trick",       "cat": "wins",    "ico": "🎩", "name": "Hat Trick",           "desc": "3 victoires consécutives",                      "cond": lambda s, _: s["max_streak"] >= 3},
    {"id": "on_fire",         "cat": "wins",    "ico": "🔥", "name": "En Feu",              "desc": "5 victoires consécutives",                      "cond": lambda s, _: s["max_streak"] >= 5},
    {"id": "unstoppable",     "cat": "wins",    "ico": "⚡", "name": "Inarrêtable",         "desc": "10 victoires consécutives",                     "cond": lambda s, _: s["max_streak"] >= 10},
    {"id": "triple_threat",   "cat": "wins",    "ico": "⚔️", "name": "Triple Menace",       "desc": "3 victoires dans la même journée",              "cond": lambda s, _: s["max_wins_in_day"] >= 3},
    {"id": "legend_week",     "cat": "wins",    "ico": "🗓️", "name": "Semaine Légendaire",  "desc": "5 victoires en 7 jours",                        "cond": lambda s, _: s["max_wins_in_week"] >= 5},
    {"id": "dominator",       "cat": "wins",    "ico": "👑", "name": "Dominateur",          "desc": "Win rate > 60% sur 20+ parties",                "cond": lambda s, _: s["games"] >= 20 and s["wins"] / s["games"] > 0.6},
    {"id": "untouchable",     "cat": "wins",    "ico": "🛡️", "name": "Intouchable",         "desc": "Win rate > 75% sur 30+ parties",                "cond": lambda s, _: s["games"] >= 30 and s["wins"] / s["games"] > 0.75},
    {"id": "quarter_century", "cat": "wins",    "ico": "🥈", "name": "Quart de Siècle",     "desc": "25 victoires",                                  "cond": lambda s, _: s["wins"] >= 25},
    {"id": "the_goat",        "cat": "wins",    "ico": "🐐", "name": "GOAT",                "desc": "Le plus de victoires, tous modes",               "cond": _is_goat},
    {"id": "underdog",        "cat": "wins",    "ico": "🐕", "name": "Underdog",            "desc": "Gagner après 3 défaites de suite",               "cond": lambda s, _: s["underdog"]},
    {"id": "comeback_king",   "cat": "wins",    "ico": "🔄", "name": "Roi du Retour",       "desc": "Gagner après 5 défaites de suite",               "cond": lambda s, _: s["comeback"]},
    {"id": "phoenix",         "cat": "wins",    "ico": "🦅", "name": "Phénix",              "desc": "Gagner après 7 défaites de suite",               "cond": lambda s, _: s["phoenix"]},
    # ── Défaites ──
    {"id": "rough_patch",     "cat": "loss",    "ico": "🩹", "name": "Mauvaise Passe",      "desc": "3 défaites consécutives",                       "cond": lambda s, _: s["max_loss_streak"] >= 3},
    {"id": "punching_ball",   "cat": "loss",    "ico": "🥊", "name": "Punching Ball",       "desc": "5 défaites consécutives",                       "cond": lambda s, _: s["max_loss_streak"] >= 5},
    {"id": "desert_crossing", "cat": "loss",    "ico": "🏜️", "name": "Traversée du Désert", "desc": "7 défaites consécutives",                       "cond": lambda s, _: s["max_loss_streak"] >= 7},
    {"id": "cursed",          "cat": "loss",    "ico": "🪦", "name": "Maudit",              "desc": "10 défaites consécutives",                      "cond": lambda s, _: s["max_loss_streak"] >= 10},
    {"id": "bottomless_pit",  "cat": "loss",    "ico": "🕳️", "name": "Puits sans Fond",     "desc": "12 défaites consécutives",                      "cond": lambda s, _: s["max_loss_streak"] >= 12},
    {"id": "are_you_serious", "cat": "loss",    "ico": "😐", "name": "T'es sérieux ?",      "desc": "20 défaites consécutives",                      "cond": lambda s, _: s["max_loss_streak"] >= 20},
    # ── Modes de jeu ──
    {"id": "cricket_master",    "cat": "modes", "ico": "🦗", "name": "Maître du Cricket",   "desc": "10 victoires en Cricket",                       "cond": lambda s, _: s["mode_wins"].get("Cricket", 0) >= 10},
    {"id": "shanghai_killer",   "cat": "modes", "ico": "💥", "name": "Shanghai Killer",     "desc": "Gagner par Shanghai Kill",                      "cond": lambda s, _: s["shanghai_kill_wins"] >= 1},
    {"id": "shanghai_hunter",   "cat": "modes", "ico": "🏹", "name": "Chasseur Shanghai",   "desc": "5 victoires par Shanghai Kill",                 "cond": lambda s, _: s["shanghai_kill_wins"] >= 5},
    {"id": "cricket_tactician", "cat": "modes", "ico": "🧠", "name": "Tacticien",           "desc": "5 victoires en Cut Throat",                     "cond": lambda s, _: s["cut_throat_wins"] >= 5},
    {"id": "all_rounder",       "cat": "modes", "ico": "🌀", "name": "All-Rounder",         "desc": "Une victoire dans chaque mode",                 "cond": lambda s, _: all(s["mode_wins"].get(m, 0) >= 1 for m in ALL_MODES)},
    {"id": "mode_explorer",     "cat": "modes", "ico": "🗺️", "name": "Explorateur",         "desc": "Jouer les 4 modes de jeu",                     "cond": lambda s, _: all(m in s["modes_played"] for m in ALL_MODES)},
    # ── Performance ──
    {"id": "speed_demon",     "cat": "perf",   "ico": "🏎️", "name": "Speed Demon",          "desc": "Victoire en moins de 2 minutes",                "cond": lambda s, _: s["speed_win"]},
    {"id": "marathon",        "cat": "perf",   "ico": "🏃", "name": "Marathonien",          "desc": "Une partie de plus de 30 minutes",              "cond": lambda s, _: s["marathon"]},
    # ── Assiduité ──
    {"id": "fifty",           "cat": "volume", "ico": "🏅", "name": "Fidèle",               "desc": "50 parties jouées",                             "cond": lambda s, _: s["games"] >= 50},
    {"id": "centurion",       "cat": "volume", "ico": "💯", "name": "Centurion",            "desc": "100 parties jouées",                            "cond": lambda s, _: s["games"] >= 100},
    {"id": "veteran",         "cat": "volume", "ico": "🎖️", "name": "Vétéran Assidu",       "desc": "250 parties jouées",                            "cond": lambda s, _: s["games"] >= 250},
    {"id": "social",          "cat": "volume", "ico": "👥", "name": "Sociable",             "desc": "Jouer avec 3 adversaires différents",           "cond": lambda s, _: len(s["opponents"]) >= 3},
    # ── Itération 2 ──
    {"id": "perfectionist",   "cat": "wins",   "ico": "💎", "name": "Perfectionniste",      "desc": "100% de victoires sur 10+ parties",             "cond": lambda s, _: s["games"] >= 10 and s["wins"] == s["games"]},
    {"id": "giant_slayer",    "cat": "wins",   "ico": "🗡️", "name": "Tueur de GOAT",        "desc": "Battre le n°1 du classement",                   "cond": _is_giant_slayer},
    {"id": "nemesis",         "cat": "wins",   "ico": "😈", "name": "Némésis",              "desc": "Battre le même adversaire 5 fois",              "cond": lambda s, _: max(s["beat"].values(), default=0) >= 5},
    {"id": "perfect_day",     "cat": "wins",   "ico": "🎰", "name": "Carton Plein",         "desc": "Une journée de 3+ victoires sans défaite",      "cond": lambda s, _: s["perfect_day"]},
    {"id": "half_century",    "cat": "wins",   "ico": "🏆", "name": "Demi-Siècle",          "desc": "50 victoires",                                  "cond": lambda s, _: s["wins"] >= 50},
    {"id": "double_mode",     "cat": "modes",  "ico": "🤹", "name": "Doublé",               "desc": "Gagner 2 modes différents le même jour",        "cond": lambda s, _: s["max_modes_won_in_day"] >= 2},
    {"id": "master_of_four",  "cat": "modes",  "ico": "🎲", "name": "Maître des 4",         "desc": "5 victoires dans chacun des 4 modes",           "cond": lambda s, _: all(s["mode_wins"].get(m, 0) >= 5 for m in ALL_MODES)},
    {"id": "sniper",          "cat": "perf",   "ico": "🥷", "name": "Sniper",               "desc": "3 victoires éclair (< 2 min)",                  "cond": lambda s, _: s["speed_win_count"] >= 3},
    {"id": "cold_blood",      "cat": "perf",   "ico": "🧊", "name": "Sang-Froid",           "desc": "Gagner une partie de plus de 30 min",           "cond": lambda s, _: s["long_win"]},
    {"id": "stakhanoviste",   "cat": "volume", "ico": "🛠️", "name": "Stakhanoviste",        "desc": "Le plus de parties jouées",                     "cond": _is_stakhanoviste},
    {"id": "regular",         "cat": "volume", "ico": "📅", "name": "Habitué",              "desc": "Jouer 10 jours différents",                     "cond": lambda s, _: s["distinct_days"] >= 10},
    {"id": "consistency",     "cat": "volume", "ico": "⏳", "name": "Régularité",           "desc": "Jouer 3 jours de suite",                        "cond": lambda s, _: s["max_day_streak"] >= 3},
    # ── Jours spéciaux ──
    {"id": "night_owl",       "cat": "special", "ico": "🦉", "name": "Oiseau de Nuit",      "desc": "Une partie après 22h",                          "cond": lambda s, _: s["night_owl"]},
    {"id": "after_hours",     "cat": "special", "ico": "🌙", "name": "After",               "desc": "Une partie entre minuit et 5h",                 "cond": lambda s, _: s["after_midnight"]},
    {"id": "bleus_day",       "cat": "special", "ico": "🐓", "name": "Allez les Bleus",     "desc": "Jouer un jour de match de la France (CDM 2026)", "cond": lambda s, _: any(d in s["day_keys"] for d in FRANCE_WC_DATES)},
    {"id": "darts_final",     "cat": "special", "ico": "🎯", "name": "Finale des Fléchettes","desc": "Jouer un 3 janvier (finale mondiale PDC)",     "cond": lambda s, _: "01-03" in s["day_keys"]},
    {"id": "christmas",       "cat": "special", "ico": "🎄", "name": "Esprit de Noël",      "desc": "Jouer le 24 ou 25 décembre",                    "cond": lambda s, _: "12-24" in s["day_keys"] or "12-25" in s["day_keys"]},
    {"id": "new_year",        "cat": "special", "ico": "🎆", "name": "Réveillon",           "desc": "Jouer le 31 décembre ou le 1er janvier",        "cond": lambda s, _: "12-31" in s["day_keys"] or "01-01" in s["day_keys"]},
    {"id": "halloween",       "cat": "special", "ico": "🎃", "name": "Citrouille",          "desc": "Jouer un 31 octobre",                           "cond": lambda s, _: "10-31" in s["day_keys"]},
    {"id": "april_fools",     "cat": "special", "ico": "🐟", "name": "Poisson d'Avril",     "desc": "Jouer un 1er avril",                            "cond": lambda s, _: "04-01" in s["day_keys"]},
    {"id": "pi_day",          "cat": "special", "ico": "🥧", "name": "Pi Day",              "desc": "Jouer un 14 mars (3.14)",                       "cond": lambda s, _: "03-14" in s["day_keys"]},
    {"id": "friday_13",       "cat": "special", "ico": "🃏", "name": "Vendredi 13",         "desc": "Jouer un vendredi 13",                          "cond": lambda s, _: s["friday13"]},
    {"id": "weekend_warrior", "cat": "special", "ico": "🍻", "name": "Guerrier du Week-end", "desc": "Jouer un samedi et un dimanche",               "cond": lambda s, _: s["played_sat"] and s["played_sun"]},
    *_XP_RANKS,
]


def compute_achievements(stats: dict[str, dict]) -> dict[str, list[str]]:
    """Returns {achievement_id: [player_name, ...]} for all earned achievements."""
    earned: dict[str, list[str]] = {}
    for a in ACHIEVEMENTS:
        earned[a["id"]] = [s["name"] for s in stats.values() if a["cond"](s, stats)]
    return earned


def newly_unlocked_per_player(
    all_games: list[dict], new_game_id: str
) -> dict[str, list[dict]]:
    """Detect trophies unlocked specifically by the game with new_game_id.

    Returns {player_name: [{id, ico, name, desc}, ...]} — only for players
    who both participated in the new game and unlocked at least one trophy.
    """
    new_game = next((g for g in all_games if str(g.get("id")) == new_game_id), None)
    if new_game is None:
        return {}

    game_players = set(new_game.get("players") or [])
    games_before = [g for g in all_games if str(g.get("id")) != new_game_id]

    earned_before = compute_achievements(compute_player_stats(games_before))
    earned_after = compute_achievements(compute_player_stats(all_games))

    result: dict[str, list[dict]] = {}
    for a in ACHIEVEMENTS:
        before_set = set(earned_before.get(a["id"], []))
        for player_name in earned_after.get(a["id"], []):
            if player_name in game_players and player_name not in before_set:
                result.setdefault(player_name, []).append(
                    {"id": a["id"], "ico": a["ico"], "name": a["name"], "desc": a["desc"]}
                )
    return result
