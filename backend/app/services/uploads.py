import io
import uuid
from pathlib import Path
from typing import Literal

from fastapi import UploadFile
from PIL import Image, UnidentifiedImageError

from app.core.config import get_settings

Slot = Literal["avatar", "flight"]
_MAX_DIMENSION = 1024


class InvalidImageError(ValueError):
    pass


async def save_image(upload: UploadFile, slot: Slot) -> str:
    """Validates, re-encodes (strips EXIF, caps dimensions) and stores an
    uploaded image under settings.upload_dir. Returns the path relative to
    upload_dir, e.g. 'avatars/<uuid>.webp' — never the raw upload bytes, so a
    malformed or oversized file can never reach disk as-is."""
    settings = get_settings()

    data = await upload.read()
    if len(data) > settings.max_upload_bytes:
        raise InvalidImageError(f"Image exceeds {settings.max_upload_bytes} bytes")

    try:
        image = Image.open(io.BytesIO(data))
        image.load()
    except UnidentifiedImageError as exc:
        raise InvalidImageError("File is not a valid image") from exc

    image = image.convert("RGBA") if image.mode in ("RGBA", "LA", "P") else image.convert("RGB")
    image.thumbnail((_MAX_DIMENSION, _MAX_DIMENSION))

    folder = f"{slot}s"
    target_dir = Path(settings.upload_dir) / folder
    target_dir.mkdir(parents=True, exist_ok=True)

    filename = f"{uuid.uuid4().hex}.webp"
    # No `exif=` passed through, so metadata is dropped rather than carried over.
    image.save(target_dir / filename, format="WEBP", quality=85)

    return f"{folder}/{filename}"
