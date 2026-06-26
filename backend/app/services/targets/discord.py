import httpx

from app.services.recap import fmt_duration, mode_label, rank_emoji, summarize_week
from app.services.targets.base import GameEvent

COLOR_GAME = 0xE53935   # matches the PWAs' red/black palette
COLOR_RECAP = 0xFFC107
COLOR_TROPHY = 0xFFD700  # gold for trophy announcements


class DiscordTarget:
    def __init__(self, url: str) -> None:
        self.url = url

    async def send(self, event: GameEvent) -> None:
        if event.type == "game_finished":
            body = _game_finished_body(event.data)
        elif event.type == "weekly_recap":
            body = _weekly_recap_body(event.data)
        elif event.type == "player_ping":
            body = _player_ping_body(event.data)
        else:
            return
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.post(self.url, json=body)
            resp.raise_for_status()


def _game_finished_body(data: dict) -> dict:
    label = mode_label(data["mode"])
    winner = data.get("winner")
    title = f"🏆 {winner} remporte {label} !" if winner else f"🤝 Égalité en {label} !"

    players = data.get("players", [])
    scores = data.get("scores", [])
    score_lines = "\n".join(
        f"{rank_emoji(i)} **{p}** — {s} pts"
        for i, (p, s) in enumerate(zip(players, scores))
    )

    main_embed = {
        "title": title,
        "color": COLOR_GAME,
        "fields": [
            {"name": "🎯 Scores", "value": score_lines or "—", "inline": False},
            {"name": "⏱ Durée", "value": fmt_duration(data.get("duration", 0)), "inline": True},
        ],
    }

    # Trophy embed — only when at least one player unlocked something
    trophies: dict[str, list[dict]] = data.get("trophies") or {}
    trophy_players = [p for p in players if p in trophies]

    embeds = [main_embed]
    if trophy_players:
        trophy_lines = "\n".join(
            f"🎉 **{player}**\n" + "\n".join(
                f"{t['ico']} **{t['name']}** — {t['desc']}"
                for t in trophies[player]
            )
            for player in trophy_players
        )
        embeds.append({
            "title": "🏅 Nouveaux Trophées !",
            "description": trophy_lines,
            "color": COLOR_TROPHY,
        })

    return {"embeds": embeds}


def _player_ping_body(data: dict) -> dict:
    return {"content": f"🎯 **{data['by']}** propose une partie de fléchettes ! Qui est chaud ?"}


def _weekly_recap_body(data: dict) -> dict:
    summary = summarize_week(data["games"])
    title = "🎯 Récap de la semaine"
    description = f"Du {data['from_label']} au {data['to_label']}"

    if summary.is_empty:
        return {"embeds": [{
            "title": title,
            "description": f"{description}\n\nSemaine calme... À vos fléchettes la semaine prochaine ! 🎯",
            "color": COLOR_RECAP,
        }]}

    ranking_lines = "\n".join(
        f"{rank_emoji(i)} **{s.name}** — {s.wins} victoire{'s' if s.wins != 1 else ''} "
        f"({s.win_rate}%) · {s.played} partie{'s' if s.played > 1 else ''}"
        for i, s in enumerate(summary.ranking)
    )

    def game_desc(g: dict | None) -> str:
        if not g:
            return "—"
        return f"{' vs '.join(g['players'])} — {fmt_duration(g.get('duration', 0))} ({mode_label(g['mode'])})"

    highlight_lines = [
        f"⏱️ Partie la + longue : {game_desc(summary.longest)}",
        f"⚡ Partie la + courte : {game_desc(summary.shortest)}",
        *[f"💥 Shanghai Kill : {g['winner']} !" for g in summary.shanghai_kills],
    ]

    return {
        "embeds": [{
            "title": title,
            "description": description,
            "color": COLOR_RECAP,
            "url": data["dashboard_url"],
            "fields": [
                {"name": "🏅 Classement", "value": ranking_lines, "inline": False},
                {"name": "📊 En chiffres", "value": (
                    f"Parties jouées : **{summary.total_games}**\n"
                    f"Temps total : **{fmt_duration(summary.total_seconds)}**\n"
                    f"Durée moyenne : **{fmt_duration(summary.avg_seconds)}**\n"
                    f"Modes : {summary.mode_breakdown}"
                ), "inline": False},
                {"name": "⭐ Highlights", "value": "\n".join(highlight_lines), "inline": False},
            ],
        }],
    }
