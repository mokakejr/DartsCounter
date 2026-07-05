from fastapi import APIRouter

from app.routers import admin, auth, elo, games, leagues, live, players, stats, tournaments, webhooks

api_router = APIRouter()
api_router.include_router(admin.router)
api_router.include_router(auth.router)
api_router.include_router(elo.router)
api_router.include_router(games.router)
api_router.include_router(leagues.router)
api_router.include_router(live.router)
api_router.include_router(players.router)
api_router.include_router(stats.router)
api_router.include_router(tournaments.router)
api_router.include_router(webhooks.router)
