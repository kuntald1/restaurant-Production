from app.core.config import settings
from app.storage.base import BaseStorage


def get_storage() -> BaseStorage:
    if settings.STORAGE_BACKEND == "r2":
        from app.storage.r2 import R2Storage
        return R2Storage()

    from app.storage.local import LocalStorage
    return LocalStorage()


# Singleton — one instance for the whole app lifecycle
storage = get_storage()