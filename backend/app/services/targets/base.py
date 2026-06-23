from dataclasses import dataclass
from typing import Any, Literal, Protocol

EventType = Literal["game_finished", "weekly_recap", "player_ping"]


@dataclass
class GameEvent:
    type: EventType
    data: dict[str, Any]


class NotificationTarget(Protocol):
    async def send(self, event: GameEvent) -> None: ...
