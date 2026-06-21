import httpx

from app.services.recap import fmt_duration, mode_label, rank_emoji, summarize_week
from app.services.targets.base import GameEvent

COLOR_GAME = 0xE53935  # matches the PWAs' red/black palette
COLOR_RECAP = 0xFFC107


class DiscordTarget:
    def __init__(self, url: str) -> None:
        self.url = url

    async def send(self, event: GameEvent) -> None:
        if event.type == "game_finished":
            body = _game_finished_body(event.data)
        elif event.type == "weekly_recap":
            body = _weekly_recap_body(event.data)
        else:
            return
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.post(self.url, json=body)
            resp.raise_for_status()


def _game_finished_body(data: dict) -> dict:
    label = mode_label(data["mode"])
    lines = "\n".join(f"**{p}** : {s} pts" for p, s in zip(data["players"], data["scores"]))
    winner = data.get("winner")
    title = f"🏆 {winner} remporte {label} !" if winner else f"🤝 Égalité en {label} !"
    return {
        "embeds": [{
            "title": title,
            "description": lines,
            "color": COLOR_GAME,
            "footer": {"text": f"⏱ {fmt_duration(data.get('duration', 0))}"},
        }],
    }


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
