import uuid
from datetime import date

from pydantic import BaseModel, ConfigDict


class SeasonRead(BaseModel):
    """Saison publique — expose l'id, ce que /seasons/current ne faisait pas.
    Sans lui, un client ne pouvait passer aucun ?season=<id> aux stats."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    start_date: date | None
    end_date: date | None
    is_active: bool
