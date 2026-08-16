"""Saisons mensuelles : clôture le 1er du mois, palmarès figé par ligue,
Champion de Ligue et soft reset."""

import uuid
from datetime import date, timedelta

from sqlalchemy import select

from app.core.db import async_session
from app.models import Player, PlayerTitle, Season
from app.models.league import LeagueMember
from app.models.season import SeasonRating, SeasonStanding
from app.services.seasons import (
    CHAMPION_TITLE,
    EVENT_SEASON_END,
    get_active_season,
    month_bounds,
    month_name,
    rollover_if_needed,
)

RANKED_GAMES = 5  # EloSettings.min_ranked_games par défaut


async def _signup(client, name):
    resp = await client.post("/auth/signup", json={"name": name, "password": "hunter22"})
    assert resp.status_code == 201
    return {"Authorization": f"Bearer {resp.json()['access_token']}"}


async def _play(client, winner, loser, count=RANKED_GAMES, day_offset=1):
    """`count` parties classées gagnées par `winner`, datées d'hier par défaut :
    une clôture ne fige que les parties jusqu'à `end_date` incluse, et elle ne
    peut tomber qu'un jour *après* cette date."""
    day = date.today() - timedelta(days=day_offset)
    for i in range(count):
        resp = await client.post(
            "/games",
            json={
                "date": f"{day.isoformat()}T{10 + i:02d}:00:00Z",
                "mode": "Cricket",
                "players": [winner, loser],
                "scores": [40, 10],
                "winner": winner,
            },
        )
        assert resp.status_code == 201, resp.text


async def _open_season(session, spans_days=5):
    """Ouvre la saison courante et la fait démarrer `spans_days` jours plus tôt,
    pour qu'elle englobe les parties écrites par `_play`."""
    season = await rollover_if_needed(session) or await get_active_season(session)
    assert season is not None
    season.start_date = date.today() - timedelta(days=spans_days)
    await session.commit()
    return season


async def _end_season_now(session, season):
    """Antidate la fin de saison pour que le prochain rollover clôture. Hier :
    c'est la configuration réelle du job, qui tourne le lendemain de la fin de
    saison."""
    season.end_date = date.today() - timedelta(days=1)
    await session.commit()


# ─── Bornes de mois ───────────────────────────────────────────────────────────

def test_month_bounds_and_name():
    first, last = month_bounds(date(2026, 8, 14))
    assert first == date(2026, 8, 1)
    assert last == date(2026, 8, 31)
    assert month_name(date(2026, 8, 14)) == "Août 2026"

    # Mois courts et années bissextiles.
    assert month_bounds(date(2026, 2, 3))[1] == date(2026, 2, 28)
    assert month_bounds(date(2024, 2, 3))[1] == date(2024, 2, 29)
    assert month_bounds(date(2026, 12, 31))[1] == date(2026, 12, 31)


async def test_first_season_ends_on_month_boundary(client):
    async with async_session() as session:
        season = await rollover_if_needed(session)
        assert season is not None
        assert season.end_date == month_bounds(date.today())[1]
        assert season.name == month_name(date.today())


async def test_no_rollover_before_month_end(client):
    async with async_session() as session:
        season = await rollover_if_needed(session)
        assert season is not None
        # Deuxième passage le même jour : rien à clôturer.
        assert await rollover_if_needed(session) is None
        assert (await get_active_season(session)).id == season.id


# ─── Clôture ──────────────────────────────────────────────────────────────────

async def test_rollover_crowns_league_champion_and_soft_resets(client):
    alice = await _signup(client, "Alice")
    await _signup(client, "Bob")
    await _play(client, "Alice", "Bob")

    async with async_session() as session:
        season = await _open_season(session)
        board = (await client.get("/stats/leaderboard")).json()
        alice_elo = next(r for r in board if r["name"] == "Alice")["elo"]

        await _end_season_now(session, season)
        new_season = await rollover_if_needed(session)
        assert new_season is not None and new_season.id != season.id
        assert new_season.end_date == month_bounds(date.today())[1]
        assert (await get_active_season(session)).id == new_season.id

        # L'ancienne saison est clôturée, pas supprimée.
        closed = await session.get(Season, season.id)
        assert closed.is_active is False

        # Palmarès figé : Alice 1re et sacrée championne.
        rows = (
            await session.execute(
                select(SeasonStanding)
                .where(SeasonStanding.season_id == season.id)
                .order_by(SeasonStanding.position)
            )
        ).scalars().all()
        assert rows, "le classement de la saison clôturée doit être archivé"
        top = rows[0]
        assert top.position == 1
        assert top.is_champion is True
        assert top.games == RANKED_GAMES
        assert top.wins == RANKED_GAMES
        assert top.rating == round(alice_elo)  # avant compression
        assert top.rank_label

        # Baseline de la nouvelle saison écrite (sinon recompute_all annulerait
        # le soft reset).
        baseline = (
            await session.execute(
                select(SeasonRating).where(SeasonRating.season_id == new_season.id)
            )
        ).scalars().all()
        assert baseline

    # Titre décerné.
    titles = (await client.get("/players/me/titles", headers=alice)).json()
    assert CHAMPION_TITLE in {t["id"] for t in titles}

    # Soft reset : compressé vers 10000 sans y être collé.
    board = (await client.get("/stats/leaderboard")).json()
    alice_after = next(r for r in board if r["name"] == "Alice")["elo"]
    start = (await client.get("/elo/settings")).json()["starting_rating"]
    assert abs(alice_after - start) < abs(alice_elo - start)
    assert alice_after != start


