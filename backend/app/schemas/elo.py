import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, model_validator


class EloSettingsRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    starting_rating: float
    convergence: float
    k_factors: list[float]
    k_thresholds: list[int]
    perf_multiplier_min: float
    perf_multiplier_max: float
    bronze_ceiling: float
    rank_tier_value: float
    champion_multiplier: float
    updated_at: datetime


class EloSettingsUpdate(BaseModel):
    starting_rating: float | None = Field(default=None, gt=0)
    convergence: float | None = Field(default=None, gt=0)
    k_factors: list[float] | None = Field(default=None, min_length=1)
    k_thresholds: list[int] | None = None
    perf_multiplier_min: float | None = Field(default=None, gt=0)
    perf_multiplier_max: float | None = Field(default=None, gt=0)
    bronze_ceiling: float | None = None
    rank_tier_value: float | None = Field(default=None, gt=0)
    champion_multiplier: float | None = Field(default=None, gt=0)

    @model_validator(mode="after")
    def _check_consistency(self) -> "EloSettingsUpdate":
        if self.k_factors is not None and self.k_thresholds is not None:
            if len(self.k_thresholds) != len(self.k_factors) - 1:
                raise ValueError("k_thresholds must have exactly one fewer entry than k_factors")
        if (
            self.perf_multiplier_min is not None
            and self.perf_multiplier_max is not None
            and self.perf_multiplier_min > self.perf_multiplier_max
        ):
            raise ValueError("perf_multiplier_min must be <= perf_multiplier_max")
        return self


class ScoreDirectionRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    mode: str
    variant: str | None
    lower_is_better: bool


class ScoreDirectionCreate(BaseModel):
    mode: str = Field(min_length=1)
    variant: str | None = None
    lower_is_better: bool = True


class ScoreDirectionUpdate(BaseModel):
    lower_is_better: bool


class PlayerRatingRead(BaseModel):
    scope: str
    rating: int
    games_played: int
    rank: str


class EloHistoryRead(BaseModel):
    game_id: uuid.UUID
    game_date: datetime
    game_mode: str
    scope: str
    elo_before: int
    elo_after: int
    delta: int
    perf_multiplier: float
    computed_at: datetime
