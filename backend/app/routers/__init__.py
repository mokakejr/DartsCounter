from fastapi import APIRouter

from app.routers import games, players, stats, webhooks

api_router = APIRouter()
api_router.include_router(games.router)
api_router.include_router(players.router)
api_router.include_router(stats.router)
api_router.include_router(webhooks.router)
