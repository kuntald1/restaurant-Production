import os
import aiofiles
from app.storage.base import BaseStorage
from app.core.config import settings


class LocalStorage(BaseStorage):

    def __init__(self):
        os.makedirs(settings.LOCAL_UPLOAD_DIR, exist_ok=True)

    async def upload(self, file_bytes: bytes, destination: str, content_type: str) -> str:
        full_path = os.path.join(settings.LOCAL_UPLOAD_DIR, destination)
        os.makedirs(os.path.dirname(full_path), exist_ok=True)

        async with aiofiles.open(full_path, "wb") as f:
            await f.write(file_bytes)

        return f"{settings.BASE_URL}/static/{destination}"

    async def delete(self, destination: str) -> None:
        full_path = os.path.join(settings.LOCAL_UPLOAD_DIR, destination)
        if os.path.exists(full_path):
            os.remove(full_path)