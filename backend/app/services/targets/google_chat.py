"""Port of the old scripts/trophy-announce.js + scripts/weekly-recap.js webhook
calls — same Google Chat card formats, now built server-side from real DB data
instead of a checked-out games.json.
"""

import httpx

from app.services.recap import fmt_duration, mode_label, rank_emoji, summarize_week
from app.services.targets.base import GameEvent

TROPHY_IMG = "https://fonts.gstatic.com/s/i/short-term/release/googlesymbols/emoji_events/default/48px.svg"


class GoogleChatTarget:
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
    lines = "  ·  ".join(f"{p} : {s} pts" for p, s in zip(data["players"], data["scores"]))
    duration = fmt_duration(data.get("duration", 0))
    winner = data.get("winner")
    text = (
        f"🏆 *{winner}* remporte *{label}* !\n{lines}\n⏱ {duration}"
        if winner
        else f"🤝 Égalité en *{label}* !\n{lines}\n⏱ {duration}"
    )
    return {"text": text}


def _player_ping_body(data: dict) -> dict:
    return {"text": f"🎯 *{data['by']}* propose une partie de fléchettes ! Qui est chaud ?"}


def _weekly_recap_body(data: dict) -> dict:
    summary = summarize_week(data["games"])
    header = {
        "title": "🎯 RÉCAP DE LA SEMAINE",
        "subtitle": f"Du {data['from_label']} au {data['to_label']}",
        "imageUrl": TROPHY_IMG,
        "imageType": "CIRCLE",
    }

    if summary.is_empty:
        return {
            "cardsV2": [{
                "cardId": "weekly_recap_empty",
                "card": {
                    "header": header,
                    "sections": [{
                        "widgets": [{"textParagraph": {
                            "text": "Semaine calme... À vos fléchettes la semaine prochaine ! 🎯",
                        }}],
                    }],
                },
            }],
        }

    def game_desc(g: dict | None) -> str:
        if not g:
            return "—"
        return f"{' vs '.join(g['players'])} — {fmt_duration(g.get('duration', 0))} ({mode_label(g['mode'])})"

    ranking_widgets = [
        {"columns": {"columnItems": [
            {"widgets": [{"textParagraph": {"text": f"{rank_emoji(i)} {s.name}"}}]},
            {"widgets": [{"textParagraph": {
                "text": f"{s.wins} victoire{'s' if s.wins != 1 else ''} ({s.win_rate}%)",
            }}]},
            {"widgets": [{"textParagraph": {"text": f"{s.played} partie{'s' if s.played > 1 else ''}"}}]},
        ]}}
        for i, s in enumerate(summary.ranking)
    ]

    highlight_lines = [
        f"⏱️ Partie la + longue : {game_desc(summary.longest)}",
        f"⚡ Partie la + courte : {game_desc(summary.shortest)}",
        *[f"💥 Shanghai Kill : {g['winner']} !" for g in summary.shanghai_kills],
    ]

    return {
        "cardsV2": [{
            "cardId": "weekly_recap",
            "card": {
                "header": header,
                "sections": [
                    {"header": "🏅 CLASSEMENT", "widgets": ranking_widgets},
                    {
                        "header": "📊 EN CHIFFRES",
                        "widgets": [{"textParagraph": {"text": (
                            f"Parties jouées : *{summary.total_games}*\n"
                            f"Temps total : *{fmt_duration(summary.total_seconds)}*\n"
                            f"Durée moyenne : *{fmt_duration(summary.avg_seconds)}*\n"
                            f"Modes : {summary.mode_breakdown}"
                        )}}],
                    },
                    {
                        "header": "⭐ HIGHLIGHTS",
                        "widgets": [
                            {"textParagraph": {"text": "\n".join(highlight_lines)}},
                            {"divider": {}},
                            {"buttonList": {"buttons": [{
                                "text": "VOIR TOUTES LES STATS 📊",
                                "onClick": {"openLink": {"url": data["dashboard_url"]}},
                            }]}},
                        ],
                    },
                ],
            },
        }],
    }
