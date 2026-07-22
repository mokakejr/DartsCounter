"""Port of the old scripts/trophy-announce.js + scripts/weekly-recap.js webhook
calls — same Google Chat card formats, now built server-side from real DB data
instead of a checked-out games.json.
"""

import httpx

from app.services.recap import format_elo_delta, fmt_duration, mode_label, rank_emoji, summarize_week
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
        elif event.type == "provocation":
            body = _provocation_body(event.data)
        elif event.type == "live_started":
            body = _live_started_body(event.data)
        else:
            return
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.post(self.url, json=body)
            resp.raise_for_status()


def _live_title(players: list[str]) -> str:
    """2 joueurs = duel (🆚), 3+ = mêlée nominative."""
    if len(players) == 2:
        return f"🔴 LIVE : {players[0]} 🆚 {players[1]}"
    return f"🔴 LIVE : Mêlée à {len(players)} — {', '.join(players)}"


def _live_started_body(data: dict) -> dict:
    remote = " (à distance)" if data.get("remote") else ""
    return {
        "cardsV2": [{
            "cardId": "live_started",
            "card": {
                "header": {
                    "title": _live_title(data["players"]),
                    "subtitle": f"La partie de {mode_label(data['mode'])}{remote} va commencer !",
                    "imageUrl": TROPHY_IMG,
                    "imageType": "CIRCLE",
                },
                "sections": [{
                    "widgets": [{
                        "buttonList": {"buttons": [{
                            "text": "👁️ REJOINDRE LES GRADINS",
                            "onClick": {"openLink": {"url": data["watch_url"]}},
                        }]},
                    }],
                }],
            },
        }],
    }


def _game_finished_body(data: dict) -> dict:
    label = mode_label(data["mode"])
    winner = data.get("winner")
    duration = fmt_duration(data.get("duration", 0))

    title = (
        f"🏆 {winner} remporte {label} !"
        if winner
        else f"🤝 Égalité en {label} !"
    )
    subtitle = f"⏱ {duration}"
    if data.get("status") == "PENDING_REVIEW":
        subtitle += " · ⚖️ En attente d'homologation"

    # Scores section — one row per player, ranked by position order
    players = data.get("players", [])
    scores = data.get("scores", [])
    elo: dict[str, dict] = data.get("elo") or {}
    score_lines = "\n".join(
        f"{rank_emoji(i)} <b>{p}</b> — {s} pts"
        + (f" · {format_elo_delta(elo[p]['after'], elo[p]['delta'])}" if p in elo else "")
        for i, (p, s) in enumerate(zip(players, scores))
    )
    sections: list[dict] = [
        {
            "header": "🎯 SCORES",
            "widgets": [{"textParagraph": {"text": score_lines}}],
        }
    ]

    # Trophies section — only when new trophies were unlocked in this game
    trophies: dict[str, list[dict]] = data.get("trophies") or {}
    trophy_players = [p for p in players if p in trophies]

    if trophy_players:
        trophy_widgets: list[dict] = []
        for player in trophy_players:
            lines = "<br>".join(
                f"{t['ico']} <b>{t['name']}</b> — {t['desc']}"
                for t in trophies[player]
            )
            trophy_widgets.append({"textParagraph": {"text": f"🎉 <b>{player}</b><br>{lines}"}})

        trophy_widgets.append({"divider": {}})

        dashboard_url = data.get("dashboard_url", "")
        if dashboard_url:
            trophy_widgets.append({
                "buttonList": {"buttons": [{
                    "text": "VOIR LES TROPHÉES 🏆",
                    "onClick": {"openLink": {"url": f"{dashboard_url}/#/trophees"}},
                }]},
            })

        sections.append({
            "header": "🏅 NOUVEAUX TROPHÉES",
            "widgets": trophy_widgets,
        })

    return {
        "cardsV2": [{
            "cardId": "game_finished",
            "card": {
                "header": {
                    "title": title,
                    "subtitle": subtitle,
                    "imageUrl": TROPHY_IMG,
                    "imageType": "CIRCLE",
                },
                "sections": sections,
            },
        }],
    }


def _player_ping_body(data: dict) -> dict:
    return {"text": f"🎯 *{data['by']}* propose une partie de fléchettes ! Qui est chaud ?"}


def _provocation_body(data: dict) -> dict:
    target = f" *{data['target']}*" if data.get("target") else ""
    return {"text": f"⚔️ *{data['by']}* provoque{target} : « {data['story']} »"}


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
