#!/usr/bin/env python3
"""Génère docs/data/games.sample.json — données de démo riches pour l'aperçu du site.
Couvre les 4 modes, toutes les variantes, plusieurs mois, durées variées (speed/marathon),
séries de victoires, parties de nuit, etc. — pour exercer tout le système de gamification.
"""
import json
import os
import random
from datetime import datetime, timedelta, timezone

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

random.seed(42)

PLAYERS = ["Junior", "Léo", "Théo", "Gaétan"]
MODES = [
    ("Cricket", ["Normal", "Cut Throat"]),
    ("SuperCricket", ["Normal", "Cut Throat"]),
    ("Shanghai", ["Normal", "Shanghai Kill"]),
    ("FiftyOne", ["Normal"]),
]

# Biais de talent pour créer un classement clair + des séries
WIN_WEIGHT = {"Junior": 4.0, "Léo": 2.5, "Théo": 1.6, "Gaétan": 1.0}

games = []
start = datetime(2025, 12, 20, 20, 0, tzinfo=timezone.utc)
cur = start
gid = 1700000000000

N = 140
for i in range(N):
    # avance dans le temps de façon irrégulière (soirées groupées)
    cur += timedelta(hours=random.choice([1, 1, 2, 14, 20, 40, 60, 90]))
    # certaines parties tard le soir (night owl)
    hour = random.choice([20, 21, 21, 22, 23, 19])
    date = cur.replace(hour=hour, minute=random.randint(0, 59))

    n_players = random.choice([2, 3, 4, 4, 4])
    players = random.sample(PLAYERS, n_players)

    mode, variants = random.choice(MODES)
    variant = random.choice(variants)

    # vainqueur pondéré par le talent
    weights = [WIN_WEIGHT[p] for p in players]
    winner = random.choices(players, weights=weights, k=1)[0]

    # durée : majorité normale, quelques speed (<120s) et marathons (>1800s)
    r = random.random()
    if r < 0.10:
        duration = random.randint(45, 115)        # speed demon
    elif r < 0.16:
        duration = random.randint(1850, 3200)     # marathon
    else:
        duration = random.randint(180, 1200)

    # scores : winner plus haut
    scores = []
    for p in players:
        if p == winner:
            scores.append(random.randint(6, 9))
        else:
            scores.append(random.randint(0, 5))

    games.append({
        "id": str(gid + i),
        "date": date.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "mode": mode,
        "variant": variant,
        "players": players,
        "scores": scores,
        "winner": winner,
        "duration": duration,
    })

# plus récent en premier (comme la prod)
games.sort(key=lambda g: g["date"], reverse=True)

out = os.path.join(ROOT, "docs", "data", "games.sample.json")
with open(out, "w", encoding="utf-8") as f:
    json.dump(games, f, ensure_ascii=False)

print(f"Wrote {len(games)} games to {out}")
