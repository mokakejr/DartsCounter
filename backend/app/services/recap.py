"""Weekly recap aggregation — shared by every notification target.

Each game dict is expected to look like: {mode, variant, players: [name...],
winner, duration}. Port of the stats math in the old scripts/weekly-recap.js;
each target still builds its own message from this.
"""

from dataclasses import dataclass, field
from datetime import datetime

MODE_LABELS = {
    "Cricket": "Cricket",
    "SuperCricket": "Super Cricket",
    "Shanghai": "Shanghai",
    "ShanghaiBull": "Shanghai Bull",
    "ShanghaiRandom": "Shanghai Random",
    "ShanghaiCrazy": "Shanghai Crazy",
    "FiftyOne": "51",
    "Bob27": "Bob's 27",
    "RoundTheClock": "Round the Clock",
}
RANK_EMOJI = ["🥇", "🥈", "🥉", "🏅"]
FR_WEEKDAYS = ["lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche"]
FR_MONTHS = [
    "janvier", "février", "mars", "avril", "mai", "juin",
    "juillet", "août", "septembre", "octobre", "novembre", "décembre",
]


def mode_label(mode: str) -> str:
    return MODE_LABELS.get(mode, mode)


def fr_date_label(d: datetime) -> str:
    # Avoids depending on the fr_FR system locale being installed in the
    # container — strftime("%A %d %B") would otherwise render in English.
    return f"{FR_WEEKDAYS[d.weekday()]} {d.day} {FR_MONTHS[d.month - 1]}"


def rank_emoji(i: int) -> str:
    return RANK_EMOJI[i] if i < len(RANK_EMOJI) else "🏅"


def fmt_duration(seconds: int) -> str:
    h, rem = divmod(seconds, 3600)
    m = rem // 60
    return f"{h}h{m:02d}" if h else f"{m}m"


@dataclass
class PlayerWeekStats:
    name: str
    wins: int = 0
    played: int = 0
    duration: int = 0

    @property
    def win_rate(self) -> int:
        return round(self.wins / self.played * 100) if self.played else 0


@dataclass
class WeeklySummary:
    games: list[dict] = field(default_factory=list)
    ranking: list[PlayerWeekStats] = field(default_factory=list)
    total_games: int = 0
    total_seconds: int = 0
    avg_seconds: int = 0
    mode_counts: dict[str, int] = field(default_factory=dict)
    longest: dict | None = None
    shortest: dict | None = None
    shanghai_kills: list[dict] = field(default_factory=list)

    @property
    def is_empty(self) -> bool:
        return self.total_games == 0

    @property
    def mode_breakdown(self) -> str:
        return "  ·  ".join(
            f"{mode_label(m)}: {c}"
            for m, c in sorted(self.mode_counts.items(), key=lambda kv: -kv[1])
        )


def summarize_week(games: list[dict]) -> WeeklySummary:
    if not games:
        return WeeklySummary()

    players: dict[str, PlayerWeekStats] = {}
    for g in games:
        for name in g["players"]:
            s = players.setdefault(name, PlayerWeekStats(name=name))
            s.played += 1
            s.duration += g.get("duration", 0)
            if g.get("winner") == name:
                s.wins += 1
    ranking = sorted(players.values(), key=lambda s: (-s.wins, -s.played))

    total_games = len(games)
    total_seconds = sum(g.get("duration", 0) for g in games)

    mode_counts: dict[str, int] = {}
    for g in games:
        mode_counts[g["mode"]] = mode_counts.get(g["mode"], 0) + 1

    return WeeklySummary(
        games=games,
        ranking=ranking,
        total_games=total_games,
        total_seconds=total_seconds,
        avg_seconds=round(total_seconds / total_games),
        mode_counts=mode_counts,
        longest=max(games, key=lambda g: g.get("duration", 0)),
        shortest=min(games, key=lambda g: g.get("duration", 0)),
        shanghai_kills=[g for g in games if g.get("variant") == "Shanghai Kill"],
    )