async def test_rollover_writes_season_end_event_per_league(client):
    alice = await _signup(client, "Alice")
    await _signup(client, "Bob")
    await _play(client, "Alice", "Bob")

    leagues = (await client.get("/leagues/mine", headers=alice)).json()
    league_id = leagues[0]["id"]

    async with async_session() as session:
        season = await _open_season(session)
        await _end_season_now(session, season)
        await rollover_if_needed(session)

    feed = (await client.get(f"/leagues/{league_id}/events", headers=alice)).json()
    ends = [e for e in feed if e["event_type"] == EVENT_SEASON_END]
    assert len(ends) == 1
    assert "Champion de" in ends[0]["story_text"]
    assert ends[0]["actor"]["name"] == "Alice"


async def test_no_champion_below_min_ranked_games(client):
    alice = await _signup(client, "Alice")
    await _signup(client, "Bob")
    await _play(client, "Alice", "Bob", count=2)  # sous le seuil de 5

    async with async_session() as session:
        season = await _open_season(session)
        await _end_season_now(session, season)
        await rollover_if_needed(session)

        rows = (
            await session.execute(
                select(SeasonStanding).where(SeasonStanding.season_id == season.id)
            )
        ).scalars().all()
        assert rows, "le classement est archivé même sans champion"
        assert not any(r.is_champion for r in rows)

    titles = (await client.get("/players/me/titles", headers=alice)).json()
    assert CHAMPION_TITLE not in {t["id"] for t in titles}


async def test_ghost_members_excluded_from_palmares(client):
    alice = await _signup(client, "Alice")
    await _signup(client, "Bob")
    await _play(client, "Alice", "Bob")

    league_id = uuid.UUID((await client.get("/leagues/mine", headers=alice)).json()[0]["id"])

    async with async_session() as session:
        # Bob quitte la ligue : sa ligne de membership reste (l'historique doit
        # continuer à résoudre) mais devient inactive — il ne doit pas entrer
        # au palmarès.
        members = (
            await session.execute(
                select(LeagueMember)
                .join(Player, Player.id == LeagueMember.player_id)
                .where(LeagueMember.league_id == league_id, Player.name == "Bob")
            )
        ).scalars().all()
        assert members
        for m in members:
            m.is_active = False
        await session.commit()

        season = await _open_season(session)
        await _end_season_now(session, season)
        await rollover_if_needed(session)

        names = (
            await session.execute(
                select(Player.name)
                .join(SeasonStanding, SeasonStanding.player_id == Player.id)
                .where(
                    SeasonStanding.season_id == season.id,
                    SeasonStanding.league_id == league_id,
                )
            )
        ).scalars().all()
    assert "Alice" in names
    assert "Bob" not in names


# ─── Leaderboard mensuel ──────────────────────────────────────────────────────

async def test_leaderboard_only_counts_current_season_games(client):
    await _signup(client, "Alice")
    await _signup(client, "Bob")
    # Parties datées d'avant la clôture, donc hors de la nouvelle saison.
    await _play(client, "Alice", "Bob", day_offset=3)

    async with async_session() as session:
        season = await rollover_if_needed(session)
        season.start_date = date.today() - timedelta(days=5)
        await _end_season_now(session, season)
        await rollover_if_needed(session)

    board = (await client.get("/stats/leaderboard")).json()
    alice = next(r for r in board if r["name"] == "Alice")
    # Les parties du mois précédent ne comptent plus dans le nouveau classement.
    assert alice["games"] == 0
    assert alice["wins"] == 0

    # Une partie du jour, donc dans la nouvelle saison, recompte.
    await _play(client, "Alice", "Bob", count=1, day_offset=0)
    board = (await client.get("/stats/leaderboard")).json()
    assert next(r for r in board if r["name"] == "Alice")["games"] == 1


