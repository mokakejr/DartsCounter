"""Saisons compétitives mensuelles avec soft reset (Hub v2).

Un classement perpétuel tue le jeu : le 1er devient intouchable, le dernier
abandonne. Chaque 1er du mois, on fige le classement de chaque ligue, on
l'archive dans le palmarès, on couronne le champion de la ligue (titre +
événement de feed) et on compresse les ratings vers le point de départ (soft
reset) pour relancer la course.

Compatibilité recompute_all : l'ELO du repo est « re-dérivable depuis
l'historique » — un soft reset qui écrase PlayerRating serait annulé au
premier replay (l'admin peut en déclencher un à tout moment). D'où la table
season_ratings : le snapshot compressé du début de saison sert de ratings
initiaux, et le replay ne rejoue que les parties de la saison courante.
"""

import calendar
import logging
import uuid
from datetime import date

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import LeagueEvent, PlayerRating, PlayerTitle, Season
from app.models.season import SeasonRating, SeasonStanding

logger = logging.getLogger(__name__)

# Soft reset : new = starting + (rating - starting) * SQUEEZE
SQUEEZE = 0.5

MONTHS_FR = (
    "Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
    "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre",
)

# Type de l'événement de feed écrit à la clôture d'une saison.
EVENT_SEASON_END = "SEASON_END"
CHAMPION_TITLE = "league_champion"


def month_bounds(day: date) -> tuple[date, date]:
    """Premier et dernier jour du mois contenant `day`."""
    last = calendar.monthrange(day.year, day.month)[1]
    return day.replace(day=1), day.replace(day=last)


def month_name(day: date) -> str:
    return f"{MONTHS_FR[day.month - 1]} {day.year}"


async def get_active_season(session: AsyncSession) -> Season | None:
    stmt = select(Season).where(Season.is_active.is_(True)).order_by(Season.start_date.desc()).limit(1)
    return (await session.execute(stmt)).scalar_one_or_none()


