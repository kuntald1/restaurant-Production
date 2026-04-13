import uuid
import os
from fastapi import UploadFile, HTTPException
from app.storage.factory import storage

ALLOWED_TYPES = {"image/jpeg", "image/png", "image/webp"}
MAX_SIZE_MB = 5


async def upload_image(file: UploadFile, folder: str) -> str:
    """
    folder examples: 'company/logo', 'company/qr', 'menu'
    Returns the public URL to store in DB.
    """
    if file.content_type not in ALLOWED_TYPES:
        raise HTTPException(status_code=400, detail="Only JPEG, PNG, WebP images are allowed")

    file_bytes = await file.read()

    if len(file_bytes) > MAX_SIZE_MB * 1024 * 1024:
        raise HTTPException(status_code=400, detail=f"File size must be under {MAX_SIZE_MB}MB")

    ext = os.path.splitext(file.filename)[-1].lower() or ".jpg"
    destination = f"{folder}/{uuid.uuid4().hex}{ext}"   # e.g. menu/a3f9c1....jpg

    url = await storage.upload(file_bytes, destination, file.content_type)
    return url


async def delete_image(url: str) -> None:
    """
    Strips base URL and deletes the file from storage.
    Call this before replacing an existing image.
    """
    from app.core.config import settings
    if settings.STORAGE_BACKEND == "local":
        destination = url.replace(f"{settings.BASE_URL}/static/", "")
    else:
        destination = url.replace(f"{settings.R2_PUBLIC_URL}/", "")
    await storage.delete(destination)