import mimetypes
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from starlette.types import Scope

from app.core.config import get_settings
from app.routers import api_router
from app.workers.scheduler import scheduler, setup_jobs

# La table mimetypes de l'image Docker de prod ne connaît pas WebP : sans ça,
# les avatars partent en `application/octet-stream` et le navigateur refuse de
# les afficher inline. On l'enregistre explicitement au démarrage.
mimetypes.add_type("image/webp", ".webp")


class _ImmutableStaticFiles(StaticFiles):
    """Sert /uploads avec un cache long. Les fichiers sont immuables par
    construction — le nom est un uuid, jamais réécrit sur place (cf.
    services/uploads.py) — donc un `immutable` d'un an évite au navigateur de
    redemander le même avatar à chaque page. Aujourd'hui : aucun Cache-Control,
    223 Ko rechargés à chaque affichage."""

    async def get_response(self, path: str, scope: Scope):
        response = await super().get_response(path, scope)
        if response.status_code == 200:
            response.headers["Cache-Control"] = "public, max-age=31536000, immutable"
        return response


@asynccontextmanager
async def lifespan(app: FastAPI):
    setup_jobs()
    scheduler.start()
    yield
    scheduler.shutdown(wait=False)


def create_app() -> FastAPI:
    app = FastAPI(title="DartsCounter API", lifespan=lifespan)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=get_settings().cors_origin_list,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.include_router(api_router)

    upload_dir = Path(get_settings().upload_dir)
    upload_dir.mkdir(parents=True, exist_ok=True)
    app.mount("/uploads", _ImmutableStaticFiles(directory=upload_dir), name="uploads")

    @app.get("/health")
    async def health() -> dict[str, str]:
        return {"status": "ok"}

    return app


app = create_app()
