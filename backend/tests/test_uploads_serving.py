"""G7 — service correct des uploads : type WebP explicite + cache immuable.

Sans ces réglages, /uploads renvoyait `application/octet-stream` (table
mimetypes de l'image Docker sans WebP) et aucun `Cache-Control` — donc 223 Ko
rechargés à chaque affichage d'un avatar.
"""

from pathlib import Path

from PIL import Image

from app.main import app


def _served_uploads_dir() -> Path:
    # Le montage /uploads est créé une fois à l'import de l'app, avec un dossier
    # fixe — la fixture _isolated_upload_dir (conftest) monkeypatche
    # settings.upload_dir mais PAS ce montage. On écrit donc là où StaticFiles
    # sert réellement, lu depuis le montage, pour éviter tout décalage.
    for route in app.routes:
        if getattr(route, "path", "") == "/uploads":
            return Path(route.app.directory)
    raise RuntimeError("montage /uploads introuvable")


async def test_upload_served_as_webp_and_immutable(client):
    upload_dir = _served_uploads_dir() / "avatars"
    upload_dir.mkdir(parents=True, exist_ok=True)
    probe = upload_dir / "probe_g7.webp"
    Image.new("RGB", (8, 8), (200, 30, 42)).save(probe, format="WEBP")
    try:
        resp = await client.get("/uploads/avatars/probe_g7.webp")
        assert resp.status_code == 200
        assert resp.headers["content-type"].startswith("image/webp")
        cache = resp.headers.get("cache-control", "")
        assert "immutable" in cache
        assert "max-age=31536000" in cache
    finally:
        probe.unlink(missing_ok=True)


async def test_missing_upload_is_not_cached(client):
    # Le cache long ne doit s'appliquer qu'aux fichiers réels (200), jamais à un
    # 404 — sinon le navigateur mémoriserait l'absence pendant un an.
    resp = await client.get("/uploads/avatars/does_not_exist_g7.webp")
    assert resp.status_code == 404
    assert "immutable" not in resp.headers.get("cache-control", "")
