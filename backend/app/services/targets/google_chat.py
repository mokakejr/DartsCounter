"""Port of the old scripts/trophy-announce.js + scripts/weekly-recap.js webhook
calls — same Google Chat card formats, now built server-side from real DB data
instead of a checked-out games.json.
"""

from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

import httpx

from app.services.recap import format_elo_delta, fmt_duration, mode_label, rank_emoji, summarize_week
from app.services.targets.base import GameEvent

TROPHY_IMG = "https://fonts.gstatic.com/s/i/short-term/release/googlesymbols/emoji_events/default/48px.svg"
LIVE_IMG = "https://fonts.gstatic.com/s/i/short-term/release/googlesymbols/sports_esports/default/48px.svg"

# Poster avec une threadKey inconnue crée le fil ; la réutiliser y répond.
# C'est ce qui permet de ne jamais avoir à stocker le thread.name renvoyé par
# Google — et le FALLBACK garantit qu'une clé perdue/expirée poste quand même.
REPLY_OPTION = "REPLY_MESSAGE_FALLBACK_TO_NEW_THREAD"


def _threaded_url(url: str) -> str:
    """Ajoute messageReplyOption à l'URL du webhook. Fusion propre des query
    params : les URLs Chat portent déjà ?key=...&token=..., une concaténation
    naïve casserait le webhook."""
    parts = urlsplit(url)
    params = dict(parse_qsl(parts.query, keep_blank_values=True))
    params["messageReplyOption"] = REPLY_OPTION
    return urlunsplit(parts._replace(query=urlencode(params)))


class GoogleChatTarget:
    def __init__(self, url: str) -> None:
        self.url = url

    async def send(self, event: GameEvent) -> None:
        if event.type == "game_started":
            body = _game_started_body(event.data)
        elif event.type == "game_finished":
            body = _game_finished_body(event.data)
        elif event.type == "game_abandoned":
            body = _game_abandoned_body(event.data)
        elif event.type == "weekly_recap":
            body = _weekly_recap_body(event.data)
        elif event.type == "player_ping":
            body = _player_ping_body(event.data)
        elif event.type == "provocation":
            body = _provocation_body(event.data)
        else:
            return

        # Le fil est optionnel : sans clé (partie remontée par la file
        # offline, backend redémarré...) on poste comme avant, à la racine.
        thread_key = event.data.get("thread_key")
        url = self.url
        if thread_key:
            body = {**body, "thread": {"threadKey": thread_key}}
            url = _threaded_url(url)

        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.post(url, json=body)
            resp.raise_for_status()


def _versus(names: list[str]) -> str:
    if len(names) == 2:
        return f"{names[0]} vs {names[1]}"
    if len(names) > 2:
        return ", ".join(names[:-1]) + f" & {names[-1]}"
    return names[0] if names else ""


def _rivalry_lines(rivalry: dict) -> str:
    a, b = rivalry["a"], rivalry["b"]
    a_wins, b_wins = rivalry["a_wins"], rivalry["b_wins"]
    if a_wins == 0 and b_wins == 0:
        head = "Première confrontation 👀"
    elif a_wins == b_wins:
        head = f"{a_wins}-{b_wins} — personne ne lâche rien"
    elif a_wins > b_wins:
        head = f"<b>{a}</b> mène {a_wins}-{b_wins}"
    else:
        head = f"<b>{b}</b> mène {b_wins}-{a_wins}"

    prob = rivalry.get("a_win_probability")
    if prob is None:
        return head
    favourite, chance = (a, prob) if prob >= 0.5 else (b, 1 - prob)
    return f"{head}<br>Sur le papier : <b>{favourite}</b> ({round(chance * 100)} %)"


def _game_started_body(data: dict) -> dict:
    """Carte racine du fil : elle doit donner envie d'aller regarder, donc
    l'affiche (Elo + rang), la rivalité, et un gros bouton vers les gradins."""
    players: list[dict] = data.get("players", [])
    names = [p["name"] for p in players]
    subtitle = " · ".join(
        part for part in (_versus(names), mode_label(data["mode"]), data.get("variant")) if part
    )

    line_up = "<br>".join(
        f"🎯 <b>{p['name']}</b> — "
        + (f"{p['rating']} · {p['rank']}" if p.get("rating") is not None else "nouveau venu")
        for p in players
    )
    sections: list[dict] = [
        {"header": "🎯 SUR LA LIGNE", "widgets": [{"textParagraph": {"text": line_up}}]}
    ]

    rivalry = data.get("rivalry")
    if rivalry:
        sections.append({
            "header": "⚔️ RIVALITÉ",
            "widgets": [{"textParagraph": {"text": _rivalry_lines(rivalry)}}],
        })

    watch_url = data.get("watch_url")
    if watch_url:
        sections.append({"widgets": [
            {"divider": {}},
            {"buttonList": {"buttons": [{
                "text": "SUIVRE EN LIVE 👀",
                "onClick": {"openLink": {"url": watch_url}},
            }]}},
        ]})

    return {
        "cardsV2": [{
            "cardId": "game_started",
            "card": {
                "header": {
                    "title": "🔴 ÇA COMMENCE",
                    "subtitle": subtitle,
                    "imageUrl": LIVE_IMG,
                    "imageType": "CIRCLE",
                },
                "sections": sections,
            },
        }],
    }


def _game_abandoned_body(data: dict) -> dict:
    """Réponse de clôture : sans elle, un « ça commence » resterait orphelin
    dans le fil pour toujours."""
    return {
        "text": f"⚪ *{_versus(data.get('players', []))}* — partie interrompue, aucun résultat enregistré."
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
    # Le mode figure dans le sous-titre : dans un fil, la réponse doit rester
    # lisible sans avoir à remonter à la carte de début.
    subtitle = " · ".join(part for part in (label, data.get("variant"), f"⏱ {duration}") if part)
    if data.get("status") == "PENDING_REVIEW":
        subtitle += " · ⚖️ En attente d'homologation"

    # Scores section — one row per player, ranked by position order
    players = data.get("players", [])
    scores = data.get("scores", [])
    elo: dict[str, dict] = data.get("elo") or {}
    rank_changes: dict[str, dict] = data.get("rank_changes") or {}

    def rank_move(name: str) -> str:
        change = rank_changes.get(name)
        if not change:
            return ""
        return f" · {'⬆️' if change['up'] else '⬇️'} <b>{change['rank']}</b>"

    score_lines = "\n".join(
        f"{rank_emoji(i)} <b>{p}</b> — {s} pts"
        + (f" · {format_elo_delta(elo[p]['after'], elo[p]['delta'])}" if p in elo else "")
        + rank_move(p)
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
    elif data.get("dashboard_url"):
        # Sans trophée la carte n'avait aucun lien sortant — le classement est
        # ce qu'on a envie d'aller vérifier juste après une partie.
        sections.append({"widgets": [
            {"divider": {}},
            {"buttonList": {"buttons": [{
                "text": "VOIR LE CLASSEMENT 📊",
                "onClick": {"openLink": {"url": data["dashboard_url"]}},
            }]}},
        ]})

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