async def _start_new_season(session: AsyncSession, start: date | None = None) -> Season:
    """Ouvre la saison du mois contenant `start` (aujourd'hui par défaut).

    `start_date` est la date réelle d'ouverture, pas forcément le 1er : c'est
    la borne basse que recompute_all utilise pour rejouer la saison, et une
    date antérieure à l'ouverture ferait rejouer des parties déjà encaissées
    dans la baseline."""
    start = start or date.today()
    _, last = month_bounds(start)
    season = Season(
        name=month_name(start),
        start_date=start,
        end_date=last,
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


async def snapshot_current_ratings(session: AsyncSession, season: Season) -> None:
    """Baseline « telle quelle » — pour une saison ouverte sans clôture
    précédente (toute première saison, ou création manuelle en admin)."""
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


async def archive_standings(session: AsyncSession, season: Season) -> dict[uuid.UUID, list[SeasonStanding]]:
    """Fige le classement de chaque ligue dans season_standings.

    À appeler **avant** le soft reset, sinon on archiverait des ratings déjà
    compressés. Retourne les lignes écrites, par league_id, ordonnées — le
    couronnement s'en sert directement.

    Le classement vient de get_leaderboard, déjà trié (membres actifs d'abord,
    puis Elo décroissant) et déjà filtré sur la saison courante pour les
    colonnes parties/victoires. Les membres fantômes (partis en cours de
    saison) et ceux qui n'ont pas joué du mois n'entrent pas au palmarès."""
    from app.models import League
    from app.services.stats import get_leaderboard

    await session.execute(delete(SeasonStanding).where(SeasonStanding.season_id == season.id))

    leagues = (await session.execute(select(League))).scalars().all()
    by_league: dict[uuid.UUID, list[SeasonStanding]] = {}
    for league in leagues:
        board = await get_leaderboard(session, league_id=league.id, until=season.end_date)
        played = [row for row in board if row.is_active and row.games > 0]
        rows = [
            SeasonStanding(
                season_id=season.id,
                league_id=league.id,
                player_id=row.id,
                position=position,
                rating=round(row.elo),
                games=row.games,
                wins=row.wins,
                rank_label=row.rank,
            )
            for position, row in enumerate(played, start=1)
        ]
        for row in rows:
            session.add(row)
        if rows:
            by_league[league.id] = rows
    return by_league


async def _crown_league_champions(
    session: AsyncSession, season: Season, standings: dict[uuid.UUID, list[SeasonStanding]]
) -> None:
    """Champion = #1 du classement de la ligue, à condition d'avoir atteint le
    seuil de parties classées (sinon un joueur à une partie raflerait le
    titre). Titre sur le profil + événement de feed dans la ligue."""
    from app.models import League, Player
    from app.services.elo_config import get_settings_row

    # min_ranked_games vit sur la ligne de settings, pas sur l'EloConfig du
    # moteur pur (qui ne connaît que le calcul du rating).
    min_ranked_games = (await get_settings_row(session)).min_ranked_games

    for league_id, rows in standings.items():
        champion_row = next((r for r in rows if r.games >= min_ranked_games), None)
        if champion_row is None:
            logger.info("Season %s: no champion for league %s (min games not met)", season.name, league_id)
            continue

        league = await session.get(League, league_id)
        champion = await session.get(Player, champion_row.player_id)
        if league is None or champion is None:
            continue

        champion_row.is_champion = True
        if await session.get(PlayerTitle, (champion.id, CHAMPION_TITLE)) is None:
            session.add(PlayerTitle(player_id=champion.id, title_id=CHAMPION_TITLE))

        label = champion.display_name or champion.name
        podium_parts: list[str] = []
        for r in rows[:3]:
            player = await session.get(Player, r.player_id)
            if player is not None:
                podium_parts.append(f"{r.position}. {player.display_name or player.name}")
        podium = " · ".join(podium_parts)
        session.add(
            LeagueEvent(
                league_id=league.id,
                event_type=EVENT_SEASON_END,
                actor_id=champion.id,
                story_text=(
                    f"{season.name} est terminée — {label} est sacré Champion de "
                    f"{league.name} ! ({podium})"
                ),
            )
        )


async def close_season(session: AsyncSession, season: Season, starting: float) -> Season:
    """Clôture `season` et ouvre celle du mois courant. L'ordre compte :
    archive puis couronnement (sur les ratings de fin de saison), et seulement
    ensuite le soft reset. Ne commit pas — l'appelant s'en charge."""
    standings = await archive_standings(session, season)
    await _crown_league_champions(session, season, standings)
    season.is_active = False
    new_season = await _start_new_season(session)
    await _snapshot_squeezed_ratings(session, new_season, starting)
    return new_season


async def get_palmares(
    session: AsyncSession, league_id: uuid.UUID, limit: int = 24
) -> list[tuple[Season, list[SeasonStanding]]]:
    """Palmarès d'une ligue : saisons clôturées de la plus récente à la plus
    ancienne, chacune avec son classement archivé (`.player` chargé). `limit`
    borne le nombre de saisons (deux ans par défaut), pas le nombre de lignes
    par saison."""
    from sqlalchemy.orm import selectinload

    seasons = (
        await session.execute(
            select(Season)
            .join(SeasonStanding, SeasonStanding.season_id == Season.id)
            .where(SeasonStanding.league_id == league_id, Season.is_active.is_(False))
            .distinct()
            .order_by(Season.start_date.desc())
            .limit(limit)
        )
    ).scalars().all()
    if not seasons:
        return []

    rows = (
        await session.execute(
            select(SeasonStanding)
            .where(
                SeasonStanding.league_id == league_id,
                SeasonStanding.season_id.in_([s.id for s in seasons]),
            )
            .options(selectinload(SeasonStanding.player))
            .order_by(SeasonStanding.position)
        )
    ).scalars().all()

    by_season: dict[uuid.UUID, list[SeasonStanding]] = {}
    for row in rows:
        by_season.setdefault(row.season_id, []).append(row)
    return [(s, by_season.get(s.id, [])) for s in seasons]


async def rollover_if_needed(session: AsyncSession) -> Season | None:
    """Job quotidien : crée la première saison si aucune, clôture + soft
    reset + nouvelle saison dès qu'on a passé la fin du mois. Retourne la
    nouvelle saison le cas échéant."""
    from app.services.elo_config import get_engine_config

    active = await get_active_season(session)
    config = await get_engine_config(session)

    if active is None:
        season = await _start_new_season(session)
        # Baseline de la toute première saison = ratings actuels, tels quels.
        await snapshot_current_ratings(session, season)
        await session.commit()
        logger.info("Season started: %s", season.name)
        return season

    if active.end_date is None or date.today() <= active.end_date:
        return None

    season = await close_season(session, active, config.starting_rating)
    await session.commit()
    logger.info("Season rolled over: %s -> %s (soft reset)", active.name, season.name)
    return season
