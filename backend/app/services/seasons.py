"""Saisons compétitives avec soft reset (Hub v2).

Un classement perpétuel tue le jeu : le 1er devient intouchable, le dernier
abandonne. Toutes les SEASON_DAYS, on fige le classement, on couronne le
champion (titre + événement de feed dans chaque ligue) et on compresse les
ratings vers le point de départ (soft reset) pour relancer la course.

Compatibilité recompute_all : l'ELO du repo est « re-dérivable depuis
l'historique » — un soft reset qui écrase PlayerRating serait annulé au
premier replay (le tribunal en fait un par verdict !). D'où la table
season_ratings : le snapshot compressé du début de saison sert de ratings
initiaux, et le replay ne rejoue que les parties de la saison courante.
"""

import logging
import uuid
from datetime import date, timedelta

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import LeagueEvent, PlayerRating, PlayerTitle, Season
from app.models.elo import GLOBAL_SCOPE
from app.models.season import SeasonRating

logger = logging.getLogger(__name__)

SEASON_DAYS = 60
# Soft reset : new = starting + (rating - starting) * SQUEEZE
SQUEEZE = 0.5


async def get_active_season(session: AsyncSession) -> Season | None:
    stmt = select(Season).where(Season.is_active.is_(True)).order_by(Season.start_date.desc()).limit(1)
    return (await session.execute(stmt)).scalar_one_or_none()


async def _season_number(session: AsyncSession) -> int:
    return len((await session.execute(select(Season.id))).all()) + 1


async def _start_new_season(session: AsyncSession) -> Season:
    number = await _season_number(session)
    season = Season(
        name=f"Saison {number}",
        start_date=date.today(),
        end_date=date.today() + timedelta(days=SEASON_DAYS),
        is_active=True,
    )
    session.add(season)
    await session.flush()
    return season


async def _snapshot_squeezed_ratings(session: AsyncSession, season: Season, starting: float) -> None:
    """Compresse chaque rating vers le point de départ et fige le résultat
    comme base de la nouvelle saison (PlayerRating est aligné dessus)."""
    await session.execute(delete(SeasonRating).where(SeasonRating.season_id == season.id))
    ratings = (await session.execute(select(PlayerRating))).scalars().all()
    for r in ratings:
        squeezed = round(starting + (r.rating - starting) * SQUEEZE)
        r.rating = squeezed
        session.add(
            SeasonRating(
                season_id=season.id,
                player_id=r.player_id,
                scope=r.scope,
                rating=squeezed,
                games_played=r.games_played,
            )
        )


async def load_season_baseline(
    session: AsyncSession, season: Season
) -> tuple[dict[uuid.UUID, dict[str, float]], dict[uuid.UUID, dict[str, int]]]:
    """Ratings/games_played initiaux (par player_id puis scope) pour le
    replay de la saison courante."""
    rows = (
        await session.execute(select(SeasonRating).where(SeasonRating.season_id == season.id))
    ).scalars().all()
    ratings: dict[uuid.UUID, dict[str, float]] = {}
    games: dict[uuid.UUID, dict[str, int]] = {}
    for r in rows:
        ratings.setdefault(r.player_id, {})[r.scope] = r.rating
        games.setdefault(r.player_id, {})[r.scope] = r.games_played
    return ratings, games


async def _crown_champion(session: AsyncSession, season: Season) -> None:
    """Champion de saison = #1 ELO global. Titre sur le profil + événement
    de feed dans chaque ligue dont il est membre actif."""
    from app.models import League, LeagueMember, Player

    top = (
        await session.execute(
            select(PlayerRating)
            .where(PlayerRating.scope == GLOBAL_SCOPE, PlayerRating.games_played > 0)
            .order_by(PlayerRating.rating.desc())
            .limit(1)
        )
    ).scalar_one_or_none()
    if top is None:
        return
    champion = await session.get(Player, top.player_id)
    if champion is None:
        return

    existing = await session.get(PlayerTitle, (champion.id, "season_champion"))
    if existing is None:
        session.add(PlayerTitle(player_id=champion.id, title_id="season_champion"))

    leagues = (
        await session.execute(
            select(League)
            .join(LeagueMember, LeagueMember.league_id == League.id)
            .where(LeagueMember.player_id == champion.id, LeagueMember.is_active.is_(True))
        )
    ).scalars().all()
    label = champion.display_name or champion.name
    for league in leagues:
        session.add(
            LeagueEvent(
                league_id=league.id,
                event_type="SEASON_END",
                actor_id=champion.id,
                story_text=f"{season.name} est terminée — {label} est sacré Champion de Saison !",
            )
        )


async def rollover_if_needed(session: AsyncSession) -> Season | None:
    """Job quotidien : crée la première saison si aucune, clôture + soft
    reset + nouvelle saison quand la date de fin est dépassée. Retourne la
    nouvelle saison le cas échéant."""
    from app.services.elo_config import get_engine_config

    active = await get_active_season(session)
    config = await get_engine_config(session)

    if active is None:
        season = await _start_new_season(session)
        # Baseline de la toute première saison = ratings actuels, tels quels.
        await session.execute(delete(SeasonRating).where(SeasonRating.season_id == season.id))
        for r in (await session.execute(select(PlayerRating))).scalars().all():
            session.add(
                SeasonRating(
                    season_id=season.id,
                    player_id=r.player_id,
                    scope=r.scope,
                    rating=r.rating,
                    games_played=r.games_played,
                )
            )
        await session.commit()
        logger.info("Season started: %s", season.name)
        return season

    if active.end_date is None or date.today() <= active.end_date:
        return None

    # Clôture : couronne, gèle, compresse, relance.
    await _crown_champion(session, active)
    active.is_active = False
    season = await _start_new_season(session)
    await _snapshot_squeezed_ratings(session, season, config.starting_rating)
    await session.commit()
    logger.info("Season rolled over: %s -> %s (soft reset)", active.name, season.name)
    return season