async def test_palmares_ignores_games_played_after_season_end(client):
    """Si le job de clôture prend du retard (conteneur redémarré), les parties
    déjà jouées dans le mois suivant ne doivent pas gonfler le palmarès du mois
    qu'on fige."""
    alice = await _signup(client, "Alice")
    await _signup(client, "Bob")
    await _play(client, "Alice", "Bob", day_offset=3)               # dans la saison
    await _play(client, "Alice", "Bob", count=2, day_offset=0)      # après end_date

    league_id = uuid.UUID((await client.get("/leagues/mine", headers=alice)).json()[0]["id"])

    async with async_session() as session:
        season = await rollover_if_needed(session)
        season.start_date = date.today() - timedelta(days=5)
        season.end_date = date.today() - timedelta(days=1)
        await session.commit()
        await rollover_if_needed(session)

        top = (
            await session.execute(
                select(SeasonStanding)
                .where(
                    SeasonStanding.season_id == season.id,
                    SeasonStanding.league_id == league_id,
                )
                .order_by(SeasonStanding.position)
            )
        ).scalars().first()
    assert top.games == RANKED_GAMES, "les 2 parties postérieures ne comptent pas"
    assert top.wins == RANKED_GAMES


# ─── Endpoint palmarès ────────────────────────────────────────────────────────

async def test_palmares_endpoint(client):
    alice = await _signup(client, "Alice")
    await _signup(client, "Bob")
    await _play(client, "Alice", "Bob")

    league_id = (await client.get("/leagues/mine", headers=alice)).json()[0]["id"]

    async with async_session() as session:
        season = await _open_season(session)
        await _end_season_now(session, season)
        await rollover_if_needed(session)

    resp = await client.get(f"/leagues/{league_id}/palmares", headers=alice)
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert len(body) == 1
    entry = body[0]
    assert entry["season_name"] == month_name(date.today())
    assert entry["champion"]["name"] == "Alice"
    assert entry["standings"][0]["position"] == 1
    assert entry["standings"][0]["is_champion"] is True
    assert entry["standings"][0]["games"] == RANKED_GAMES


async def test_palmares_requires_membership(client):
    alice = await _signup(client, "Alice")
    outsider = await _signup(client, "Mallory")

    resp = await client.post(
        "/leagues",
        json={"name": "Les Fléchettes du Dimanche", "privacy_level": "PRIVATE_CODE"},
        headers=alice,
    )
    league_id = resp.json()["id"]

    assert (await client.get(f"/leagues/{league_id}/palmares", headers=alice)).status_code == 200
    assert (await client.get(f"/leagues/{league_id}/palmares", headers=outsider)).status_code == 403


async def test_palmares_empty_before_any_close(client):
    alice = await _signup(client, "Alice")
    league_id = (await client.get("/leagues/mine", headers=alice)).json()[0]["id"]

    async with async_session() as session:
        await rollover_if_needed(session)

    resp = await client.get(f"/leagues/{league_id}/palmares", headers=alice)
    assert resp.status_code == 200
    assert resp.json() == []


# ─── Titre ────────────────────────────────────────────────────────────────────

async def test_champion_title_granted_once(client):
    alice = await _signup(client, "Alice")
    await _signup(client, "Bob")

    async with async_session() as session:
        for _ in range(2):
            await _play(client, "Alice", "Bob")
            season = await _open_season(session)
            await _end_season_now(session, season)
            await rollover_if_needed(session)

        held = (
            await session.execute(
                select(PlayerTitle).where(PlayerTitle.title_id == CHAMPION_TITLE)
            )
        ).scalars().all()
    assert len(held) == 1, "un seul PlayerTitle malgré deux sacres"

    titles = (await client.get("/players/me/titles", headers=alice)).json()
    assert CHAMPION_TITLE in {t["id"] for t in titles}


# ─── Ressource /seasons (C1) ──────────────────────────────────────────────────

async def test_current_season_exposes_id(client):
    """L'ancien /seasons/current renvoyait {active, name, …} sans id — un
    client ne pouvait donc filtrer aucune stat par saison. Le nouveau renvoie
    l'objet complet, id compris."""
    async with async_session() as session:
        await _open_season(session)

    resp = await client.get("/seasons/current")
    assert resp.status_code == 200
    body = resp.json()
    assert body is not None
    assert "id" in body and body["id"]
    assert body["is_active"] is True
    assert {"id", "name", "start_date", "end_date", "is_active"} <= set(body)


async def test_current_season_null_when_none(client):
    resp = await client.get("/seasons/current")
    assert resp.status_code == 200
    assert resp.json() is None


async def test_list_seasons_most_recent_first(client):
    """Deux saisons : une close, une active. Renvoyées la plus récente en tête,
    pour alimenter le sélecteur de période du dashboard."""
    async with async_session() as session:
        first = await _open_season(session)
        await _end_season_now(session, first)
        await rollover_if_needed(session)  # ferme first, ouvre la suivante

    resp = await client.get("/seasons")
    assert resp.status_code == 200
    seasons = resp.json()
    assert len(seasons) >= 2
    starts = [s["start_date"] for s in seasons if s["start_date"]]
    assert starts == sorted(starts, reverse=True)
    assert sum(1 for s in seasons if s["is_active"]) == 1
