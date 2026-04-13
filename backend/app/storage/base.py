from abc import ABC, abstractmethod


class BaseStorage(ABC):

    @abstractmethod
    async def upload(self, file_bytes: bytes, destination: str, content_type: str) -> str:
        """Upload file and return its public URL."""
        pass

    @abstractmethod
    async def delete(self, destination: str) -> None:
        """Delete file by its path/key."""
        pass